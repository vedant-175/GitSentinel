import { prisma } from '@ai-reviewer/db';
import {
  ReviewJobData,
  parseUnifiedDiff,
  chunkFileDiff,
  isFileIgnored,
  ReviewIssue,
  RepoConfig,
  RepoConfigSchema,
  Severity,
} from '@ai-reviewer/shared';
import { getInstallationOctokit } from '../github/client.js';
import { buildPRReviewPayload, postReviewToGitHub } from '../github/comments.js';
import { getLLMProvider } from './llm.js';
import { runStaticAnalysis } from '../staticAnalysis/analyzer.js';

const SEVERITY_LEVELS: Record<Severity, number> = {
  critical: 3,
  warning: 2,
  suggestion: 1,
};

export async function processReviewJob(
  jobData: ReviewJobData,
  mockDiffOverride?: string
): Promise<{ reviewId: number; issuesCount: number }> {
  const startTime = Date.now();
  console.log(
    `🔍 Starting review for repoId: ${jobData.repoId}, PR #${jobData.prNumber}, Commit: ${jobData.commitSha.substring(0, 7)}`
  );

  // 1. Fetch Repository & PullRequest from DB
  const repo = await prisma.repository.findUnique({
    where: { id: jobData.repoId },
    include: { installation: true },
  });

  if (!repo) {
    throw new Error(`Repository with ID ${jobData.repoId} not found in database.`);
  }

  // Parse repo config
  const config: RepoConfig = RepoConfigSchema.parse(repo.config || {});

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
    },
    create: {
      repositoryId: repo.id,
      githubPrNumber: jobData.prNumber,
      title: jobData.title || `PR #${jobData.prNumber}`,
      author: jobData.author || 'contributor',
      state: 'open',
    },
  });

  // 2. Idempotency Check: Don't duplicate reviews for identical commitSha
  const existingReview = await prisma.review.findFirst({
    where: {
      pullRequestId: pullRequest.id,
      commitSha: jobData.commitSha,
      status: 'completed',
    },
  });

  if (existingReview) {
    console.log(
      `⏭️ Review already completed for commit ${jobData.commitSha.substring(0, 7)} on PR #${jobData.prNumber}. Skipping.`
    );
    return { reviewId: existingReview.id, issuesCount: 0 };
  }

  // 3. Create Pending Review entry
  const review = await prisma.review.create({
    data: {
      pullRequestId: pullRequest.id,
      commitSha: jobData.commitSha,
      status: 'pending',
    },
  });

  try {
    // 4. Fetch PR Diff
    let rawDiff = mockDiffOverride || '';
    const [owner, repoName] = repo.fullName.split('/');
    const octokit = getInstallationOctokit(jobData.installationId);

    if (!rawDiff && octokit && owner && repoName) {
      console.log(`🌐 Fetching PR diff from GitHub API for ${repo.fullName}#${jobData.prNumber}...`);
      const response = await octokit.rest.pulls.get({
        owner,
        repo: repoName,
        pull_number: jobData.prNumber,
        mediaType: { format: 'diff' },
      });
      rawDiff = response.data as unknown as string;
    }

    if (!rawDiff) {
      console.warn('⚠️ No diff content provided or retrieved from GitHub. Setting empty review.');
      rawDiff = '';
    }

    // 5. Parse unified diff
    const parsedFiles = parseUnifiedDiff(rawDiff);
    console.log(`📄 Parsed ${parsedFiles.length} file(s) from diff.`);

    // 6. Filter ignored files & chunk
    const llmProvider = getLLMProvider();
    const allIssues: ReviewIssue[] = [];
    const assessments: string[] = [];

    for (const file of parsedFiles) {
      const filePath = file.newPath || file.oldPath;

      if (isFileIgnored(filePath, config.ignored_globs || [])) {
        console.log(`🙈 Skipping ignored file: ${filePath}`);
        continue;
      }

      // Chunk file diff if it's large
      const chunks = chunkFileDiff(file, 120);

      for (const chunk of chunks) {
        // Run static analysis pre-pass
        const staticIssues = runStaticAnalysis(chunk);
        allIssues.push(...staticIssues);

        // Run LLM review
        const llmResult = await llmProvider.reviewChunk(chunk);
        allIssues.push(...llmResult.issues);
        if (llmResult.overall_assessment) {
          assessments.push(llmResult.overall_assessment);
        }
      }
    }

    // 7. Filter issues by configuration threshold & disabled categories
    const thresholdScore = SEVERITY_LEVELS[config.severity_threshold || 'suggestion'];
    const filteredIssues = allIssues.filter((issue) => {
      // Check disabled categories
      if (config.disabled_categories?.includes(issue.category)) {
        return false;
      }
      // Check severity threshold
      const issueScore = SEVERITY_LEVELS[issue.severity] || 1;
      return issueScore >= thresholdScore;
    });

    // Deduplicate issues by file, line, and message prefix
    const seen = new Set<string>();
    const deduplicatedIssues: ReviewIssue[] = [];
    for (const issue of filteredIssues) {
      const key = `${issue.file_path}:${issue.line_number}:${issue.message.substring(0, 30)}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicatedIssues.push(issue);
      }
    }

    // Cap comments at max_comments_per_pr
    const finalIssues = deduplicatedIssues.slice(0, config.max_comments_per_pr || 25);

    // 8. Determine Verdict
    const hasCritical = finalIssues.some((i) => i.severity === 'critical');
    const hasWarningOrSuggestion = finalIssues.length > 0;
    const verdict = hasCritical
      ? 'REQUEST_CHANGES'
      : hasWarningOrSuggestion
      ? 'COMMENT'
      : 'APPROVE';

    const overallAssessment =
      assessments.length > 0
        ? assessments[0]
        : finalIssues.length === 0
        ? 'Clean diff with no flagged security, quality, or logic issues.'
        : `Identified ${finalIssues.length} issue(s) during automated code inspection.`;

    // 9. Post Review to GitHub if Octokit is available
    if (octokit && owner && repoName) {
      console.log(`📤 Posting review with ${finalIssues.length} comments to GitHub...`);
      const reviewPayload = buildPRReviewPayload(finalIssues, overallAssessment);
      await postReviewToGitHub(
        octokit,
        owner,
        repoName,
        jobData.prNumber,
        jobData.commitSha,
        reviewPayload
      );
    }

    // 10. Persist Review and Issues in PostgreSQL
    const latencyMs = Date.now() - startTime;
    await prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: review.id },
        data: {
          status: 'completed',
          verdict,
          summary: overallAssessment,
          completedAt: new Date(),
          latencyMs,
        },
      });

      if (finalIssues.length > 0) {
        await tx.reviewIssue.createMany({
          data: finalIssues.map((issue) => ({
            reviewId: review.id,
            filePath: issue.file_path,
            lineNumber: issue.line_number,
            severity: issue.severity,
            category: issue.category,
            message: issue.message,
            suggestedFix: issue.suggested_fix,
            source: issue.source || 'llm',
          })),
        });
      }
    });

    console.log(
      `✅ Review #${review.id} completed successfully in ${latencyMs}ms. Verdict: ${verdict}, Issues: ${finalIssues.length}`
    );

    return { reviewId: review.id, issuesCount: finalIssues.length };
  } catch (err) {
    console.error(`❌ Review #${review.id} failed:`, err);
    await prisma.review.update({
      where: { id: review.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        latencyMs: Date.now() - startTime,
      },
    });
    throw err;
  }
}
