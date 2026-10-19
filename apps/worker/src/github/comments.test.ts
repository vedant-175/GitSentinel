import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPRReviewPayload,
  dismissStaleBotReviews,
} from './comments.js';
import { ReviewIssue } from '@ai-reviewer/shared';

test('buildPRReviewPayload creates correct markdown and event for APPROVE', () => {
  const issues: ReviewIssue[] = [];
  const payload = buildPRReviewPayload(issues, 'Looks good to merge!', 'APPROVE');

  assert.equal(payload.event, 'APPROVE');
  assert.equal(payload.comments.length, 0);
  assert.match(payload.body, /✅ AI Code Review: Approved/);
  assert.match(payload.body, /Looks good to merge!/);
});

test('buildPRReviewPayload creates correct markdown and event for REQUEST_CHANGES', () => {
  const criticalIssue: ReviewIssue = {
    file_path: 'src/auth.ts',
    line_number: 25,
    severity: 'critical',
    category: 'security',
    message: 'Plaintext credentials detected',
    suggested_fix: 'const secret = process.env.SECRET;',
  };

  const payload = buildPRReviewPayload([criticalIssue], 'Critical issues found', 'REQUEST_CHANGES');

  assert.equal(payload.event, 'REQUEST_CHANGES');
  assert.equal(payload.comments.length, 1);
  assert.equal(payload.comments[0].path, 'src/auth.ts');
  assert.equal(payload.comments[0].line, 25);
  assert.match(payload.body, /❌ AI Code Review: Changes Requested/);
  assert.match(payload.comments[0].body, /🔴 \*\*CRITICAL\*\*/);
  assert.match(payload.comments[0].body, /```suggestion/);
});

test('buildPRReviewPayload defaults event to COMMENT', () => {
  const warningIssue: ReviewIssue = {
    file_path: 'src/utils.ts',
    line_number: 10,
    severity: 'warning',
    category: 'performance',
    message: 'N+1 query loop',
  };

  const payload = buildPRReviewPayload([warningIssue], 'Some suggestions');
  assert.equal(payload.event, 'COMMENT');
  assert.match(payload.body, /💬 AI Code Review: Comments & Suggestions/);
});

test('dismissStaleBotReviews dismisses CHANGES_REQUESTED reviews from bot', async () => {
  const dismissedReviewIds: number[] = [];

  const mockOctokit = {
    rest: {
      apps: {
        getAuthenticated: async () => ({
          data: { slug: 'ai-code-reviewer-bot' },
        }),
      },
      pulls: {
        listReviews: async () => ({
          data: [
            {
              id: 101,
              user: { login: 'ai-code-reviewer-bot[bot]' },
              body: '<!-- ai-reviewer-summary-comment -->\n## Changes requested',
              state: 'CHANGES_REQUESTED',
            },
            {
              id: 102,
              user: { login: 'other-user' },
              state: 'CHANGES_REQUESTED',
            },
            {
              id: 103,
              user: { login: 'ai-code-reviewer-bot[bot]' },
              state: 'COMMENTED',
            },
          ],
        }),
        dismissReview: async (params: { review_id: number }) => {
          dismissedReviewIds.push(params.review_id);
          return { data: {} };
        },
      },
    },
  };

  await dismissStaleBotReviews(
    mockOctokit as any,
    'owner',
    'repo',
    1
  );

  // Only the bot's CHANGES_REQUESTED review (101) should be dismissed
  assert.deepEqual(dismissedReviewIds, [101]);
});

test('buildPRReviewPayload enforces maxComments limit, prioritizing critical > warning > suggestion and reporting omitted count', () => {
  // Generate 30 issues: 5 critical, 15 warning, 10 suggestion
  const issues: ReviewIssue[] = [];
  for (let i = 1; i <= 5; i++) {
    issues.push({
      file_path: `src/crit_${i}.ts`,
      line_number: i * 10,
      severity: 'critical',
      category: 'security',
      message: `Critical vulnerability #${i}`,
      fingerprint: `fp-crit-${i}`,
    });
  }
  for (let i = 1; i <= 15; i++) {
    issues.push({
      file_path: `src/warn_${i}.ts`,
      line_number: i * 10,
      severity: 'warning',
      category: 'bug',
      message: `Warning issue #${i}`,
      fingerprint: `fp-warn-${i}`,
    });
  }
  for (let i = 1; i <= 10; i++) {
    issues.push({
      file_path: `src/sugg_${i}.ts`,
      line_number: i * 10,
      severity: 'suggestion',
      category: 'style',
      message: `Suggestion issue #${i}`,
      fingerprint: `fp-sugg-${i}`,
    });
  }

  assert.equal(issues.length, 30);

  const maxComments = 10;
  const payload = buildPRReviewPayload(
    issues,
    '30 issues found in review',
    'REQUEST_CHANGES',
    [],
    [],
    undefined,
    maxComments
  );

  // 1. Exactly 10 comments posted inline
  assert.equal(payload.comments.length, 10);

  // 2. All 5 criticals must be included
  const postedCriticals = payload.comments.filter((c) => c.body.includes('CRITICAL'));
  assert.equal(postedCriticals.length, 5);

  // 3. The other 5 must be warnings (highest priority remaining)
  const postedWarnings = payload.comments.filter((c) => c.body.includes('WARNING'));
  assert.equal(postedWarnings.length, 5);

  // 4. Zero suggestions posted inline because critical + warning filled the cap
  const postedSuggestions = payload.comments.filter((c) => c.body.includes('SUGGESTION'));
  assert.equal(postedSuggestions.length, 0);

  // 5. Summary table in payload body MUST contain all 30 issues
  assert.match(payload.body, /\|\s+\*\*Total Issues\*\*\s+\|\s+\*\*30\*\*\s+\|/);
  assert.match(payload.body, /🔴 \*\*Critical\*\* \| 5/);
  assert.match(payload.body, /🟡 \*\*Warning\*\* \| 15/);
  assert.match(payload.body, /🔵 \*\*Suggestion\*\* \| 10/);

  // 6. Explicitly report that 20 findings were not posted inline
  assert.match(
    payload.body,
    /20 finding\(s\) not posted inline due to max comments limit \(capped at 10\)/
  );
});
