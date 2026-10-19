import { createHash } from 'node:crypto';
import * as yaml from 'js-yaml';
import pLimit from 'p-limit';
import { Redis } from 'ioredis';
import { prisma } from '@ai-reviewer/db';
import {
  ReviewJobData,
  FileDiff,
  DiffChunk,
  parseUnifiedDiff,
  chunkFileDiff,
  isFileIgnored,
  estimateTokenCount,
  ReviewIssue,
  RepoConfig,
  RepoConfigSchema,
  Severity,
  Category,
  determineVerdict,
  ReviewIssueSchema,
  mergeInRepoConfig,
  isBot,
  generateStructuredPRSummary,
  enrichIssueSecurityMetadata,
  validateAndNormalizeCwe,
  validateAndNormalizeOwasp,
  inferValidatedTaxonomy,
  calculateExplainableRisk,
  generateSarifReport,
  validateSarifLog,
  evaluateSecurityGate,
  calculateIssueFingerprint,
  AuditAction,
  validateEvidenceIntegrity,
  isStyleNitpick,
  calibrateSeverity,
  calibrateConfidenceAndCertainty,
  detectAndDeduplicateFindings,
  buildTraceablePath,
  scanForMaliciousContent,
  ReviewLifecycleStage,
  StageExecutionStatus,
  ObservabilityErrorCategory,
  StageTimingRecord,
  ReviewLifecycleTrace,
  createStageTimingRecord,
  classifyErrorCategory,
} from '@ai-reviewer/shared';
import { getInstallationOctokit } from '../github/client.js';
import {
  createCheckRun,
  updateCheckRunProgress,
  completeCheckRun,
} from '../github/checks.js';
import {
  buildPRReviewPayload,
  postReviewToGitHub,
  findExistingSummaryComment,
  fetchOpenCommentFingerprints,
} from '../github/comments.js';
import { getLLMProvider, LLMProvider } from './llm.js';
import {
  runStaticAnalysis,
  runRealStaticAnalysis,
  ChangedFilePayload,
} from '../staticAnalysis/analyzer.js';
import { retrieveRelevantContext, RetrievedContext } from './context.js';
import { analyzeTestAwareness, TestAwareAnalysisResult } from './testAware.js';
import { scanDependenciesForVulnerabilities } from './dependencies.js';
import { validateSuggestedPatch } from './patchValidation.js';
import { applyEscalationPolicy } from './escalation.js';
import { sanitizeIssue, generateDeterministicSummaryLine, sanitizeText } from './sanitize.js';
import { createChildLogger } from '../logger.js';
import { metrics } from '../metrics.js';
import {
  checkDailyTokenBudget,
  reserveChunkTokenBudget,
  reconcileChunkTokenBudget,
} from '../queue/tokenBudget.js';
import { HeadShaChangedError } from '../queue/idempotency.js';

const SEVERITY_LEVELS: Record<Severity, number> = {
  critical: 3,
  warning: 2,
  suggestion: 1,
};

export interface ProcessReviewJobOptions {
  octokitOverride?: any;
  llmProviderOverride?: LLMProvider;
  botUserId?: number;
}

