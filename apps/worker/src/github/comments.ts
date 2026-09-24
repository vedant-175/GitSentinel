import { Octokit } from 'octokit';
import { ReviewIssue, Severity } from '@ai-reviewer/shared';

export interface FormattedReview {
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body: string;
  comments: Array<{
    path: string;
    line: number;
    body: string;
  }>;
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

  let body = `${severityBadge} \`[${categoryTag}]${sourceTag}\`\n\n${issue.message}\n`;

  if (issue.suggested_fix) {
    body += `\n**Suggested Fix:**\n\`\`\`suggestion\n${issue.suggested_fix}\n\`\`\`\n`;
  }

  return body;
}

export function buildPRReviewPayload(
  issues: ReviewIssue[],
  overallAssessment: string
): FormattedReview {
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const suggestionCount = issues.filter((i) => i.severity === 'suggestion').length;

  let event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' = 'APPROVE';
  if (criticalCount > 0) {
    event = 'REQUEST_CHANGES';
  } else if (warningCount > 0 || suggestionCount > 0) {
    event = 'COMMENT';
  }

  const verdictTitle =
    event === 'APPROVE'
      ? '✅ AI Code Review: Approved'
      : event === 'REQUEST_CHANGES'
      ? '❌ AI Code Review: Changes Requested'
      : '💬 AI Code Review: Comments & Suggestions';

  const summaryMarkdown = `## ${verdictTitle}

${overallAssessment}

### 📊 Review Summary
| Severity | Count |
| :--- | :--- |
| 🔴 **Critical** | ${criticalCount} |
| 🟡 **Warning** | ${warningCount} |
| 🔵 **Suggestion** | ${suggestionCount} |
| **Total Issues** | **${issues.length}** |

${
  criticalCount > 0
    ? '> ⚠️ **Action Required**: Critical security or reliability issues were flagged on changed lines. Please resolve them before merging.'
    : issues.length === 0
    ? '> 🚀 **LGTM**: No critical bugs, security risks, or code smells found in the inspected diff!'
    : '> 💡 **Note**: Please review the inline suggestions and warnings above.'
}

---
*Automated review by [AI Code Reviewer](https://github.com)*`;

  const inlineComments = issues
    .filter((issue) => issue.line_number > 0)
    .map((issue) => ({
      path: issue.file_path,
      line: issue.line_number,
      body: formatInlineComment(issue),
    }));

  return {
    event,
    body: summaryMarkdown,
    comments: inlineComments,
  };
}

/**
 * Posts the formatted review to GitHub Pull Request
 */
export async function postReviewToGitHub(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commitSha: string,
  review: FormattedReview
): Promise<void> {
  try {
    // Post the pull request review with inline comments
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitSha,
      event: review.event,
      body: review.body,
      comments: review.comments,
    });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    // If inline comments fail (e.g. lines outside diff window or 422 Unprocessable),
    // fall back to posting a top-level PR comment so the review is never lost!
    console.warn(
      `GitHub inline review failed (${error?.message || error}), falling back to issue comment summary:`,
      err
    );

    let fallbackBody = review.body + '\n\n### 📝 Inline Issues:\n';
    for (const c of review.comments) {
      fallbackBody += `\n- **${c.path}:${c.line}**\n${c.body}\n`;
    }

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: fallbackBody,
    });
  }
}
