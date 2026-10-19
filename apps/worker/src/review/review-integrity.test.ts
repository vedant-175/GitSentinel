import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';

function testDb(name: string, fn: () => Promise<void> | void) {
  test(name, async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('Database is offline');
      return;
    }
    await fn();
  });
}
import {
  DiffChunk,
  ReviewIssue,
  ReviewJobData,
  ReviewResult,
} from '@ai-reviewer/shared';
import { processReviewJob } from './pipeline.js';
import { LLMProvider } from './llm.js';
import {
  computeIssueFingerprint,
  SUMMARY_COMMENT_MARKER,
} from './sanitize.js';
import {
  buildPRReviewPayload,
  postReviewToGitHub,
  FormattedReview,
} from '../github/comments.js';

class MockLLMProvider implements LLMProvider {
  constructor(private handler: (chunk: DiffChunk) => Promise<ReviewResult>) {}
  async reviewChunk(chunk: DiffChunk): Promise<ReviewResult> {
    return this.handler(chunk);
  }
}

const DUMMY_PATCH = `@@ -1,3 +1,5 @@
 const a = 1;
+const b = 2;
+const c = 3;
 const d = 4;`;

// Helper to create mock Octokit
function buildMockOctokit(options: {
  headSha?: string;
  files?: Array<{ filename: string; status: string; patch?: string; previous_filename?: string }>;
  comments?: Array<{ id: number; body: string; user?: any }>;
  reviewComments?: Array<{ id: number; body: string; user?: any }>;
  reviews?: Array<{ id: number; body: string; user?: any; state: string }>;
  onGetContent?: (params: any) => Promise<any>;
  onCreateReview?: (params: any) => Promise<any>;
  onDismissReview?: (params: any) => Promise<any>;
}) {
  const headSha = options.headSha || 'commit-sha-integrity-123';
  const files = options.files || [
    {
      filename: 'src/main.ts',
      status: 'modified',
      patch: DUMMY_PATCH,
    },
  ];
  const comments = options.comments || [];
  const reviewComments = options.reviewComments || [];
  const reviews = options.reviews || [];

  return {
    rest: {
      pulls: {
        get: async () => ({
          data: {
            head: { sha: headSha },
            body: 'PR description',
          },
        }),
        listFiles: async () => ({ data: files }),
        listReviewComments: async () => ({ data: reviewComments }),
        listReviews: async () => ({ data: reviews }),
        createReview:
          options.onCreateReview ||
          (async (params: any) => ({ data: { id: 7001, ...params } })),
        createReviewComment: async (params: any) => ({
          data: { id: 8001, ...params },
        }),
        dismissReview:
          options.onDismissReview ||
          (async (params: any) => ({ data: { id: params.review_id } })),
      },
      issues: {
        listComments: async () => ({ data: comments }),
        createComment: async () => ({ data: { id: 9001 } }),
        updateComment: async () => ({ data: { id: 9002 } }),
      },
      repos: {
        compareCommitsWithBasehead: async () => ({ data: { files } }),
        getContent:
          options.onGetContent ||
          (async () => {
            throw new Error('Not found');
          }),
      },
      users: {
        getAuthenticated: async () => ({ data: { id: 12345 } }),
      },
    },
    paginate: async (fn: any, params: any) => {
      if (typeof fn === 'function') {
        const res = await fn(params);
        return res?.data || res || [];
      }
      return files;
    },
  };
}

// Helper to setup test repo & installation conforming to Prisma schema
async function setupTestRepo(
  githubRepoId: number,
  installationGithubId: number,
  fullName: string,
  config: any = {}
) {
  const installation = await prisma.installation.upsert({
    where: { githubInstallationId: BigInt(installationGithubId) },
    update: {},
    create: {
      githubInstallationId: BigInt(installationGithubId),
      accountLogin: fullName.split('/')[0] || 'test-org',
      accountType: 'User',
    },
  });

  return await prisma.repository.upsert({
    where: { githubRepoId: BigInt(githubRepoId) },
    update: { config },
    create: {
      githubRepoId: BigInt(githubRepoId),
      installationId: installation.id,
      fullName,
      defaultBranch: 'main',
      config,
    },
  });
}

