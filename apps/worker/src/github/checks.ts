import { Octokit } from 'octokit';
import { ReviewIssue, Severity } from '@ai-reviewer/shared';
import { logger } from '../logger.js';

export interface CheckRunSummaryData {
  filesAnalyzed: number;
  linesAnalyzed: number;
  criticalCount: number;
  warningCount: number;
  suggestionCount: number;
  reviewDurationMs: number;
  model: string;
  isPartial: boolean;
  partialReasons?: string[];
  verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
}

export type CheckStatus = 'queued' | 'in_progress' | 'completed';
export type CheckConclusion = 'success' | 'failure' | 'neutral' | 'cancelled';

export interface GitHubCheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  start_column?: number;
  end_column?: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  message: string;
  title?: string;
  raw_details?: string;
}

const CHECK_NAME = 'AI Code Review';

/**
 * Creates an initial Check Run on GitHub with status 'queued'
 */
export async function createCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  headSha: string,
  name: string = CHECK_NAME
): Promise<number | null> {
  try {
    const res = await octokit.rest.checks.create({
      owner,
      repo,
      name,
      head_sha: headSha,
      status: 'queued',
      started_at: new Date().toISOString(),
      output: {
        title: `${name} — Queued`,
        summary: 'Review job queued for autonomous static and AI analysis.',
      },
    });
    logger.info({ check_run_id: res.data.id, head_sha: headSha.substring(0, 7), msg: 'Created GitHub Check Run (queued)' });
    return res.data.id;
  } catch (err) {
    logger.warn({ err: (err as Error).message, msg: 'Failed to create GitHub Check Run (queued). Continuing review.' });
    return null;
  }
}

/**
 * Updates a Check Run status to 'in_progress'
 */
export async function updateCheckRunProgress(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number,
  stage: string
): Promise<void> {
  try {
    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: 'in_progress',
      output: {
        title: `${CHECK_NAME} — ${stage}`,
        summary: `Current review progress: ${stage}. Analyzing pull request diff and evaluating security rules.`,
      },
    });
  } catch (err) {
    logger.warn({ check_run_id: checkRunId, err: (err as Error).message, msg: 'Failed to update GitHub Check Run progress' });
  }
}

/**
 * Converts ReviewIssues into GitHub Check Run Annotations (capped at 50 per GitHub API spec)
 */
export function buildCheckAnnotations(issues: ReviewIssue[]): GitHubCheckAnnotation[] {
  // Sort critical first, then warning, then suggestion
  const sorted = [...issues].sort((a, b) => {
    const weight: Record<Severity, number> = { critical: 3, warning: 2, suggestion: 1 };
    return weight[b.severity] - weight[a.severity];
  });

  return sorted.slice(0, 50).map((issue) => {
    let annotation_level: 'notice' | 'warning' | 'failure' = 'notice';
    if (issue.severity === 'critical') annotation_level = 'failure';
    else if (issue.severity === 'warning') annotation_level = 'warning';

    const line = Math.max(1, issue.line_number);
    const cweText = issue.cwe ? ` [${issue.cwe}]` : '';
    const owaspText = issue.owasp ? ` (${issue.owasp})` : '';

    return {
      path: issue.file_path,
      start_line: line,
      end_line: line,
      annotation_level,
      title: `${issue.severity.toUpperCase()}: ${issue.category.toUpperCase()}${cweText}`,
      message: `${issue.message}${owaspText}`,
      raw_details: issue.suggested_fix ? `Suggested Fix:\n${issue.suggested_fix}` : undefined,
    };
  });
}

/**
 * Builds formatted markdown output for the completed Check Run
 */
export function buildCheckRunSummary(data: CheckRunSummaryData): { title: string; summary: string; text: string } {
  const isPass = data.verdict === 'APPROVE' && data.criticalCount === 0;
  const isBlock = data.verdict === 'REQUEST_CHANGES' || data.criticalCount > 0;

  const title = isBlock
    ? `AI Code Review: Blocked (${data.criticalCount} Critical Issue${data.criticalCount === 1 ? '' : 's'})`
    : isPass
    ? `AI Code Review: Passed (Clean)`
    : `AI Code Review: Completed with Notes`;

  const durationSec = (data.reviewDurationMs / 1000).toFixed(1);

  const partialBanner = data.isPartial
    ? `> [!WARNING]\n> **Partial Review State**: This review was partially evaluated. Reasons: ${
        data.partialReasons?.join(', ') || 'File cap or budget limits exceeded.'
      }\n\n`
    : '';

  const summary = `
${partialBanner}### Autonomous Review Metrics
- **Verdict**: \`${data.verdict}\`
- **Files Analyzed**: ${data.filesAnalyzed}
- **Lines Analyzed**: ${data.linesAnalyzed}
- **Critical Findings**: ${data.criticalCount}
- **Warnings**: ${data.warningCount}
- **Suggestions**: ${data.suggestionCount}
- **Review Duration**: ${durationSec}s (${data.reviewDurationMs}ms)
- **Model Engine**: \`${data.model}\`
- **Partial Review**: ${data.isPartial ? '⚠️ Yes' : '✅ No'}
`.trim();

  const text = `
### Review Policy Enforcement
- **Fail-Closed Policy**: Critical vulnerabilities block PR merging.
- **Deduplication & Idempotency**: Verified stable against duplicate events and replays.
- **Deterministic vs AI Findings**: Static analysis rules (ESLint, Bandit, regex) run deterministically alongside deep semantic LLM reasoning.
`.trim();

  return { title, summary, text };
}

/**
 * Completes a Check Run with conclusion ('success' | 'failure' | 'neutral' | 'cancelled')
 */
export async function completeCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number,
  conclusion: CheckConclusion,
  summaryData: CheckRunSummaryData,
  issues: ReviewIssue[] = []
): Promise<void> {
  try {
    const { title, summary, text } = buildCheckRunSummary(summaryData);
    const annotations = buildCheckAnnotations(issues);

    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: 'completed',
      conclusion,
      completed_at: new Date().toISOString(),
      output: {
        title,
        summary,
        text,
        annotations: annotations.length > 0 ? annotations : undefined,
      },
    });

    logger.info({
      check_run_id: checkRunId,
      conclusion,
      annotations_count: annotations.length,
      msg: 'Completed GitHub Check Run',
    });
  } catch (err) {
    logger.warn({ check_run_id: checkRunId, err: (err as Error).message, msg: 'Failed to complete GitHub Check Run' });
  }
}
