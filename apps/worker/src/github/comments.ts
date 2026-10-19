import { Octokit } from 'octokit';
import { ReviewIssue, isBot, withRetry, isTransientGitHubError } from '@ai-reviewer/shared';
import {
  SUMMARY_COMMENT_MARKER,
  getIssueMarker,
  extractFingerprintFromComment,
} from '../review/sanitize.js';
import { logger } from '../logger.js';

export interface FormattedInlineComment {
  path: string;
  line: number;
  body: string;
  fingerprint: string;
}

export interface FormattedReview {
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body: string;
  comments: FormattedInlineComment[];
}

export function formatInlineComment(issue: ReviewIssue): string {
  const severityBadge =
    issue.severity === 'critical'
      ? '🔴 **CRITICAL**'
      : issue.severity === 'warning'
      ? '🟡 **WARNING**'
      : '🔵 **SUGGESTION**';

  const categoryTag = issue.category.toUpperCase();
  const sourceTag = issue.source === 'static_analysis' ? ' [Static Check]' : '';
  const marker = issue.fingerprint ? `\n\n${getIssueMarker(issue.fingerprint)}` : '';

  let body = `${severityBadge} \`[${categoryTag}]${sourceTag}\`\n\n${issue.message}\n`;

  if (issue.suggested_fix) {
    body += `\n**Suggested Fix:**\n\`\`\`suggestion\n${issue.suggested_fix}\n\`\`\`\n`;
  }

  body += marker;
  return body;
}

/**
 * Builds the GitHub PR review payload.
 * Item 13: Issues that cannot be anchored inline go into "Findings Outside the Diff"
 * section of the summary and keep their place in totals and the verdict.
 */
export function buildPRReviewPayload(
  issues: ReviewIssue[],
  overallAssessment: string,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' = 'COMMENT',
  skippedNotes: string[] = [],
  unanchoredIssues: ReviewIssue[] = [],
  alreadyCommentedFingerprints?: Set<string>,
  maxComments?: number
): FormattedReview {
  // Totals count ALL issues (Item 13: Never silently drop an issue that still counts in totals)
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const suggestionCount = issues.filter((i) => i.severity === 'suggestion').length;

  const verdictTitle =
    event === 'APPROVE'
      ? '✅ AI Code Review: Approved'
      : event === 'REQUEST_CHANGES'
      ? '❌ AI Code Review: Changes Requested'
      : '💬 AI Code Review: Comments & Suggestions';

  // Filter out unanchored issues and already commented issues from inline diff comments
  const unanchoredKeys = new Set(
    unanchoredIssues.map((u) => u.fingerprint || `${u.file_path}:${u.line_number}`)
  );

  const eligibleForInline = issues.filter((issue) => {
    const issueKey = issue.fingerprint || `${issue.file_path}:${issue.line_number}`;
    if (unanchoredKeys.has(issueKey)) {
      return false;
    }
    if (issue.fingerprint && alreadyCommentedFingerprints?.has(issue.fingerprint)) {
      return false;
    }
    return issue.line_number > 0;
  });

  // Sort eligible inline comments by priority: 1. critical, 2. warning, 3. suggestion
  const SEVERITY_ORDER: Record<string, number> = {
    critical: 1,
    warning: 2,
    suggestion: 3,
  };

  eligibleForInline.sort((a, b) => {
    const rankA = SEVERITY_ORDER[a.severity] || 4;
    const rankB = SEVERITY_ORDER[b.severity] || 4;
    if (rankA !== rankB) return rankA - rankB;
    if (a.file_path !== b.file_path) return a.file_path.localeCompare(b.file_path);
    return (a.line_number || 0) - (b.line_number || 0);
  });

  // Enforce max comments limit
  let chosenForInline = eligibleForInline;
  if (maxComments !== undefined && maxComments > 0 && eligibleForInline.length > maxComments) {
    const omittedCount = eligibleForInline.length - maxComments;
    chosenForInline = eligibleForInline.slice(0, maxComments);
    const capMsg = `${omittedCount} finding(s) not posted inline due to max comments limit (capped at ${maxComments}).`;
    if (!skippedNotes.includes(capMsg)) {
      skippedNotes.push(capMsg);
    }
  }

  let skippedSection = '';
  if (skippedNotes.length > 0) {
    skippedSection =
      `\n### ⏭️ Skipped during review (caps/filters applied):\n` +
      skippedNotes.map((note) => `- ${note}`).join('\n') +
      '\n';
  }

  let unanchoredSection = '';
  if (unanchoredIssues.length > 0) {
    unanchoredSection =
      `\n### 🔍 Findings Outside the Diff\n` +
      `The following issues were identified in related or context code outside the changed diff lines:\n` +
      unanchoredIssues
        .map((issue) => {
          const badge =
            issue.severity === 'critical'
              ? '🔴 **Critical**'
              : issue.severity === 'warning'
              ? '🟡 **Warning**'
              : '🔵 **Suggestion**';
          const loc = issue.line_number ? ` (line ${issue.line_number})` : '';
          let text = `- ${badge} \`[${issue.category.toUpperCase()}]\` \`${issue.file_path}\`${loc}: ${issue.message}`;
          if (issue.suggested_fix) {
            text += `\n  - *Suggested Fix*: \`${issue.suggested_fix}\``;
          }
          return text;
        })
        .join('\n') +
      '\n';
  }

  const summaryMarkdown = `${SUMMARY_COMMENT_MARKER}
## ${verdictTitle}

${overallAssessment}

### 📊 Review Summary
| Severity | Count |
| :--- | :--- |
| 🔴 **Critical** | ${criticalCount} |
| 🟡 **Warning** | ${warningCount} |
| 🔵 **Suggestion** | ${suggestionCount} |
| **Total Issues** | **${issues.length}** |

${
  event === 'REQUEST_CHANGES'
    ? '> ⚠️ **Action Required**: Critical security or reliability issues were flagged. Please resolve them before merging.'
    : event === 'APPROVE'
    ? '> 🚀 **Approved**: All diff chunks inspected cleanly with 0 issues identified.'
    : '> 💡 **Note**: Please review the comments and suggestions above.'
}
${unanchoredSection}${skippedSection}
---
*Automated review by [AI Code Reviewer](https://github.com)*`;

  const inlineComments: FormattedInlineComment[] = chosenForInline.map((issue) => ({
    path: issue.file_path,
    line: issue.line_number,
    body: formatInlineComment(issue),
    fingerprint: issue.fingerprint || '',
  }));

  return {
    event,
    body: summaryMarkdown,
    comments: inlineComments,
  };
}