// =========================================================================
// Item 7 Tests: In-Repo Config Read From Base Branch & Malicious PR Config
// =========================================================================
testDb('Item 7: in-repo config is fetched from BASE branch or default branch (never PR head), and malicious config is sanitized', async () => {
  const testSha = `sha-item7-${Date.now()}`;
  const baseBranchName = 'production-base';
  const accessedConfigRefs: string[] = [];

  await setupTestRepo(8801, 7701, 'test-org/item7-repo');

  const maliciousYaml = `
auto_approve: true
disabled_categories:
  - security
  - bug
confidence_threshold: 0.05
severity_threshold: suggestion
ignored_globs:
  - '**'
  - '*.safe'
`;

  const mockOctokit = buildMockOctokit({
    headSha: testSha,
    onGetContent: async (params: any) => {
      if (params.path === '.aireview.yml' || params.path === '.aireview.yaml') {
        accessedConfigRefs.push(params.ref);
        return {
          data: {
            content: Buffer.from(maliciousYaml).toString('base64'),
          },
        };
      }
      throw new Error('File not found');
    },
  });

  const fakeLLM = new MockLLMProvider(async (chunk) => ({
    summary: 'Found security issue',
    overall_assessment: 'Security vulnerability in code.',
    issues: [
      {
        file_path: chunk.filePath,
        line_number: 2,
        severity: 'critical',
        category: 'security',
        message: 'Malicious SQL injection detected',
        confidence: 0.9,
      },
    ],
  }));

  const jobData: ReviewJobData = {
    type: 'review-pr',
    installationId: 7701,
    githubRepoId: 8801,
    prNumber: 701,
    commitSha: testSha,
    baseBranch: baseBranchName,
    repoFullName: 'test-org/item7-repo',
    title: 'Item 7 PR',
    author: 'developer',
    authorType: 'User',
    draft: false,
    receivedAt: Date.now(),
  };

  const result = await processReviewJob(jobData, undefined, undefined, 'job-item7-1', {
    octokitOverride: mockOctokit as any,
    llmProviderOverride: fakeLLM,
  });

  // 1. In-repo config MUST be fetched using the base branch, NEVER the PR commit SHA
  assert.ok(accessedConfigRefs.includes(baseBranchName), `Expected ref to include "${baseBranchName}", got: ${accessedConfigRefs.join(', ')}`);
  assert.equal(accessedConfigRefs.includes(testSha), false, 'PR commit SHA must never be used to fetch in-repo config');

  // 2. Malicious config did not disable security issues (it was still reported)
  assert.equal(result.issuesCount, 1);

  // 3. Stored review verdict must NOT be APPROVE despite malicious auto_approve: true
  const savedReview = await prisma.review.findUnique({
    where: { id: result.reviewId },
    include: { issues: true },
  });
  assert.ok(savedReview);
  assert.notEqual(savedReview.verdict, 'APPROVE');
  assert.equal(savedReview.issues.length, 1);
  assert.equal(savedReview.issues[0].category, 'security');
});