export async function processReviewJob(
  jobData: ReviewJobData,
  mockDiffOverride?: string,
  redisClient?: Redis,
  jobId?: string | number,
  options?: ProcessReviewJobOptions
): Promise<{ reviewId: number; issuesCount: number; skipped?: boolean; status?: string }> {
  const startTime = Date.now();
  const deliveryId = (jobData as any).deliveryId || (jobData as any).delivery_id;
  const correlationId =
    jobData.correlationId ||
    deliveryId ||
    (jobId ? `c-${jobId}` : `c-unknown-${Date.now()}`);
  const retryCount = jobData.retryCount ?? 0;

  const stageTimings: Record<ReviewLifecycleStage, StageTimingRecord> = {
    ...(jobData.stageTimings || {}),
  } as any;

  let currentStageName: ReviewLifecycleStage = 'repository_fetch';
  let currentStageStartTime = Date.now();
  let review: any = null;

  const jobLogger = createChildLogger({
    correlation_id: correlationId,
    delivery_id: deliveryId,
    job_id: jobId,
    installation_id: jobData.installationId,
    repo: jobData.repoFullName,
    pr_number: jobData.prNumber,
    commit_sha: jobData.commitSha,
    retry_count: retryCount,
  });

  const recordStage = (
    stage: ReviewLifecycleStage,
    durationMs: number,
    status: StageExecutionStatus = 'success',
    errorCategory?: ObservabilityErrorCategory,
    metadata?: Record<string, unknown>
  ): StageTimingRecord => {
    const record = createStageTimingRecord({
      stage,
      durationMs,
      status,
      errorCategory: errorCategory || (status === 'failed' ? 'unknown' : 'none'),
      retryCount,
      jobId: String(jobId || 'unknown'),
      reviewId: review?.id ?? null,
      repositoryId: repo?.id ?? jobData.repoId ?? null,
      commitSha: jobData.commitSha,
      correlationId,
      startedAt: currentStageStartTime,
      completedAt: Date.now(),
      metadata,
    });
    stageTimings[stage] = record;
    metrics.recordStageExecution(stage, durationMs, status, errorCategory);

    jobLogger.info({
      event: 'stage_transition',
      stage,
      status,
      duration_ms: durationMs,
      error_category: record.errorCategory,
      correlation_id: correlationId,
      job_id: jobId,
      review_id: review?.id ?? null,
      repository_id: repo?.id ?? null,
      commit_sha: jobData.commitSha,
      retry_count: retryCount,
    });

    return record;
  };

  jobLogger.info({
    commit_sha: jobData.commitSha,
    msg: 'Starting review job processing',
  });

  // 1. Fetch or upsert Repository & Installation from jobData
  let repo: any = null;

  if (jobData.repoId) {
    repo = await prisma.repository.findUnique({
      where: { id: jobData.repoId },
      include: { installation: true },
    });
  }

  if (!repo && jobData.githubRepoId) {
    repo = await prisma.repository.findUnique({
      where: { githubRepoId: BigInt(jobData.githubRepoId) },
      include: { installation: true },
    });
  }

  if (!repo && jobData.githubRepoId && jobData.installationId) {
    const dbInstallation = await prisma.installation.upsert({
      where: { githubInstallationId: BigInt(jobData.installationId) },
      update: {
        accountLogin: jobData.ownerLogin || jobData.repoFullName.split('/')[0] || 'unknown',
        accountType: jobData.ownerType || 'User',
      },
      create: {
        githubInstallationId: BigInt(jobData.installationId),
        accountLogin: jobData.ownerLogin || jobData.repoFullName.split('/')[0] || 'unknown',
        accountType: jobData.ownerType || 'User',
      },
    });

    repo = await prisma.repository.upsert({
      where: { githubRepoId: BigInt(jobData.githubRepoId) },
      update: {
        fullName: jobData.repoFullName,
        defaultBranch: jobData.defaultBranch || 'main',
      },
      create: {
        installationId: dbInstallation.id,
        githubRepoId: BigInt(jobData.githubRepoId),
        fullName: jobData.repoFullName,
        defaultBranch: jobData.defaultBranch || 'main',
      },
      include: { installation: true },
    });
  }

  if (!repo) {
    throw new Error(`Repository with ID ${jobData.repoId || jobData.githubRepoId} not found in database.`);
  }

  // 2. Parse repo config from DB; fall back to defaults on invalid config (Requirement 16)
  let config: RepoConfig;
  const parsedStoredConfig = RepoConfigSchema.safeParse(repo.config || {});
  if (parsedStoredConfig.success) {
    config = parsedStoredConfig.data;
  } else {
    jobLogger.warn({
      err: parsedStoredConfig.error.message,
      msg: 'Stored repo config is invalid, falling back to defaults',
    });
    config = RepoConfigSchema.parse({});
  }

  const [owner, repoName] = repo.fullName.split('/');
  const octokit = options?.octokitOverride ?? getInstallationOctokit(jobData.installationId);

  // Check for optional in-repo .aireview.yml / .aireview.yaml (Item 7)
  // In-repo config must be read from the BASE branch or default branch, never from the PR head.
  // It may only tighten the dashboard config; merge only keys that the file actually sets.
  if (octokit && owner && repoName) {
    const inRepoRef = jobData.baseBranch || repo.defaultBranch || 'main';
    for (const configFileName of ['.aireview.yml', '.aireview.yaml']) {
      try {
        const fileRes = await octokit.rest.repos.getContent({
          owner,
          repo: repoName,
          path: configFileName,
          ref: inRepoRef,
        });

        if ('content' in fileRes.data && fileRes.data.content) {
          const rawYaml = Buffer.from(fileRes.data.content, 'base64').toString('utf8');
          const parsedYaml = yaml.load(rawYaml);
          if (parsedYaml && typeof parsedYaml === 'object') {
            jobLogger.info({
              config_file: configFileName,
              ref: inRepoRef,
              msg: `Merging in-repo config from ${configFileName} (ref: ${inRepoRef})`,
            });
            config = mergeInRepoConfig(config, parsedYaml);
            break;
          }
        }
      } catch {
        // File does not exist in repo; continue normally
      }
    }
  }

  // Check if drafts should be skipped
  if (config.skip_drafts !== false && jobData.draft === true) {
    jobLogger.info({
      pr_number: jobData.prNumber,
      repo: jobData.repoFullName,
      msg: `Skipping draft PR #${jobData.prNumber} on ${jobData.repoFullName}`,
    });
    return { reviewId: 0, issuesCount: 0, skipped: true };
  }

  // Check if bot authors should be skipped
  // Item 10: Use one shared isBot() everywhere; match the user type or a trailing "[bot]", never substring "bot"
  const isBotAuthor = isBot({ type: jobData.authorType, login: jobData.author });
  if (config.skip_bot_authors !== false && isBotAuthor) {
    jobLogger.info({
      pr_number: jobData.prNumber,
      author: jobData.author,
      repo: jobData.repoFullName,
      msg: `Skipping bot-authored PR #${jobData.prNumber} by ${jobData.author} on ${jobData.repoFullName}`,
    });
    return { reviewId: 0, issuesCount: 0, skipped: true };
  }

  // Record Stage 5: repository_fetch
  recordStage('repository_fetch', Date.now() - currentStageStartTime, 'success', 'none');
  currentStageName = 'diff_generation';
  currentStageStartTime = Date.now();

  // Find or create PullRequest in DB
  const pullRequest = await prisma.pullRequest.upsert({
    where: {
      repositoryId_githubPrNumber: {
        repositoryId: repo.id,
        githubPrNumber: jobData.prNumber,
      },
    },
    update: {
      title: jobData.title || undefined,
      author: jobData.author || undefined,
      headSha: jobData.commitSha,
    },
    create: {
      repositoryId: repo.id,
      githubPrNumber: jobData.prNumber,
      title: jobData.title || `PR #${jobData.prNumber}`,
      author: jobData.author || 'contributor',
      state: 'open',
      headSha: jobData.commitSha,
    },
  });

  // 3. Idempotency Check (Requirement 14)
  const existingCompletedReview = await prisma.review.findFirst({
    where: {
      pullRequestId: pullRequest.id,
      commitSha: jobData.commitSha,
      status: 'completed',
    },
  });

  if (existingCompletedReview) {
    jobLogger.info({
      commit_sha: jobData.commitSha,
      pr_number: jobData.prNumber,
      msg: `Review already completed for commit ${jobData.commitSha.substring(0, 7)} on PR #${jobData.prNumber}. Skipping.`,
    });
    return { reviewId: existingCompletedReview.id, issuesCount: 0 };
  }

  // 4. Verify PR Head SHA: Treat failed head-SHA verification as retryable error (Item 20)
  let prDetails: any = null;
  if (octokit && owner && repoName) {
    try {
      prDetails = await octokit.rest.pulls.get({
        owner,
        repo: repoName,
        pull_number: jobData.prNumber,
      });
    } catch (prErr) {
      jobLogger.warn({ err: (prErr as Error).message, msg: 'Could not verify PR head SHA via GitHub API' });
    }

    if (prDetails && prDetails.data.head.sha !== jobData.commitSha) {
      jobLogger.warn({
        current_head_sha: prDetails.data.head.sha,
        job_commit_sha: jobData.commitSha,
        msg: `PR #${jobData.prNumber} head SHA changed (${jobData.commitSha.substring(0, 7)} -> ${prDetails.data.head.sha.substring(0, 7)}). Treating as retryable error.`,
      });
      throw new HeadShaChangedError(jobData.commitSha, prDetails.data.head.sha);
    }
  }

  // 5. Create or Upsert Review row in DB with status: 'pending' (Requirement 14)
  let checkRunId: number | null = null;
  if (octokit && owner && repoName) {
    checkRunId = await createCheckRun(octokit, owner, repoName, jobData.commitSha);
  }

  review = await prisma.review.upsert({
    where: {
      pullRequestId_commitSha: {
        pullRequestId: pullRequest.id,
        commitSha: jobData.commitSha,
      },
    },
    update: {
      status: 'pending',
      stage: 'QUEUED',
      checkRunId: checkRunId ? BigInt(checkRunId) : undefined,
      startedAt: new Date(),
      completedAt: null,
      summary: null,
    },
    create: {
      pullRequestId: pullRequest.id,
      commitSha: jobData.commitSha,
      status: 'pending',
      stage: 'QUEUED',
      checkRunId: checkRunId ? BigInt(checkRunId) : null,
    },
  });

  // Record review.started audit log
  await prisma.auditLog.create({
    data: {
      installationId: repo?.installationId ?? null,
      actor: 'worker',
      actorRole: 'SYSTEM',
      action: AuditAction.REVIEW_STARTED,
      resourceType: 'review',
      resourceId: String(review.id),
      metadata: {
        prNumber: jobData.prNumber,
        commitSha: jobData.commitSha,
        repo: jobData.repoFullName,
      },
    },
  }).catch(() => {});

  const reviewLogger = jobLogger.child({ review_id: review.id });

  const updateStage = async (newStage: string) => {
    try {
      const dataToUpdate: Record<string, unknown> = { stage: newStage };
      if (
        ['FETCHING DIFF', 'STATIC ANALYSIS', 'CONTEXT BUILDING', 'AI ANALYSIS', 'VALIDATING'].includes(
          newStage
        )
      ) {
        dataToUpdate.status = 'processing';
      } else if (newStage === 'POSTING') {
        dataToUpdate.status = 'posting';
      } else if (newStage === 'COMPLETED') {
        dataToUpdate.status = 'completed';
      }
      await prisma.review.update({
        where: { id: review.id },
        data: dataToUpdate,
      });
      if (octokit && owner && repoName && checkRunId) {
        await updateCheckRunProgress(octokit, owner, repoName, checkRunId, newStage);
      }
    } catch (stageErr) {
      reviewLogger.warn({ stage: newStage, err: (stageErr as Error).message, msg: 'Failed to update review stage' });
    }
  };

  try {
    await updateStage('FETCHING DIFF');
    const skippedNotes: string[] = [];
    const partialSkips: string[] = [];
    const filesToChunk: FileDiff[] = [];
    const filesForRealStatic: ChangedFilePayload[] = [];
    const validLinesMap = new Map<string, Set<number>>();
    const fileLineContentMap = new Map<string, Map<number, string>>();
    const unanchoredIssues: ReviewIssue[] = [];

    let totalLinesProcessed = 0;

    let changedFilesList: Array<{
      filename: string;
      previous_filename?: string;
      status: string;
      patch?: string;
    }> = [];

    if (mockDiffOverride) {
      // Test/Simulation mode diff
      const parsed = parseUnifiedDiff(mockDiffOverride);
      filesToChunk.push(...parsed);
      for (const pf of parsed) {
        totalLinesProcessed += pf.hunks.reduce((acc, h) => acc + h.addedLineNumbers.length, 0);
        const lineMap = fileLineContentMap.get(pf.newPath) || new Map<number, string>();
        for (const hunk of pf.hunks) {
          let lineNum = hunk.newStart;
          for (const line of hunk.lines) {
            if (line.startsWith('+') || line.startsWith(' ') || line === '') {
              lineMap.set(
                lineNum,
                line.startsWith('+') || line.startsWith(' ') ? line.substring(1) : line
              );
              lineNum++;
            }
          }
        }
        fileLineContentMap.set(pf.newPath, lineMap);
        const validSet = validLinesMap.get(pf.newPath) || new Set<number>();
        for (const hunk of pf.hunks) {
          for (const vl of hunk.validNewLines) validSet.add(vl);
        }
        validLinesMap.set(pf.newPath, validSet);

        // Synthesize content for real static analysis & context retrieval
        const maxLine = Math.max(0, ...Array.from(lineMap.keys()));
        const linesArr: string[] = [];
        for (let i = 1; i <= maxLine; i++) {
          linesArr.push(lineMap.get(i) || '');
        }
        filesForRealStatic.push({
          path: pf.newPath,
          content: linesArr.join('\n'),
        });
      }
    } else {
      if (!octokit || !owner || !repoName) {
        throw new Error(
          `Cannot fetch changed files: GitHub Octokit client not configured for installation ${jobData.installationId}.`
        );
      }

      // Check if incremental diff applies since last reviewed SHA (Requirement 12)
      const lastCompletedReview = await prisma.review.findFirst({
        where: {
          pullRequestId: pullRequest.id,
          status: 'completed',
          commitSha: { not: jobData.commitSha },
        },
        orderBy: { completedAt: 'desc' },
      });

      if (lastCompletedReview) {
        reviewLogger.info({
          prev_commit_sha: lastCompletedReview.commitSha.substring(0, 7),
          curr_commit_sha: jobData.commitSha.substring(0, 7),
          msg: 'Re-review detected. Comparing incremental diff',
        });
        try {
          const comp = await octokit.rest.repos.compareCommitsWithBasehead({
            owner,
            repo: repoName,
            basehead: `${lastCompletedReview.commitSha}...${jobData.commitSha}`,
          });
          changedFilesList = (comp.data.files || []).map((f: any) => ({
            filename: f.filename,
            previous_filename: f.previous_filename,
            status: f.status,
            patch: f.patch,
          }));
        } catch (compErr) {
          reviewLogger.warn({
            err: (compErr as Error).message,
            msg: 'Incremental comparison failed, falling back to full PR listFiles',
          });
          changedFilesList = [];
        }
      }

      if (changedFilesList.length === 0) {
        reviewLogger.info({ msg: 'Fetching changed files using paginated pulls.listFiles' });
        const listFilesResponse = await octokit.paginate(octokit.rest.pulls.listFiles, {
          owner,
          repo: repoName,
          pull_number: jobData.prNumber,
          per_page: 100,
        });
        changedFilesList = listFilesResponse.map((f: any) => ({
          filename: f.filename,
          previous_filename: f.previous_filename,
          status: f.status,
          patch: f.patch,
        }));
      }

      // 6. Filter deleted files, ignored globs, and cap files & lines (Requirements 6 & 7)
      const maxFiles = config.max_files_per_pr || 50;
      const maxLines = config.max_lines_per_pr || 1000;
      let filesCount = 0;

      for (const file of changedFilesList) {
        // Skip deleted files (Requirement 6)
        if (file.status === 'removed') {
          skippedNotes.push(`Deleted file skipped: ${file.filename}`);
          continue;
        }

        // Skip ignored globs via picomatch (Requirement 16)
        if (isFileIgnored(file.filename, config.ignored_globs || [])) {
          skippedNotes.push(`Ignored pattern matched: ${file.filename}`);
          continue;
        }

        // Cap files per PR (Requirement 7)
        if (filesCount >= maxFiles) {
          const capMsg = `File cap reached (${maxFiles} files). Skipped remaining file: ${file.filename}`;
          skippedNotes.push(capMsg);
          partialSkips.push(capMsg);
          continue;
        }

        // Item 8: For files GitHub returns without a patch, fetch the blob and diff it yourself,
        // or mark the review partial and say so in the summary.
        if (!file.patch) {
          let diffed = false;
          try {
            let baseText: string | null = null;
            try {
              const baseRes = await octokit.rest.repos.getContent({
                owner,
                repo: repoName,
                path: file.previous_filename || file.filename,
                ref: jobData.baseBranch || repo.defaultBranch || 'main',
              });
              if ('content' in baseRes.data && baseRes.data.content) {
                baseText = Buffer.from(baseRes.data.content, 'base64').toString('utf8');
              }
            } catch {
              // Base file does not exist (e.g. newly added file)
            }

            const headRes = await octokit.rest.repos.getContent({
              owner,
              repo: repoName,
              path: file.filename,
              ref: jobData.commitSha,
            });

            if ('content' in headRes.data && headRes.data.content) {
              const headText = Buffer.from(headRes.data.content, 'base64').toString('utf8');
              if (baseText === headText) {
                diffed = true;
                continue;
              } else if (baseText === null) {
                // Newly added file without patch: synthesize added lines diff
                const headLines = headText.split('\n');
                file.patch = `@@ -0,0 +1,${headLines.length} @@\n` + headLines.map((l) => `+${l}`).join('\n');
                diffed = true;
              }
            }
          } catch {
            // Content fetching or diffing failed
          }

          if (!diffed) {
            const patchMsg = `File missing patch from GitHub could not be diffed: ${file.filename}`;
            skippedNotes.push(patchMsg);
            partialSkips.push(patchMsg);
            continue;
          }
        }

        // Construct standard diff string for parser
        const syntheticDiff = `diff --git a/${file.previous_filename || file.filename} b/${file.filename}\n--- a/${file.previous_filename || file.filename}\n+++ b/${file.filename}\n${file.patch}\n`;
        const parsedFiles = parseUnifiedDiff(syntheticDiff);

        for (const pf of parsedFiles) {
          // Populate line content map for stable fingerprinting (Item 12)
          const lineMap = fileLineContentMap.get(pf.newPath) || new Map<number, string>();
          for (const hunk of pf.hunks) {
            let lineNum = hunk.newStart;
            for (const line of hunk.lines) {
              if (line.startsWith('+') || line.startsWith(' ') || line === '') {
                lineMap.set(
                  lineNum,
                  line.startsWith('+') || line.startsWith(' ') ? line.substring(1) : line
                );
                lineNum++;
              }
            }
          }
          fileLineContentMap.set(pf.newPath, lineMap);

          // Count added lines in file
          const addedLinesCount = pf.hunks.reduce((acc, h) => acc + h.addedLineNumbers.length, 0);

          if (totalLinesProcessed + addedLinesCount > maxLines) {
            const lineCapMsg = `Line cap reached (${maxLines} lines). Skipped ${file.filename} (+${addedLinesCount} lines).`;
            skippedNotes.push(lineCapMsg);
            partialSkips.push(lineCapMsg);
            continue;
          }

          totalLinesProcessed += addedLinesCount;
          filesCount++;
          filesToChunk.push(pf);

          // Populate valid lines map
          const validSet = validLinesMap.get(pf.newPath) || new Set<number>();
          for (const hunk of pf.hunks) {
            for (const vl of hunk.validNewLines) validSet.add(vl);
          }
          validLinesMap.set(pf.newPath, validSet);
        }

        // Fetch file content for real static analysis (Requirement 15)
        try {
          const contentRes = await octokit.rest.repos.getContent({
            owner,
            repo: repoName,
            path: file.filename,
            ref: jobData.commitSha,
          });
          if ('content' in contentRes.data && contentRes.data.content) {
            filesForRealStatic.push({
              path: file.filename,
              content: Buffer.from(contentRes.data.content, 'base64').toString('utf8'),
            });
          }
        } catch {
          // If fetching full content fails, continue
        }
      }
    }

    // 7. Chunk by token budget and split oversized hunks (Requirement 7)
    const allChunks: DiffChunk[] = [];
    for (const file of filesToChunk) {
      const chunks = chunkFileDiff(file, 1800);
      for (const chunk of chunks) {
        // Skip chunks with no added lines (Requirement 6)
        if (chunk.addedLines.length === 0) {
          skippedNotes.push(`Chunk in ${chunk.filePath} had no added lines; skipped LLM call.`);
          continue;
        }
        allChunks.push(chunk);
      }
    }

    reviewLogger.info({
      chunks_count: allChunks.length,
      files_count: filesToChunk.length,
      msg: 'Prepared diff chunks for analysis',
    });

    // Record Stage 6: diff_generation
    recordStage('diff_generation', Date.now() - currentStageStartTime, 'success', 'none', {
      files_count: filesToChunk.length,
      lines_count: totalLinesProcessed,
      chunks_count: allChunks.length,
    });
    currentStageName = 'static_analysis';
    currentStageStartTime = Date.now();

    let staticToolsRan = false;
    await updateStage('STATIC ANALYSIS');
    // 8. Run Static Analysis (Requirement 15)
    const allRawIssues: ReviewIssue[] = [];

    // Run secret regex rules on chunks via shared getAddedLines
    for (const chunk of allChunks) {
      const staticIssues = runStaticAnalysis(chunk);
      for (const si of staticIssues) {
        const lineContent = fileLineContentMap.get(si.file_path)?.get(si.line_number) || '';
        allRawIssues.push(sanitizeIssue(si, lineContent));
      }
    }

    // Run real tools (ESLint, Ruff, Bandit) with guaranteed cleanup and partial review tracking (Item 18)
    if (filesForRealStatic.length > 0) {
      reviewLogger.info({ files_count: filesForRealStatic.length, msg: 'Running real static analysis tools' });
      const {
        issues: realStaticIssues,
        summaryNotes: staticNotes,
        isPartial: staticPartial,
      } = await runRealStaticAnalysis(filesForRealStatic, { validLinesMap });
      for (const rsi of realStaticIssues) {
        const lineContent = fileLineContentMap.get(rsi.file_path)?.get(rsi.line_number) || '';
        allRawIssues.push(sanitizeIssue(rsi, lineContent));
      }
      for (const note of staticNotes) {
        skippedNotes.push(note);
      }
      if (staticPartial) {
        partialSkips.push(...staticNotes);
      }
    }
    staticToolsRan = true;

    // 8b. Deterministic Dependency Vulnerability Scanning (Phase 6 Requirement 9)
    const dependencyFindings: ReviewIssue[] = [];
    for (const f of filesForRealStatic) {
      const depIssues = scanDependenciesForVulnerabilities({
        filePath: f.path,
        fileContent: f.content,
      });
      for (const di of depIssues) {
        dependencyFindings.push(di);
        allRawIssues.push(di);
      }
    }
    if (dependencyFindings.length > 0) {
      reviewLogger.info({
        dependency_issues: dependencyFindings.length,
        msg: `Identified ${dependencyFindings.length} deterministic dependency vulnerability finding(s)`,
      });
    }

    // Record Stage 7: static_analysis
    recordStage('static_analysis', Date.now() - currentStageStartTime, 'success', 'none', {
      static_issues_count: allRawIssues.length,
      dependency_findings: dependencyFindings.length,
    });
    currentStageName = 'llm_analysis';
    currentStageStartTime = Date.now();

    await updateStage('CONTEXT BUILDING');
    // Context Retrieval & Test-Aware Review (Phase 6 Requirements 1 & 4)
    const fileContextMap = new Map<string, RetrievedContext>();
    let overallTestAwareness: TestAwareAnalysisResult | null = null;
    const allRepoFiles = filesForRealStatic.map((f) => ({ path: f.path, content: f.content }));

    for (const file of filesToChunk) {
      const addedLinesInFile = file.hunks.flatMap((h) => h.addedLineNumbers);
      const fileContent = filesForRealStatic.find((f) => f.path === file.newPath)?.content || '';
      const retrieved = retrieveRelevantContext({
        changedFilePath: file.newPath,
        changedLines: addedLinesInFile,
        fileContent,
        allRepoFiles,
      });
      fileContextMap.set(file.newPath, retrieved);

      const testAware = analyzeTestAwareness({
        changedFilePath: file.newPath,
        changedLines: addedLinesInFile,
        fileContent,
        allRepoFiles,
        issues: allRawIssues,
      });
      if (!overallTestAwareness) {
        overallTestAwareness = testAware;
      } else {
        overallTestAwareness.changedFunctions.push(...testAware.changedFunctions);
        overallTestAwareness.coveredFunctions.push(...testAware.coveredFunctions);
        overallTestAwareness.untestedFunctions.push(...testAware.untestedFunctions);
        overallTestAwareness.testRecommendations.push(...testAware.testRecommendations);
        if (!testAware.hasTestCoverage) overallTestAwareness.hasTestCoverage = false;
      }
    }

    // Check Per-Installation Daily Token Budget (Requirement 19)
    let skipLlmDueToBudget = false;
    if (redisClient && jobData.installationId) {
      const budgetCheck = await checkDailyTokenBudget(
        redisClient,
        jobData.installationId
      );
      if (!budgetCheck.allowed) {
        skipLlmDueToBudget = true;
        const budgetMsg = `Daily token budget exceeded for installation ${jobData.installationId} (${budgetCheck.currentTokens}/${budgetCheck.limit} tokens used). Automated LLM inspection skipped.`;
        reviewLogger.warn({
          installation_id: jobData.installationId,
          current_tokens: budgetCheck.currentTokens,
          limit: budgetCheck.limit,
          msg: budgetMsg,
        });
        skippedNotes.push(budgetMsg);
        partialSkips.push(budgetMsg);
      }
    }

    // 9. LLM Calls with bounded parallelism (p-limit, default 4) (Requirement 8)
    const llmProvider = options?.llmProviderOverride ?? getLLMProvider();
    const concurrency = parseInt(process.env.LLM_CONCURRENCY || '4', 10);
    const limit = pLimit(concurrency);
    const assessments: string[] = [];

    let droppedInvalidPath = 0;
    let droppedNotAddedLine = 0;
    let droppedLowConfidence = 0;
    let droppedMalformed = 0;
    let droppedFabricatedEvidence = 0;
    let droppedStyleNitpick = 0;

    const confidenceThreshold = config.confidence_threshold ?? 0.7;

    let allChunksSucceeded = false;
    let budgetExhaustedMidJob = false;

    if (!skipLlmDueToBudget && allChunks.length > 0) {
      await updateStage('AI ANALYSIS');
      const chunkReviewPromises = allChunks.map((chunk) =>
        limit(async () => {
          if (budgetExhaustedMidJob) {
            const skipMsg = `Chunk in ${chunk.filePath} (chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks || allChunks.length}) skipped: daily token budget exhausted mid-job.`;
            skippedNotes.push(skipMsg);
            partialSkips.push(skipMsg);
            return;
          }

          const estimated = chunk.estimatedTokens || estimateTokenCount(chunk.diff);
          let reservedTokens = 0;

          // Enforce daily budget per chunk: reserve before the call (Item 16)
          if (redisClient && jobData.installationId) {
            const reservation = await reserveChunkTokenBudget(
              redisClient,
              jobData.installationId,
              estimated
            );

            if (!reservation.allowed) {
              budgetExhaustedMidJob = true;
              const exhaustMsg = `Daily token budget exhausted mid-job for installation ${jobData.installationId} (${reservation.currentTokens}/${reservation.limit} tokens used). Stopped review at ${chunk.filePath}.`;
              reviewLogger.warn({
                installation_id: jobData.installationId,
                current_tokens: reservation.currentTokens,
                limit: reservation.limit,
                msg: exhaustMsg,
              });
              skippedNotes.push(exhaustMsg);
              partialSkips.push(exhaustMsg);
              return;
            }
            reservedTokens = reservation.reserved;
          }

          try {
            const llmCallStart = Date.now();
            const fileCtx = fileContextMap.get(chunk.filePath);
            const llmResult = await llmProvider.reviewChunk(chunk, {
              prTitle: jobData.title,
              prDescription: prDetails?.data?.body || undefined,
              includePrContext: chunk.chunkIndex === 0,
              codeContextSnippet: fileCtx?.promptSnippet,
            });
            const llmCallDuration = Date.now() - llmCallStart;
            metrics.recordLlmCall(llmCallDuration);

            // Record real token usage from API responses (Item 16)
            const actualTokens = llmResult.usage?.totalTokens ?? estimated;
            metrics.recordTokens(actualTokens);

            // Reconcile after the call (Item 16)
            if (redisClient && jobData.installationId && reservedTokens > 0) {
              await reconcileChunkTokenBudget(
                redisClient,
                jobData.installationId,
                reservedTokens,
                actualTokens
              );
            }

            if (llmResult.overall_assessment) {
              assessments.push(llmResult.overall_assessment);
            }

            // Validate each issue individually with safeParse
            for (const rawIssue of llmResult.issues) {
              const parseCheck = ReviewIssueSchema.safeParse(rawIssue);
              if (!parseCheck.success) {
                droppedMalformed++;
                continue;
              }

              const issue = parseCheck.data;

              // Drop if file_path is not this chunk's file
              if (issue.file_path !== chunk.filePath) {
                droppedInvalidPath++;
                continue;
              }

              // Check for prompt injection / malicious manipulation
              const maliciousCheck = scanForMaliciousContent(issue.message);
              if (maliciousCheck.isMalicious) {
                issue.severity = 'critical';
                issue.category = 'security';
                issue.cwe = maliciousCheck.cwe || 'CWE-94';
                issue.owasp = maliciousCheck.owasp as any;
                issue.reasoning = maliciousCheck.details;
              }

              // Drop style nitpicks unless explicitly configured (Rule 4)
              if (!config.include_style_nitpicks && isStyleNitpick(issue)) {
                droppedStyleNitpick++;
                continue;
              }

              // Drop if confidence is below threshold
              if ((issue.confidence ?? 1.0) < confidenceThreshold) {
                droppedLowConfidence++;
                continue;
              }

              // Drop if line_number is completely out-of-range of the chunk
              if (!chunk.validLines.includes(issue.line_number)) {
                droppedNotAddedLine++;
                continue;
              }

              // Evidence validation & anti-hallucination check (Rules 12 & 13)
              const lineContent = fileLineContentMap.get(issue.file_path)?.get(issue.line_number) || '';
              const evidenceCheck = validateEvidenceIntegrity(issue, lineContent);
              if (!evidenceCheck.isValid) {
                droppedFabricatedEvidence++;
                continue;
              }
              if (evidenceCheck.normalizedEvidence) {
                issue.evidence = evidenceCheck.normalizedEvidence;
              }

              // Item 13: Drop-or-record: an issue that can't be anchored inline goes into
              // a "findings outside the diff" section of the summary and keeps its place in the verdict.
              const isAnchored = chunk.addedLines.includes(issue.line_number);
              const sanitized = sanitizeIssue(issue, lineContent);

              if (!isAnchored) {
                unanchoredIssues.push(sanitized);
              }

              allRawIssues.push(sanitized);
            }
          } catch (chunkErr) {
            metrics.recordLlmFailure();
            if (redisClient && jobData.installationId && reservedTokens > 0) {
              await reconcileChunkTokenBudget(
                redisClient,
                jobData.installationId,
                reservedTokens,
                0
              );
            }
            throw chunkErr;
          }
        })
      );

      await Promise.all(chunkReviewPromises);
      allChunksSucceeded = !budgetExhaustedMidJob;
    } else if (allChunks.length === 0) {
      allChunksSucceeded = true;
    }

    const totalDropped =
      droppedMalformed +
      droppedInvalidPath +
      droppedNotAddedLine +
      droppedLowConfidence +
      droppedFabricatedEvidence +
      droppedStyleNitpick;
    if (totalDropped > 0) {
      metrics.recordDroppedIssues(totalDropped);
      reviewLogger.info({
        dropped_invalid_issues: totalDropped,
        dropped_malformed: droppedMalformed,
        dropped_path: droppedInvalidPath,
        dropped_low_confidence: droppedLowConfidence,
        dropped_fabricated_evidence: droppedFabricatedEvidence,
        dropped_style_nitpick: droppedStyleNitpick,
        msg: `Dropped ${totalDropped} invalid/low-signal issue(s)`,
      });
    }

    // Record Stage 8: llm_analysis
    recordStage(
      'llm_analysis',
      Date.now() - currentStageStartTime,
      skipLlmDueToBudget ? 'skipped' : 'success',
      'none',
      {
        chunks_count: allChunks.length,
        dropped_issues_count: totalDropped,
      }
    );
    currentStageName = 'finding_validation';
    currentStageStartTime = Date.now();

    await updateStage('VALIDATING');
    // 10. Filter issues by configuration threshold & disabled categories
    const thresholdScore = SEVERITY_LEVELS[config.severity_threshold || 'suggestion'];
    const filteredIssues = allRawIssues.filter((issue) => {
      if (config.disabled_categories?.includes(issue.category)) {
        return false;
      }
      const issueScore = SEVERITY_LEVELS[issue.severity] || 1;
      return issueScore >= thresholdScore;
    });

    // 11. Deduplicate using exact fingerprint and proximity/semantic window deduplication
    const dedupResult = detectAndDeduplicateFindings(filteredIssues);
    const deduplicatedIssues: ReviewIssue[] = dedupResult.deduplicated;

    // Phase 6 Post-Processing: Controlled Taxonomies, Calibration, Risk, Patch Validation & Escalation
    const staticIssueFingerprints = new Set(
      allRawIssues.filter((i) => i.source === 'static_analysis' || i.source === 'dependency_scan').map((i) => `${i.file_path}:${i.line_number}`)
    );

    const postProcessedIssues: ReviewIssue[] = [];
    for (let issue of deduplicatedIssues) {
      const lineMap = fileLineContentMap.get(issue.file_path);
      const lineContent = lineMap?.get(issue.line_number) || issue.evidence || '';

      // 1. Controlled Taxonomies (CWE / OWASP)
      const validCwe = validateAndNormalizeCwe(issue.cwe);
      const validOwasp = validateAndNormalizeOwasp(issue.owasp);
      if (validCwe) {
        issue.cwe = validCwe.id;
        issue.owasp = validOwasp || validCwe.owasp;
      } else {
        const inferred = inferValidatedTaxonomy(
          issue.message,
          issue.category,
          issue.affected_code || issue.current_code || undefined
        );
        issue.cwe = inferred.cwe;
        issue.owasp = validOwasp || inferred.owasp;
      }

      // 2. Calibrate Severity & Confidence
      issue.severity = calibrateSeverity(issue.category, issue.message, issue.cwe, lineContent);

      const isStaticCorroborated = staticIssueFingerprints.has(`${issue.file_path}:${issue.line_number}`);
      const isAnchored = validLinesMap.get(issue.file_path)?.has(issue.line_number) ?? true;
      const calib = calibrateConfidenceAndCertainty(
        issue,
        isStaticCorroborated,
        isAnchored,
        confidenceThreshold
      );
      issue.calibrated_confidence = calib.calibratedConfidence;
      issue.certainty = isStaticCorroborated ? 'confirmed' : calib.certainty;

      // 3. Attach Traceable Path
      issue.traceable_path = buildTraceablePath(issue, lineContent);

      // 3. Explainable Risk Prioritization (0-100)
      const risk = calculateExplainableRisk({
        severity: issue.severity,
        category: issue.category,
        calibratedConfidence: issue.calibrated_confidence,
        filePath: issue.file_path,
        linesChangedCount: totalLinesProcessed,
        filesChangedCount: filesToChunk.length,
        hasTestCoverage: overallTestAwareness?.hasTestCoverage ?? true,
      });
      issue.risk_score = risk.riskScore;

      // 4. Patch Validation (Never blindly apply or recommend broken patches)
      if (issue.suggested_fix) {
        const fileContent = filesForRealStatic.find((f) => f.path === issue.file_path)?.content || '';
        if (fileContent) {
          const patchCheck = await validateSuggestedPatch({
            filePath: issue.file_path,
            originalContent: fileContent,
            targetLineNumber: issue.line_number,
            suggestedFix: issue.suggested_fix,
          });
          if (!patchCheck.isValid) {
            issue.suggested_fix = null;
            issue.supporting_evidence = `${issue.supporting_evidence ? issue.supporting_evidence + '; ' : ''}Patch validation rejected suggested fix: ${patchCheck.errors.join(', ')}`;
          }
        }
      }

      // 5. Multi-Model Escalation Policy
      const chunkForIssue = allChunks.find((c) => c.filePath === issue.file_path && c.validLines.includes(issue.line_number)) || allChunks[0];
      if (chunkForIssue) {
        issue = await applyEscalationPolicy(issue, chunkForIssue, {
          primaryModelName: repo?.model || undefined,
        });
      }

      postProcessedIssues.push(issue);
    }

    deduplicatedIssues.length = 0;
    deduplicatedIssues.push(...postProcessedIssues);

    // 12. Re-review lifecycle (Item 12):
    // Persist ALL open issues (carried-over ones with status open, new ones with new),
    // and build the verdict and summary from the full open set.
    // Mark a carried-over issue as fixed when its fingerprint no longer appears.
    const previousReviews = await prisma.review.findMany({
      where: {
        pullRequestId: pullRequest.id,
        id: { not: review.id },
        status: { in: ['completed', 'partial'] },
      },
      take: 10,
      include: { issues: true },
      orderBy: { completedAt: 'desc' },
    });

    const previousOpenIssuesMap = new Map<string, any>();
    for (const prevRev of previousReviews) {
      for (const prevIssue of prevRev.issues) {
        if ((prevIssue.status === 'open' || prevIssue.status === 'new') && prevIssue.fingerprint) {
          if (!previousOpenIssuesMap.has(prevIssue.fingerprint)) {
            previousOpenIssuesMap.set(prevIssue.fingerprint, prevIssue);
          }
        }
      }
    }

    const currentFingerprints = new Set(
      deduplicatedIssues.map((i) => i.fingerprint).filter((f): f is string => Boolean(f))
    );

    const fixedIssueIds: number[] = [];
    const carriedOverOpenIssues: ReviewIssue[] = [];

    for (const [fp, prevIssue] of previousOpenIssuesMap.entries()) {
      if (currentFingerprints.has(fp)) {
        // Still present in current review -> carried over with status 'open'
        carriedOverOpenIssues.push({
          file_path: prevIssue.filePath,
          line_number: prevIssue.lineNumber || 0,
          severity: prevIssue.severity as Severity,
          category: prevIssue.category as Category,
          message: prevIssue.message,
          suggested_fix: prevIssue.suggestedFix,
          source: prevIssue.source as any,
          confidence: prevIssue.confidence ?? 1.0,
          fingerprint: prevIssue.fingerprint,
          github_comment_id: prevIssue.githubCommentId ?? undefined,
          status: 'open',
        });
      } else if (prevIssue.id) {
        // Fingerprint no longer appears -> marked as fixed!
        fixedIssueIds.push(prevIssue.id);
      }
    }

    if (fixedIssueIds.length > 0) {
      await prisma.reviewIssue.updateMany({
        where: { id: { in: fixedIssueIds } },
        data: { status: 'fixed' },
      });

      // Record issue.fixed audit logs
      for (const fId of fixedIssueIds) {
        await prisma.auditLog.create({
          data: {
            installationId: repo?.installationId ?? null,
            actor: 'worker',
            actorRole: 'SYSTEM',
            action: AuditAction.ISSUE_FIXED,
            resourceType: 'issue',
            resourceId: String(fId),
            metadata: {
              reviewId: review.id,
              commitSha: jobData.commitSha,
            },
          },
        }).catch(() => {});
      }

      reviewLogger.info({
        fixed_count: fixedIssueIds.length,
        msg: `Marked ${fixedIssueIds.length} resolved issue(s) as fixed`,
      });
    }

    const newIssues: ReviewIssue[] = [];
    for (const issue of deduplicatedIssues) {
      if (issue.fingerprint && previousOpenIssuesMap.has(issue.fingerprint)) {
        continue;
      }
      newIssues.push({
        ...issue,
        status: 'new',
      });
    }

    // Full open set of issues
    const fullOpenSet: ReviewIssue[] = [...carriedOverOpenIssues, ...newIssues];

    // Compute reviewComplete from real state (Item 8)
    const isPartial = partialSkips.length > 0 || skipLlmDueToBudget;
    const reviewComplete =
      !isPartial &&
      (filesToChunk.length > 0 || (changedFilesList.length === 0 && !isPartial)) &&
      allChunksSucceeded &&
      staticToolsRan &&
      partialSkips.length === 0;

    if (isPartial) {
      skippedNotes.push('⚠️ Review is partial: not all files or chunks could be reviewed.');
    }

    // Determine verdict from full open set and reviewComplete (Item 8 & Item 12)
    const verdict = determineVerdict(config, fullOpenSet, reviewComplete, isPartial);

    // Item 17: Make the summary's overall line deterministic: generate it in code from counts and severities, not from assessments[0].
    const overallAssessment = sanitizeText(
      generateDeterministicSummaryLine(fullOpenSet, isPartial)
    );

    // Phase 7: Evaluate Deterministic Security Gate & Compute Provenance
    const gateResult = evaluateSecurityGate(
      fullOpenSet,
      {
        contextSummary: {
          totalTokensUsed: Array.from(fileContextMap.values()).reduce((acc, c) => acc + c.summary.totalTokens, 0),
          sourcesCount: Array.from(fileContextMap.values()).reduce((acc, c) => acc + c.sources.length, 0),
        },
        testCoverage: overallTestAwareness
          ? {
              changedFunctions: overallTestAwareness.changedFunctions.map((f: any) =>
                typeof f === 'string' ? f : f.name
              ),
              coveredFunctions: overallTestAwareness.coveredFunctions,
              untestedFunctions: overallTestAwareness.untestedFunctions,
            }
          : null,
        dependencyFindings,
        completedChecks: staticToolsRan ? ['static_analysis'] : [],
      },
      repo.organizationPolicy
    );

    const configVersion = createHash('sha256')
      .update(JSON.stringify(repo.config || {}) + JSON.stringify(repo.organizationPolicy || {}))
      .digest('hex')
      .slice(0, 16);
    const promptVersion = 'v7.0.0-evidence-contract';
    const staticAnalysisVersion = 'eslint:8.57.0;bandit:1.7.5;ruff:0.3.0';

    await updateStage('POSTING');

    // 13b. Generate & Validate OASIS SARIF 2.1.0 Report (Phase 6 Requirement 10)
    const sarifLog = generateSarifReport(fullOpenSet);
    const sarifValidation = validateSarifLog(sarifLog);
    if (!sarifValidation.isValid) {
      reviewLogger.warn({ errors: sarifValidation.errors, msg: 'Generated SARIF report had validation warnings' });
    }

    // Record Stage 9: finding_validation
    recordStage('finding_validation', Date.now() - currentStageStartTime, 'success', 'none', {
      total_findings: fullOpenSet.length,
      fixed_count: fixedIssueIds.length,
      gate_verdict: gateResult.gateVerdict,
    });
    currentStageName = 'persistence';
    currentStageStartTime = Date.now();

    // 14. Persist review & ALL open issues (carried-over: open, new: new) BEFORE posting
    await prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: review.id },
        data: {
          status: 'posting',
          stage: 'POSTING',
          verdict,
          gateVerdict: gateResult.gateVerdict,
          gateReasons: gateResult.gateReasons as any,
          policySnapshot: gateResult.appliedPolicy as any,
          promptVersion,
          staticAnalysisVersion,
          configVersion,
          summary: overallAssessment,
          sarifReport: sarifLog as any,
          summaryStructured: {
            stageTimings,
          } as any,
          contextSummary: {
            retrievedSourcesCount: Array.from(fileContextMap.values()).reduce((acc, c) => acc + c.sources.length, 0),
            summary: Array.from(fileContextMap.entries()).map(([fp, ctx]) => ({
              filePath: fp,
              tokens: ctx.summary.totalTokens,
              sources: ctx.sources.map((s) => ({ type: s.type, symbol: s.symbol, lines: s.lines })),
            })),
          } as any,
          testCoverage: overallTestAwareness as any,
          dependencyFindings: dependencyFindings.map((d) => ({
            filePath: d.file_path,
            line: d.line_number,
            cve: d.message,
            cwe: d.cwe,
            severity: d.severity,
          })) as any,
        },
      });

      await tx.reviewIssue.deleteMany({
        where: { reviewId: review.id },
      });

      if (fullOpenSet.length > 0) {
        await tx.reviewIssue.createMany({
          data: fullOpenSet.map((issue) => {
            const lineMap = fileLineContentMap.get(issue.file_path);
            const currentCode = issue.current_code || lineMap?.get(issue.line_number) || null;

            let surroundingCode = issue.surrounding_code || null;
            if (!surroundingCode && lineMap) {
              const lines: string[] = [];
              const start = Math.max(1, issue.line_number - 3);
              const end = issue.line_number + 3;
              for (let l = start; l <= end; l++) {
                if (lineMap.has(l)) {
                  lines.push(`${l}: ${lineMap.get(l)}`);
                }
              }
              if (lines.length > 0) {
                surroundingCode = lines.join('\n');
              }
            }

            const meta = enrichIssueSecurityMetadata({
              category: issue.category,
              message: issue.message,
              cwe: issue.cwe,
              owasp: issue.owasp,
            });

            const evidence =
              issue.evidence ||
              (currentCode ? `Line ${issue.line_number}: ${currentCode.trim()}` : issue.message);

            const computedFingerprint =
              issue.fingerprint ||
              calculateIssueFingerprint({
                filePath: issue.file_path,
                lineNumber: issue.line_number,
                category: issue.category,
                cwe: meta.cwe || issue.cwe,
                message: issue.message,
              });

            return {
              reviewId: review.id,
              filePath: issue.file_path,
              lineNumber: issue.line_number,
              severity: issue.severity,
              category: issue.category,
              message: issue.message,
              suggestedFix: issue.suggested_fix || null,
              source: issue.source || 'llm',
              confidence: issue.confidence ?? 1.0,
              fingerprint: computedFingerprint,
              status: issue.status || 'open',
              currentCode,
              surroundingCode,
              cwe: meta.cwe,
              owasp: meta.owasp,
              evidence,
              impact: issue.impact || null,
              attackScenario: issue.attack_scenario || null,
              remediation: issue.remediation || null,
              supportingEvidence: issue.supporting_evidence || null,
              calibratedConfidence: issue.calibrated_confidence ?? issue.confidence ?? 1.0,
              riskScore: issue.risk_score ?? 50.0,
              escalationStatus: issue.escalation_status || 'NORMAL',
            };
          }),
        });
      }
    });

    // Record Stage 10: persistence
    recordStage('persistence', Date.now() - currentStageStartTime, 'success', 'none', {
      issues_persisted: fullOpenSet.length,
    });
    currentStageName = 'review_completion';
    currentStageStartTime = Date.now();

    // 15. Post Review to GitHub (Item 11 & Item 13)
    let botUserId: number | null = options?.botUserId || null;
    if (!botUserId && process.env.GITHUB_BOT_USER_ID) {
      botUserId = parseInt(process.env.GITHUB_BOT_USER_ID, 10);
    }
    if (!botUserId && octokit) {
      try {
        const { data: user } = await octokit.rest.users.getAuthenticated();
        botUserId = user.id;
      } catch {
        // App-level token might not return user
      }
    }

    let openFingerprints = new Set<string>();
    let existingSummaryCommentId: number | null = null;

    // 15. Stale Commit Protection (Phase 3 Requirement 4):
    // Re-verify current GitHub PR HEAD SHA right before posting findings.
    // If the PR was updated to commit B while this review for commit A was executing,
    // abort posting immediately to prevent posting stale findings against B.
    if (octokit && owner && repoName) {
      let currentHeadSha: string | null = null;
      try {
        const prCheck = await octokit.rest.pulls.get({
          owner,
          repo: repoName,
          pull_number: jobData.prNumber,
        });
        currentHeadSha = prCheck.data?.head?.sha || null;
      } catch (checkErr) {
        reviewLogger.warn({
          err: (checkErr as Error).message,
          msg: 'Could not re-verify PR head SHA before posting; proceeding with current commit',
        });
      }

      if (currentHeadSha && currentHeadSha !== jobData.commitSha) {
        reviewLogger.warn({
          job_commit_sha: jobData.commitSha,
          current_head_sha: currentHeadSha,
          msg: `PR #${jobData.prNumber} head changed from ${jobData.commitSha.substring(0, 7)} to ${currentHeadSha.substring(0, 7)} during review execution. Aborting posting to prevent stale findings.`,
        });

        await prisma.review.update({
          where: { id: review.id },
          data: {
            status: 'superseded',
            stage: 'SUPERSEDED',
            summary: `Superseded by newer commit ${currentHeadSha.substring(0, 7)} before review findings could be posted.`,
            completedAt: new Date(),
          },
        });

        if (octokit && owner && repoName && checkRunId) {
          await completeCheckRun(
            octokit,
            owner,
            repoName,
            checkRunId,
            'cancelled',
            {
              filesAnalyzed: 0,
              linesAnalyzed: 0,
              criticalCount: 0,
              warningCount: 0,
              suggestionCount: 0,
              reviewDurationMs: Date.now() - startTime,
              model: 'system',
              isPartial: true,
              partialReasons: ['Superseded by newer commit on PR'],
              verdict: 'COMMENT',
            },
            []
          );
        }

        recordStage('review_completion', Date.now() - currentStageStartTime, 'failed', 'stale_commit');
        throw new HeadShaChangedError(jobData.commitSha, currentHeadSha);
      }

      openFingerprints = await fetchOpenCommentFingerprints(
        octokit,
        owner,
        repoName,
        jobData.prNumber,
        botUserId
      );
      existingSummaryCommentId = await findExistingSummaryComment(
        octokit,
        owner,
        repoName,
        jobData.prNumber,
        botUserId
      );

      reviewLogger.info({
        verdict,
        active_issues_count: fullOpenSet.length,
        msg: 'Posting review to GitHub',
      });

      const reviewPayload = buildPRReviewPayload(
        fullOpenSet,
        overallAssessment,
        verdict,
        skippedNotes,
        unanchoredIssues,
        openFingerprints,
        config.max_comments_per_pr
      );

      await postReviewToGitHub(
        octokit,
        owner,
        repoName,
        jobData.prNumber,
        jobData.commitSha,
        reviewPayload,
        validLinesMap,
        existingSummaryCommentId,
        botUserId
      );
    }

    // Filter issues for inline comments: unposted and anchored
    const unpostedIssues = fullOpenSet.filter((issue) => {
      if (issue.fingerprint && openFingerprints.has(issue.fingerprint)) {
        return false;
      }
      return true;
    });

    const finalIssuesToComment = unpostedIssues.filter(
      (i) => !unanchoredIssues.some((u) => u.fingerprint === i.fingerprint)
    );

    // 16. Mark review as completed (Requirement 14)
    const latencyMs = Date.now() - startTime;
    const latencyFromReceivedAt = Date.now() - (jobData.receivedAt || startTime);
    metrics.recordReviewCompletion(latencyFromReceivedAt);

    const structuredSummary = generateStructuredPRSummary({
      filesCount: filesToChunk.length,
      linesCount: totalLinesProcessed,
      issues: fullOpenSet,
      aiAssessment: overallAssessment,
    });

    const criticalCount = fullOpenSet.filter((i) => i.severity === 'critical').length;
    const warningCount = fullOpenSet.filter((i) => i.severity === 'warning').length;
    const suggestionCount = fullOpenSet.filter((i) => i.severity === 'suggestion').length;

    const modelName = llmProvider.name || process.env.LLM_MODEL || 'gpt-4o';

    await prisma.review.update({
      where: { id: review.id },
      data: {
        status: isPartial ? 'partial' : 'completed',
        stage: 'COMPLETED',
        filesAnalyzed: filesToChunk.length,
        linesAnalyzed: totalLinesProcessed,
        model: modelName,
        isPartial,
        summaryStructured: {
          ...structuredSummary,
          stageTimings,
        } as any,
        completedAt: new Date(),
        latencyMs,
      },
    });

    // Complete GitHub Check Run (Phase 4 Req 1)
    if (octokit && owner && repoName && checkRunId) {
      let conclusion: 'success' | 'failure' | 'neutral' = 'success';
      if (criticalCount > 0) {
        conclusion = 'failure';
      } else if (warningCount > 0) {
        conclusion = 'neutral';
      }

      await completeCheckRun(
        octokit,
        owner,
        repoName,
        checkRunId,
        conclusion,
        {
          filesAnalyzed: filesToChunk.length,
          linesAnalyzed: totalLinesProcessed,
          criticalCount,
          warningCount,
          suggestionCount,
          reviewDurationMs: latencyMs,
          model: modelName,
          isPartial,
          partialReasons: partialSkips.length > 0 ? partialSkips : undefined,
          verdict,
        },
        fullOpenSet
      );
    }

    // Record Stage 11: review_completion
    recordStage('review_completion', Date.now() - currentStageStartTime, 'success', 'none');

    // Save complete trace to Redis for instant dashboard telemetry
    if (redisClient) {
      try {
        const trace: ReviewLifecycleTrace = {
          correlationId,
          jobId: String(jobId || review.id),
          reviewId: review.id,
          repositoryId: repo.id,
          repoFullName: repo.fullName,
          prNumber: jobData.prNumber,
          commitSha: jobData.commitSha,
          totalDurationMs: latencyMs,
          status: isPartial ? 'partial' : 'completed',
          stages: stageTimings as any,
          createdAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
        };
        await redisClient.setex(`review:trace:${review.id}`, 86400 * 7, JSON.stringify(trace));
        await redisClient.lpush(
          'observability:recent_traces',
          JSON.stringify({
            reviewId: review.id,
            jobId: String(jobId || review.id),
            repoFullName: repo.fullName,
            prNumber: jobData.prNumber,
            commitSha: jobData.commitSha,
            totalDurationMs: latencyMs,
            status: isPartial ? 'partial' : 'completed',
            verdict,
            correlationId,
            completedAt: new Date().toISOString(),
            stages: stageTimings,
          })
        );
        await redisClient.ltrim('observability:recent_traces', 0, 99);
      } catch {
        // Non-fatal
      }
    }

    // Item 22: If this job was a retry of a failed review, mark the FailedReview as resolved
    const retryOfFailedReviewId = (jobData as any)?._retryOfFailedReviewId;
    if (retryOfFailedReviewId) {
      try {
        await prisma.failedReview.update({
          where: { id: retryOfFailedReviewId },
          data: { resolvedAt: new Date() },
        });
        reviewLogger.info({
          failed_review_id: retryOfFailedReviewId,
          msg: `Marked FailedReview #${retryOfFailedReviewId} as resolved`,
        });
      } catch (failedReviewErr) {
        reviewLogger.warn({
          err: (failedReviewErr as Error).message,
          failed_review_id: retryOfFailedReviewId,
          msg: 'Could not mark FailedReview as resolved',
        });
      }
    }

    reviewLogger.info({
      latency_ms: latencyMs,
      review_latency_received_at_ms: latencyFromReceivedAt,
      verdict,
      issues_count: finalIssuesToComment.length,
      total_open_issues: fullOpenSet.length,
      msg: `Review #${review.id} completed successfully`,
    });

    return { reviewId: review.id, issuesCount: finalIssuesToComment.length };
  } catch (err) {
    const errorCategory = classifyErrorCategory(err);
    metrics.recordErrorCategory(errorCategory);
    recordStage(currentStageName, Date.now() - currentStageStartTime, 'failed', errorCategory, {
      errorMessage: (err as Error).message,
    });

    if (
      (err as any)?.status >= 400 ||
      (err as any)?.name === 'HttpError' ||
      (err as any)?.message?.toLowerCase().includes('github')
    ) {
      metrics.recordGitHubFailure();
    }

    reviewLogger.error({
      event: 'review_failed',
      err: (err as Error).message,
      stack: (err as Error).stack,
      error_category: errorCategory,
      stage: currentStageName,
      correlation_id: correlationId,
      retry_count: retryCount,
      msg: `Review #${review?.id ?? 'pending'} failed at stage ${currentStageName}`,
    });

    if (!(err instanceof HeadShaChangedError)) {
      if (review?.id) {
        await prisma.review.update({
          where: { id: review.id },
          data: {
            status: 'failed',
            stage: 'FAILED',
            summary: `Review failed: ${(err as Error).message}`,
            summaryStructured: {
              stageTimings,
            } as any,
            completedAt: new Date(),
            latencyMs: Date.now() - startTime,
          },
        });
      }

      await prisma.auditLog.create({
        data: {
          installationId: repo?.installationId ?? null,
          actor: 'worker',
          actorRole: 'SYSTEM',
          action: AuditAction.REVIEW_FAILED,
          resourceType: 'review',
          resourceId: String(review.id),
          metadata: {
            errorMessage: (err as Error).message,
            prNumber: jobData.prNumber,
            commitSha: jobData.commitSha,
          },
        },
      }).catch(() => {});

      if (octokit && owner && repoName && checkRunId) {
        await completeCheckRun(
          octokit,
          owner,
          repoName,
          checkRunId,
          'failure',
          {
            filesAnalyzed: 0,
            linesAnalyzed: 0,
            criticalCount: 1,
            warningCount: 0,
            suggestionCount: 0,
            reviewDurationMs: Date.now() - startTime,
            model: 'system',
            isPartial: true,
            partialReasons: [(err as Error).message || 'Review execution failed'],
            verdict: 'REQUEST_CHANGES',
          },
          []
        );
      }
    }
    throw err;
  }
}