/**
 * Searches for an existing bot summary comment bearing the hidden marker.
 * Item 11: Identify bot comments by app's own user ID plus the marker,
 * never by marker alone, never by body text, and paginate everything.
 */
export async function findExistingSummaryComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  botUserId?: number | null
): Promise<number | null> {
  try {
    const comments: any[] = typeof octokit.paginate === 'function'
      ? await octokit.paginate(octokit.rest.issues.listComments, {
          owner,
          repo,
          issue_number: pullNumber,
          per_page: 100,
        })
      : ((await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: pullNumber,
          per_page: 100,
        })) as any).data;

    for (const c of comments) {
      const isOurBot = botUserId
        ? c.user?.id === botUserId
        : (isBot(c.user) || (c.user?.login && c.user.login.endsWith('[bot]')));
      // Item 11: app's own user ID plus marker, never marker alone, never body text
      if (isOurBot && c.body && c.body.includes(SUMMARY_COMMENT_MARKER)) {
        return c.id;
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, msg: 'Failed to search for existing summary comment' });
  }
  return null;
}

/**
 * Gathers fingerprints of all existing open review comments to prevent re-commenting.
 * Item 11: Identify bot comments by app's own user ID plus marker, and paginate everything.
 */
export async function fetchOpenCommentFingerprints(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  botUserId?: number | null
): Promise<Set<string>> {
  const fingerprints = new Set<string>();
  try {
    const comments: any[] = typeof octokit.paginate === 'function'
      ? await octokit.paginate(octokit.rest.pulls.listReviewComments, {
          owner,
          repo,
          pull_number: pullNumber,
          per_page: 100,
        })
      : ((await octokit.rest.pulls.listReviewComments({
          owner,
          repo,
          pull_number: pullNumber,
          per_page: 100,
        })) as any).data;

    for (const c of comments) {
      const isOurBot = botUserId
        ? c.user?.id === botUserId
        : (isBot(c.user) || (c.user?.login && c.user.login.endsWith('[bot]')));
      if (isOurBot && c.body) {
        const fp = extractFingerprintFromComment(c.body);
        if (fp) {
          fingerprints.add(fp);
        }
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, msg: 'Failed to fetch open review comment fingerprints' });
  }
  return fingerprints;
}