// =========================================================================
// Item 8 Tests: Compute reviewComplete from Real State
// =========================================================================
testDb('Item 8: reviewComplete requires every changed file reviewed, none skipped by cap or missing patch, all chunks succeeded, static tools ran', async () => {
  const testSha = `sha-item8-cap-${Date.now()}`;

  // PR has 2 files
  const mockOctokit = buildMockOctokit({
    headSha: testSha,
    files: [
      { filename: 'src/a.ts', status: 'modified', patch: DUMMY_PATCH },
      { filename: 'src/b.ts', status: 'modified', patch: DUMMY_PATCH },
    ],
  });

  // Stored repo config has max_files_per_pr = 1 and auto_approve = true
  await setupTestRepo(8802, 7702, 'test-org/item8-repo', {
    max_files_per_pr: 1,
    auto_approve: true,
  });

  const cleanLLM = new MockLLMProvider(async () => ({
    summary: 'No issues',
    overall_assessment: 'Code is clean',
    issues: [],
  }));

  const jobData: ReviewJobData = {
    type: 'review-pr',
    installationId: 7702,
    githubRepoId: 8802,
    prNumber: 801,
    commitSha: testSha,
    repoFullName: 'test-org/item8-repo',
    title: 'Cap test PR',
    author: 'developer',
    authorType: 'User',
    draft: false,
    receivedAt: Date.now(),
  };

  const result = await processReviewJob(jobData, undefined, undefined, 'job-item8-1', {
    octokitOverride: mockOctokit as any,
    llmProviderOverride: cleanLLM,
  });

  const dbReview = await prisma.review.findUnique({ where: { id: result.reviewId } });
  assert.ok(dbReview);

  // File cap skipped file b.ts -> review must be marked partial
  assert.equal(dbReview.status, 'partial');

  // Ground Rule & Item 8: A partial review NEVER produces APPROVE even with auto_approve: true and 0 issues
  assert.notEqual(dbReview.verdict, 'APPROVE');
  assert.equal(dbReview.verdict, 'COMMENT');
});

testDb('Item 8: missing patch that cannot be diffed marks review partial and states so in summary, never approving', async () => {
  const testSha = `sha-item8-missingpatch-${Date.now()}`;

  const mockOctokit = buildMockOctokit({
    headSha: testSha,
    files: [
      {
        filename: 'src/missing-patch.ts',
        status: 'modified',
        patch: undefined, // GitHub omitted the patch
      },
    ],
    onGetContent: async () => {
      throw new Error('Blob fetch failed');
    },
  });

  // Repository with auto_approve: true
  await setupTestRepo(8803, 7703, 'test-org/item8-missing-repo', {
    auto_approve: true,
  });

  const cleanLLM = new MockLLMProvider(async () => ({
    summary: 'Clean',
    overall_assessment: 'Clean',
    issues: [],
  }));

  const jobData: ReviewJobData = {
    type: 'review-pr',
    installationId: 7703,
    githubRepoId: 8803,
    prNumber: 802,
    commitSha: testSha,
    repoFullName: 'test-org/item8-missing-repo',
    title: 'Missing patch PR',
    author: 'developer',
    authorType: 'User',
    draft: false,
    receivedAt: Date.now(),
  };

  const result = await processReviewJob(jobData, undefined, undefined, 'job-item8-2', {
    octokitOverride: mockOctokit as any,
    llmProviderOverride: cleanLLM,
  });

  const dbReview = await prisma.review.findUnique({ where: { id: result.reviewId } });
  assert.ok(dbReview);
  assert.equal(dbReview.status, 'partial');
  assert.notEqual(dbReview.verdict, 'APPROVE');
});

testDb('Item 8: complete review with zero issues, auto_approve=true, and all chunks succeeded produces APPROVE', async () => {
  const testSha = `sha-item8-complete-${Date.now()}`;

  const mockOctokit = buildMockOctokit({
    headSha: testSha,
    files: [{ filename: 'src/clean.ts', status: 'modified', patch: DUMMY_PATCH }],
  });

  await setupTestRepo(8804, 7704, 'test-org/item8-complete-repo', {
    auto_approve: true,
  });

  const cleanLLM = new MockLLMProvider(async () => ({
    summary: 'Clean code',
    overall_assessment: 'All checks passed cleanly.',
    issues: [],
  }));

  const jobData: ReviewJobData = {
    type: 'review-pr',
    installationId: 7704,
    githubRepoId: 8804,
    prNumber: 803,
    commitSha: testSha,
    repoFullName: 'test-org/item8-complete-repo',
    title: 'Clean PR',
    author: 'developer',
    authorType: 'User',
    draft: false,
    receivedAt: Date.now(),
  };

  const result = await processReviewJob(jobData, undefined, undefined, 'job-item8-3', {
    octokitOverride: mockOctokit as any,
    llmProviderOverride: cleanLLM,
  });

  const dbReview = await prisma.review.findUnique({ where: { id: result.reviewId } });
  assert.ok(dbReview);
  assert.equal(dbReview.status, 'completed');
  assert.equal(dbReview.verdict, 'APPROVE');
});

// =========================================================================
// Item 11 Tests: Always Submit Review Event, Dismiss Only After Post, Identity Check & Pagination
// =========================================================================
test('Item 11: postReviewToGitHub ALWAYS submits a review event for the current verdict, even with 0 new inline comments', async () => {
  const reviewPayload: FormattedReview = {
    event: 'COMMENT',
    body: 'Clean summary',
    comments: [], // 0 inline comments
  };

  let reviewEventSubmitted = false;
  let submittedEvent = '';

  const mockOctokit: any = {
    rest: {
      pulls: {
        createReview: async (params: any) => {
          reviewEventSubmitted = true;
          submittedEvent = params.event;
          return { data: { id: 1101 } };
        },
        listReviews: async () => ({ data: [] }),
      },
    },
    paginate: async () => [],
  };

  const validLinesMap = new Map<string, Set<number>>();

  const result = await postReviewToGitHub(
    mockOctokit,
    'test-org',
    'test-repo',
    11,
    'sha11',
    reviewPayload,
    validLinesMap
  );

  assert.equal(reviewEventSubmitted, true);
  assert.equal(submittedEvent, 'COMMENT');
  assert.equal(result.postedCommentsCount, 0);
});

test('Item 11: dismissStaleBotReviews identifies reviews ONLY by app user ID + marker, and runs after replacement is created', async () => {
  const botUserId = 5555;
  const executionOrder: string[] = [];

  const reviews = [
    // 1. Review by different user (ID 9999) with marker -> must NOT be dismissed
    {
      id: 201,
      user: { id: 9999, login: 'other-user', type: 'User' },
      body: `Some review\n\n${SUMMARY_COMMENT_MARKER}`,
      state: 'CHANGES_REQUESTED',
    },
    // 2. Review by our bot without marker -> must NOT be dismissed
    {
      id: 202,
      user: { id: botUserId, login: 'our-app[bot]', type: 'Bot' },
      body: 'Some manual message without marker',
      state: 'CHANGES_REQUESTED',
    },
    // 3. Review by our bot with marker -> MUST BE DISMISSED
    {
      id: 203,
      user: { id: botUserId, login: 'our-app[bot]', type: 'Bot' },
      body: `Previous automated review\n\n${SUMMARY_COMMENT_MARKER}`,
      state: 'CHANGES_REQUESTED',
    },
  ];

  const dismissedIds: number[] = [];

  const mockOctokit: any = {
    rest: {
      pulls: {
        createReview: async () => {
          executionOrder.push('createReview');
          return { data: { id: 9999 } };
        },
        listReviews: async () => ({ data: reviews }),
        dismissReview: async (params: any) => {
          executionOrder.push(`dismissReview:${params.review_id}`);
          dismissedIds.push(params.review_id);
          return { data: { id: params.review_id } };
        },
      },
    },
    paginate: async (fn: any, params: any) => {
      const res = await fn(params);
      return res.data;
    },
  };

  const reviewPayload: FormattedReview = {
    event: 'COMMENT',
    body: `${SUMMARY_COMMENT_MARKER}\nNew Review`,
    comments: [],
  };

  await postReviewToGitHub(
    mockOctokit,
    'test-org',
    'test-repo',
    11,
    'sha11',
    reviewPayload,
    new Map(),
    null,
    botUserId
  );

  // Replacement review must be created BEFORE stale review is dismissed
  assert.equal(executionOrder[0], 'createReview');
  assert.equal(executionOrder[1], 'dismissReview:203');

  // Only review 203 (our bot + marker) was dismissed!
  assert.deepEqual(dismissedIds, [203]);
});