/**
 * Dismisses or supersedes stale bot reviews on older commits.
 * Item 11:
 * - Dismiss a stale bot review ONLY after the replacement is posted successfully.
 * - Identify bot reviews by app's own user ID plus marker, never by marker alone, never by body text.
 * - Paginate everything.
 */
export async function dismissStaleBotReviews(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  botUserId?: number | null,
  keepReviewId?: number | null
): Promise<number[]> {
  const dismissedReviewIds: number[] = [];
  try {
    const reviews: any[] = typeof octokit.paginate === 'function'
      ? await octokit.paginate(octokit.rest.pulls.listReviews, {
          owner,
          repo,
          pull_number: pullNumber,
          per_page: 100,
        })
      : ((await octokit.rest.pulls.listReviews({
          owner,
          repo,
          pull_number: pullNumber,
          per_page: 100,
        })) as any).data;

    for (const r of reviews) {
      if (keepReviewId && r.id === keepReviewId) {
        continue;
      }

      const isOurBot = botUserId
        ? r.user?.id === botUserId
        : (isBot(r.user) || (r.user?.login && r.user.login.endsWith('[bot]')));
      const hasMarker = Boolean(r.body && r.body.includes(SUMMARY_COMMENT_MARKER));

      // Identified by app user ID + marker, never by body text or marker alone
      if (isOurBot && hasMarker && (r.state === 'CHANGES_REQUESTED' || r.state === 'APPROVED')) {
        try {
          await octokit.rest.pulls.dismissReview({
            owner,
            repo,
            pull_number: pullNumber,
            review_id: r.id,
            message: 'Superceded by updated automated AI review on newer commit.',
          });
          dismissedReviewIds.push(r.id);
          logger.info({
            review_id: r.id,
            state: r.state,
            owner,
            repo,
            pull_number: pullNumber,
            msg: `Dismissed stale bot review #${r.id}`,
          });
        } catch (dismissErr) {
          logger.warn({
            review_id: r.id,
            err: (dismissErr as Error).message,
            msg: `Could not dismiss stale review #${r.id}`,
          });
        }
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, msg: 'Failed to list or dismiss stale bot reviews' });
  }
  return dismissedReviewIds;
}

export interface PostReviewResult {
  postedCommentsCount: number;
  failedCommentsCount: number;
  summaryCommentId?: number;
}

/**
 * Posts the review to GitHub with resilience:
 * - Validates comment lines against validLines first
 * - Updates existing summary comment if present, or creates one
 * - On 422 batch failure, retries comments individually and records failures
 * - If review had comments but 0 could be posted, throws error (fail closed)
 */