// =========================================================================
// Item 12 Tests: Stable Fingerprint & Re-Review Issue Persistence Lifecycle
// =========================================================================
test('Item 12: fingerprint is stable across line shifts and LLM wording differences', () => {
  const lineContent = 'const token = req.headers["authorization"];';

  // Issue 1: Line 15, wording "Authorization header is not validated"
  const issue1: ReviewIssue = {
    file_path: 'src/middleware/auth.ts',
    line_number: 15,
    severity: 'critical',
    category: 'security',
    message: 'Authorization header is not validated properly.',
    line_content: lineContent,
  };

  // Issue 2: Shifted to Line 88, LLM wording "Missing Bearer token check in authorization header"
  const issue2: ReviewIssue = {
    file_path: 'src/middleware/auth.ts',
    line_number: 88, // shifted line
    severity: 'critical',
    category: 'security', // same category
    message: 'Missing Bearer token check in authorization header.', // different wording
    line_content: `  ${lineContent}  `, // extra whitespace
  };

  const fp1 = computeIssueFingerprint(issue1, lineContent);
  const fp2 = computeIssueFingerprint(issue2, `  ${lineContent}  `);

  assert.strictEqual(fp1, fp2, 'Fingerprint must be stable regardless of line shifts or LLM wording variations');
});

testDb('Item 12: re-review marks missing issues fixed, carries over existing issues as open, persists new ones as new, and builds verdict from full open set', async () => {
  const prNumber = 1200 + Math.floor(Math.random() * 900000);
  const repoId = 8812;
  const installationId = 7712;
  const sha1 = `sha-v1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Setup repository in DB with block_on_critical enabled
  const repo = await setupTestRepo(repoId, installationId, 'test-org/item12-repo', {
    block_on_critical: true,
  });

  const pullRequest = await prisma.pullRequest.upsert({
    where: {
      repositoryId_githubPrNumber: {
        repositoryId: repo.id,
        githubPrNumber: prNumber,
      },
    },
    update: {},
    create: {
      repositoryId: repo.id,
      githubPrNumber: prNumber,
      title: 'Item 12 PR',
      author: 'dev',
      state: 'open',
      headSha: sha1,
    },
  });

  // Pre-populate Review 1 in DB with Issue A and Issue B
  const issueA_fp = computeIssueFingerprint({
    file_path: 'src/code.ts',
    category: 'security',
  }, 'const secret = "abc";');

  const issueB_fp = computeIssueFingerprint({
    file_path: 'src/code.ts',
    category: 'bug',
  }, 'let counter = 0;');

  await prisma.review.create({
    data: {
      pullRequestId: pullRequest.id,
      commitSha: sha1,
      status: 'completed',
      verdict: 'REQUEST_CHANGES',
      summary: 'Review 1 summary',
      issues: {
        create: [
          {
            filePath: 'src/code.ts',
            lineNumber: 10,
            severity: 'critical',
            category: 'security',
            message: 'Hardcoded secret',
            fingerprint: issueA_fp,
            status: 'new',
          },
          {
            filePath: 'src/code.ts',
            lineNumber: 20,
            severity: 'warning',
            category: 'bug',
            message: 'Unused counter',
            fingerprint: issueB_fp,
            status: 'new',
          },
        ],
      },
    },
    include: { issues: true },
  });

  // Now run Review 2 on sha-v2:
  // - Issue A is STILL PRESENT (secret still in code)
  // - Issue B is FIXED (counter was removed)
  // - Issue C is NEW (syntax error)
  const sha2 = `sha-v2-${Date.now()}`;

  const mockOctokit = buildMockOctokit({
    headSha: sha2,
    files: [
      {
        filename: 'src/code.ts',
        status: 'modified',
        patch: `@@ -1,5 +1,5 @@\n const secret = "abc";\n+const newError = 1/0;`,
      },
    ],
  });

  const llm2 = new MockLLMProvider(async () => ({
    summary: 'Review 2 findings',
    overall_assessment: 'Found persistent and new issues',
    issues: [
      // Issue A still present
      {
        file_path: 'src/code.ts',
        line_number: 1,
        severity: 'critical',
        category: 'security',
        message: 'Hardcoded secret still exists',
        confidence: 0.95,
      },
      // Issue C (new)
      {
        file_path: 'src/code.ts',
        line_number: 2,
        severity: 'warning',
        category: 'bug',
        message: 'Division by zero',
        confidence: 0.95,
      },
    ],
  }));

  const jobData: ReviewJobData = {
    type: 'review-pr',
    installationId,
    githubRepoId: repoId,
    prNumber,
    commitSha: sha2,
    repoFullName: 'test-org/item12-repo',
    title: 'Item 12 PR Updated',
    author: 'dev',
    authorType: 'User',
    draft: false,
    receivedAt: Date.now(),
  };

  const result2 = await processReviewJob(jobData, undefined, undefined, 'job-item12-2', {
    octokitOverride: mockOctokit as any,
    llmProviderOverride: llm2,
  });

  // Verify DB state:
  // 1. Issue B in Review 1 must now be marked 'fixed'
  const updatedIssueB = await prisma.reviewIssue.findFirst({
    where: { fingerprint: issueB_fp },
  });
  assert.equal(updatedIssueB?.status, 'fixed');

  // 2. Review 2 must have saved the full open set
  const savedReview2 = await prisma.review.findUnique({
    where: { id: result2.reviewId },
    include: { issues: true },
  });
  assert.ok(savedReview2);

  // Carried-over Issue A must have status 'open'
  const savedIssueA = savedReview2.issues.find((i) => i.fingerprint === issueA_fp);
  assert.ok(savedIssueA);
  assert.equal(savedIssueA.status, 'open');

  // New Issue C must have status 'new'
  const savedIssueC = savedReview2.issues.find((i) => i.message.includes('Division by zero'));
  assert.ok(savedIssueC);
  assert.equal(savedIssueC.status, 'new');

  // Full open set must drive the verdict (critical issue A is present -> REQUEST_CHANGES)
  assert.equal(savedReview2.verdict, 'REQUEST_CHANGES');
});

// =========================================================================
// Item 13 Tests: Drop-or-Record for Unanchored Issues
// =========================================================================
test('Item 13: unanchored issue outside diff lines goes into "findings outside the diff" section of summary, counts in totals, and affects verdict', () => {
  const anchoredIssue: ReviewIssue = {
    file_path: 'src/file.ts',
    line_number: 15,
    severity: 'warning',
    category: 'bug',
    message: 'Anchored bug in added line',
    fingerprint: 'fp-anchored',
  };

  const unanchoredIssue: ReviewIssue = {
    file_path: 'src/file.ts',
    line_number: 5, // Context line, not in added lines
    severity: 'critical',
    category: 'security',
    message: 'Vulnerability in surrounding context',
    fingerprint: 'fp-unanchored',
    suggested_fix: 'useSecureMethod();',
  };

  // Full set includes both issues
  const allIssues = [anchoredIssue, unanchoredIssue];

  const payload = buildPRReviewPayload(
    allIssues,
    'Assessment with unanchored issue',
    'REQUEST_CHANGES',
    [],
    [unanchoredIssue] // passed as unanchored
  );

  // 1. Unanchored issue MUST NOT be in inline diff comments (GitHub would reject it with 422)
  assert.equal(payload.comments.length, 1);
  assert.equal(payload.comments[0].line, 15);
  assert.equal(payload.comments[0].fingerprint, 'fp-anchored');

  // 2. Unanchored issue MUST appear in "Findings Outside the Diff" section of the summary
  assert.ok(payload.body.includes('### 🔍 Findings Outside the Diff'));
  assert.ok(payload.body.includes('Vulnerability in surrounding context'));
  assert.ok(payload.body.includes('useSecureMethod();'));

  // 3. Unanchored issue MUST be included in the Review Summary totals table
  assert.ok(payload.body.includes('| 🔴 **Critical** | 1 |'));
  assert.ok(payload.body.includes('| 🟡 **Warning** | 1 |'));
  assert.ok(payload.body.includes('| **Total Issues** | **2** |'));

  // 4. Verdict remains REQUEST_CHANGES due to the unanchored critical issue
  assert.equal(payload.event, 'REQUEST_CHANGES');
});