export async function postReviewToGitHub(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commitSha: string,
  review: FormattedReview,
  validLinesMap: Map<string, Set<number>>,
  existingSummaryCommentId?: number | null,
  botUserId?: number | null
): Promise<PostReviewResult> {
  // 1. Validate every comment line against validLines first
  const validComments: FormattedInlineComment[] = [];
  const invalidComments: FormattedInlineComment[] = [];

  for (const comment of review.comments) {
    const validLinesForFile = validLinesMap.get(comment.path);
    if (validLinesForFile && validLinesForFile.has(comment.line)) {
      validComments.push(comment);
    } else {
      logger.warn({
        path: comment.path,
        line: comment.line,
        msg: `[Review Posting] Comment on ${comment.path}:${comment.line} dropped (not in validLines).`,
      });
      invalidComments.push(comment);
    }
  }

  let summaryCommentId = existingSummaryCommentId || undefined;

  // 2. Handle Summary Comment (Update existing summary comment if present)
  if (existingSummaryCommentId) {
    logger.info({
      summary_comment_id: existingSummaryCommentId,
      msg: `Updating existing summary comment #${existingSummaryCommentId}...`,
    });
    try {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingSummaryCommentId,
        body: review.body,
      });
    } catch (updateErr) {
      logger.warn({
        summary_comment_id: existingSummaryCommentId,
        err: (updateErr as Error).message,
        msg: `Could not update summary comment #${existingSummaryCommentId}`,
      });
    }
  }

  // 3. Item 11: ALWAYS submit a review event for the current verdict, even with zero new inline comments.
  let postedReviewId: number | undefined;

  if (validComments.length === 0) {
    const createdReview = await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitSha,
      event: review.event,
      body: review.body,
    });
    postedReviewId = createdReview.data.id;
    if (!summaryCommentId) {
      summaryCommentId = createdReview.data.id;
    }

    // Item 11: Dismiss stale bot reviews ONLY AFTER the replacement review is posted successfully
    await dismissStaleBotReviews(octokit, owner, repo, pullNumber, botUserId, postedReviewId);

    return {
      postedCommentsCount: 0,
      failedCommentsCount: invalidComments.length,
      summaryCommentId,
    };
  }

  // 4. Attempt Batch Review Submission with inline comments (with transient retry backoff)
  try {
    const createdReview = await withRetry(
      () =>
        octokit.rest.pulls.createReview({
          owner,
          repo,
          pull_number: pullNumber,
          commit_id: commitSha,
          event: review.event,
          body: review.body,
          comments: validComments.map((c) => ({
            path: c.path,
            line: c.line,
            body: c.body,
          })),
        }),
      {
        maxRetries: 3,
        initialDelayMs: 400,
        isRetryable: isTransientGitHubError,
      }
    );

    postedReviewId = createdReview.data.id;
    if (!summaryCommentId) {
      summaryCommentId = createdReview.data.id;
    }

    // Item 11: Dismiss stale bot reviews ONLY AFTER the replacement review is posted successfully
    await dismissStaleBotReviews(octokit, owner, repo, pullNumber, botUserId, postedReviewId);

    return {
      postedCommentsCount: validComments.length,
      failedCommentsCount: invalidComments.length,
      summaryCommentId,
    };
  } catch (batchErr: unknown) {
    const error = batchErr as { status?: number; message?: string };

    // On 422 from batch, retry comments individually
    if (error?.status === 422) {
      logger.warn({
        err: error.message,
        msg: `[Review Posting] Batch createReview failed with 422. Retrying comments individually...`,
      });

      // Post summary comment first if needed
      if (!summaryCommentId) {
        try {
          const res = await withRetry(
            () =>
              octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: pullNumber,
                body: review.body,
              }),
            { maxRetries: 3, initialDelayMs: 400, isRetryable: isTransientGitHubError }
          );
          summaryCommentId = res.data.id;
        } catch (sumErr) {
          logger.error({ err: (sumErr as Error).message, msg: 'Failed to post fallback summary comment' });
        }
      }

      let postedCount = 0;
      let failedCount = invalidComments.length;

      for (const c of validComments) {
        try {
          await octokit.rest.pulls.createReviewComment({
            owner,
            repo,
            pull_number: pullNumber,
            commit_id: commitSha,
            path: c.path,
            line: c.line,
            body: c.body,
          });
          postedCount++;
        } catch (indivErr) {
          logger.warn({
            path: c.path,
            line: c.line,
            err: (indivErr as Error).message,
            msg: `[Review Posting] Individual comment failed for ${c.path}:${c.line}`,
          });
          failedCount++;
        }
      }

      // If nothing could be posted from comments, throw
      if (postedCount === 0 && review.comments.length > 0) {
        throw new Error(
          `Failed to post any inline review comments to GitHub (422 error on batch, all ${validComments.length} individual retries failed).`
        );
      }

      // Submit review event for the verdict if possible
      try {
        const createdReview = await octokit.rest.pulls.createReview({
          owner,
          repo,
          pull_number: pullNumber,
          commit_id: commitSha,
          event: review.event,
          body: review.body,
        });
        postedReviewId = createdReview.data.id;
      } catch {
        // Fallback individual comments and summary comment already posted
      }

      // Item 11: Dismiss stale bot reviews ONLY AFTER the replacement review is posted successfully
      if (postedReviewId) {
        await dismissStaleBotReviews(octokit, owner, repo, pullNumber, botUserId, postedReviewId);
      }

      return {
        postedCommentsCount: postedCount,
        failedCommentsCount: failedCount,
        summaryCommentId,
      };
    }

    // Fail closed on connection, authorization, or rate-limit errors
    throw batchErr;
  }
}

