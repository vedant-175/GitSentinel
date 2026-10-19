import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
} from '@/lib/auth-helpers';
import { GET as getRepoAnalytics } from './repositories/[id]/analytics/route.js';
import { GET as getPullRequests } from './pull-requests/route.js';
import { POST as postReviewRerun } from './pull-requests/[id]/reviews/route.js';
import { GET as getReviewIssues } from './reviews/[id]/issues/route.js';
import { PATCH as patchReviewIssue } from './reviews/[id]/issues/[issueId]/route.js';
import { PATCH as patchBatchReviewIssues } from './reviews/[id]/issues/route.js';
import { GET as getSarifReport } from './reviews/[id]/sarif/route.js';
import { POST as retryFailedReview } from './failed-reviews/[id]/retry/route.js';
import { updateRepoConfig } from '../actions/repo-actions.js';
import { getPullRequestById, getPullRequests as getDataPullRequests } from '@/lib/data';
import { ForbiddenError, setRoleOverride } from '@/lib/auth-helpers';

function dbTest(name: string, fn: () => Promise<void> | void) {
  test(name, async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    await fn();
  });
}

const INSTALLATION_A = BigInt(111001);
const INSTALLATION_B = BigInt(222002);

let instA: any;
let repoA: any;
let prA: any;
let reviewA: any;
let _issueA: any;
let failedReviewA: any;

let instB: any;
let repoB: any;
let prB: any;
let reviewB: any;
let issueB: any;
let failedReviewB: any;

before(async () => {
  if (!(await isDatabaseAvailable())) return;
  // Tenant A Setup
  instA = await prisma.installation.upsert({
    where: { githubInstallationId: INSTALLATION_A },
    update: {},
    create: {
      githubInstallationId: INSTALLATION_A,
      accountLogin: 'org-a',
      accountType: 'Organization',
    },
  });

  repoA = await prisma.repository.upsert({
    where: { githubRepoId: BigInt(10001) },
    update: {},
    create: {
      githubRepoId: BigInt(10001),
      fullName: 'org-a/repo-a',
      installationId: instA.id,
    },
  });

  prA = await prisma.pullRequest.upsert({
    where: {
      repositoryId_githubPrNumber: {
        repositoryId: repoA.id,
        githubPrNumber: 1,
      },
    },
    update: {},
    create: {
      repositoryId: repoA.id,
      githubPrNumber: 1,
      title: 'PR A',
      author: 'alice',
      headSha: 'aaaa111122223333444455556666777788889999',
      state: 'open',
    },
  });

  reviewA = await prisma.review.upsert({
    where: {
      pullRequestId_commitSha: {
        pullRequestId: prA.id,
        commitSha: prA.headSha,
      },
    },
    update: {},
    create: {
      pullRequestId: prA.id,
      commitSha: prA.headSha,
      status: 'completed',
    },
  });

  _issueA = await prisma.reviewIssue.create({
    data: {
      reviewId: reviewA.id,
      filePath: 'src/index.ts',
      lineNumber: 10,
      severity: 'warning',
      category: 'bug',
      message: 'Bug in A',
      status: 'open',
      fingerprint: 'fp-a-1',
    },
  });

  failedReviewA = await prisma.failedReview.create({
    data: {
      pullRequestId: prA.id,
      commitSha: prA.headSha,
      errorMessage: 'Simulated failure in Tenant A',
      jobData: {
        installationId: Number(INSTALLATION_A),
        repoFullName: repoA.fullName,
        prNumber: prA.githubPrNumber,
        commitSha: prA.headSha,
      },
    },
  });

  // Tenant B Setup
  instB = await prisma.installation.upsert({
    where: { githubInstallationId: INSTALLATION_B },
    update: {},
    create: {
      githubInstallationId: INSTALLATION_B,
      accountLogin: 'org-b',
      accountType: 'Organization',
    },
  });

  repoB = await prisma.repository.upsert({
    where: { githubRepoId: BigInt(20002) },
    update: {},
    create: {
      githubRepoId: BigInt(20002),
      fullName: 'org-b/repo-b',
      installationId: instB.id,
    },
  });

  prB = await prisma.pullRequest.upsert({
    where: {
      repositoryId_githubPrNumber: {
        repositoryId: repoB.id,
        githubPrNumber: 2,
      },
    },
    update: {},
    create: {
      repositoryId: repoB.id,
      githubPrNumber: 2,
      title: 'PR B',
      author: 'bob',
      headSha: 'bbbb111122223333444455556666777788889999',
      state: 'open',
    },
  });

  reviewB = await prisma.review.upsert({
    where: {
      pullRequestId_commitSha: {
        pullRequestId: prB.id,
        commitSha: prB.headSha,
      },
    },
    update: {},
    create: {
      pullRequestId: prB.id,
      commitSha: prB.headSha,
      status: 'completed',
    },
  });

  issueB = await prisma.reviewIssue.create({
    data: {
      reviewId: reviewB.id,
      filePath: 'src/secret.ts',
      lineNumber: 42,
      severity: 'critical',
      category: 'security',
      message: 'Confidential vulnerability in Tenant B',
      status: 'open',
      fingerprint: 'fp-b-1',
    },
  });

  failedReviewB = await prisma.failedReview.create({
    data: {
      pullRequestId: prB.id,
      commitSha: prB.headSha,
      errorMessage: 'Simulated failure in Tenant B',
      jobData: {
        installationId: Number(INSTALLATION_B),
        repoFullName: repoB.fullName,
        prNumber: prB.githubPrNumber,
        commitSha: prB.headSha,
      },
    },
  });
});

after(async () => {
  setSessionOverride(null);
  setSessionInstallationIdsOverride(null);
  if (!(await isDatabaseAvailable())) return;

  await prisma.reviewIssue.deleteMany({
    where: { reviewId: { in: [reviewA.id, reviewB.id] } },
  });
  await prisma.failedReview.deleteMany({
    where: { id: { in: [failedReviewA.id, failedReviewB.id] } },
  });
  await prisma.review.deleteMany({
    where: { id: { in: [reviewA.id, reviewB.id] } },
  });
  await prisma.pullRequest.deleteMany({
    where: { id: { in: [prA.id, prB.id] } },
  });
  await prisma.repository.deleteMany({
    where: { id: { in: [repoA.id, repoB.id] } },
  });
  await prisma.installation.deleteMany({
    where: { id: { in: [instA.id, instB.id] } },
  });
});

// Configure User A session: authorized ONLY for Installation A
function authenticateAsTenantA() {
  setSessionOverride(async () => ({
    user: { id: 'user-tenant-a', login: 'alice-admin' },
  }));
  setSessionInstallationIdsOverride(async () => [INSTALLATION_A]);
}

dbTest('Tenant Isolation: User A → Repository B analytics must be rejected with 403', async () => {
  authenticateAsTenantA();

  const req = new NextRequest(`http://localhost:3000/api/repositories/${repoB.id}/analytics`);
  const res = await getRepoAnalytics(req, { params: { id: String(repoB.id) } });

  assert.equal(res.status, 403, 'Cross-tenant repository analytics query must return 403 Forbidden');
  const body = await res.json();
  assert.equal(body.error, 'Forbidden');
});

dbTest('Tenant Isolation: User A → PR B list/query must be rejected with 403', async () => {
  authenticateAsTenantA();

  const req = new NextRequest(`http://localhost:3000/api/pull-requests?repo_id=${repoB.id}`);
  const res = await getPullRequests(req);

  assert.equal(res.status, 403, 'Cross-tenant PR query must return 403 Forbidden');
  const body = await res.json();
  assert.equal(body.error, 'Forbidden');
});

dbTest('Tenant Isolation: User A → PR B review rerun must be rejected with 403', async () => {
  authenticateAsTenantA();

  const req = new NextRequest(`http://localhost:3000/api/pull-requests/${prB.id}/reviews`, {
    method: 'POST',
  });
  const res = await postReviewRerun(req, { params: { id: String(prB.id) } });

  assert.equal(res.status, 403, 'Cross-tenant review rerun must return 403 Forbidden');
  const body = await res.json();
  assert.equal(body.error, 'Forbidden');
});

dbTest('Tenant Isolation: User A → Review B issues must be rejected with 403', async () => {
  authenticateAsTenantA();

  const req = new NextRequest(`http://localhost:3000/api/reviews/${reviewB.id}/issues`);
  const res = await getReviewIssues(req, { params: { id: String(reviewB.id) } });

  assert.equal(res.status, 403, 'Cross-tenant review issues fetch must return 403 Forbidden');
  const body = await res.json();
  assert.equal(body.error, 'Forbidden');
});

dbTest('Tenant Isolation: User A → Issue B status update must be rejected with 403', async () => {
  authenticateAsTenantA();

  const req = new NextRequest(
    `http://localhost:3000/api/reviews/${reviewB.id}/issues/${issueB.id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'DISMISSED' }),
    }
  );
  const res = await patchReviewIssue(req, {
    params: { id: String(reviewB.id), issueId: String(issueB.id) },
  });

  assert.equal(res.status, 403, 'Cross-tenant issue status patch must return 403 Forbidden');
  const body = await res.json();
  assert.equal(body.error, 'Forbidden');
});

dbTest('Tenant Isolation: User A → FailedReview B retry must be rejected with 403', async () => {
  authenticateAsTenantA();

  const req = new NextRequest(
    `http://localhost:3000/api/failed-reviews/${failedReviewB.id}/retry`,
    { method: 'POST' }
  );
  const res = await retryFailedReview(req, {
    params: { id: String(failedReviewB.id) },
  });

  assert.equal(res.status, 403, 'Cross-tenant failed review retry must return 403 Forbidden');
  const body = await res.json();
  assert.equal(body.error, 'Forbidden');
});

dbTest('Tenant Isolation: User A → updateRepoConfig on Repository B must be rejected', async () => {
  authenticateAsTenantA();

  const result = await updateRepoConfig(repoB.id, {
    auto_approve: true,
    block_on_critical: false,
  });

  assert.equal(result.success, false, 'Cross-tenant configuration update must fail');
  assert.match(result.error || '', /Forbidden|Access denied/i);
});

// Configure User B session: authorized ONLY for Installation B
function authenticateAsTenantB() {
  setSessionOverride(async () => ({
    user: { id: 'user-tenant-b', login: 'bob-owner' },
  }));
  setSessionInstallationIdsOverride(async () => [INSTALLATION_B]);
  setRoleOverride(null);
}

function authenticateUnauthenticated() {
  setSessionOverride(null);
  setSessionInstallationIdsOverride(null);
  setRoleOverride(null);
}

// -------------------------------------------------------------
// P0 Regression Tests: SARIF Export Access Control
// -------------------------------------------------------------
dbTest('P0 Regression: Unauthenticated request to SARIF export returns 401', async () => {
  authenticateUnauthenticated();

  const req = new NextRequest(`http://localhost:3000/api/reviews/${reviewB.id}/sarif`);
  const res = await getSarifReport(req, { params: { id: String(reviewB.id) } });

  assert.equal(res.status, 401, 'Unauthenticated SARIF export must return 401 Unauthorized');
  const body = await res.json();
  assert.equal(body.error, 'Unauthorized');
});

dbTest('P0 Regression: Cross-tenant User A request to Review B SARIF export returns 403', async () => {
  authenticateAsTenantA();

  const req = new NextRequest(`http://localhost:3000/api/reviews/${reviewB.id}/sarif`);
  const res = await getSarifReport(req, { params: { id: String(reviewB.id) } });

  assert.equal(res.status, 403, 'Cross-tenant SARIF export must return 403 Forbidden');
  const body = await res.json();
  assert.equal(body.error, 'Forbidden');
});

dbTest('P0 Regression: Authorized Tenant B user request to Review B SARIF export succeeds with 200', async () => {
  authenticateAsTenantB();

  const req = new NextRequest(`http://localhost:3000/api/reviews/${reviewB.id}/sarif`);
  const res = await getSarifReport(req, { params: { id: String(reviewB.id) } });

  assert.equal(res.status, 200, 'Authorized SARIF export must return 200 OK');
  assert.ok(res.headers.get('content-type')?.includes('application/sarif+json'));
});

// -------------------------------------------------------------
// P0 Regression Tests: Pull Request Detail BOLA Protection
// -------------------------------------------------------------
dbTest('P0 Regression: Cross-tenant User A accessing getPullRequestById(prB.id) throws ForbiddenError', async () => {
  authenticateAsTenantA();

  await assert.rejects(
    async () => {
      await getPullRequestById(prB.id);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError || err.name === 'ForbiddenError');
      return true;
    },
    'Cross-tenant pull request access must throw ForbiddenError'
  );
});

dbTest('P0 Regression: Authorized Tenant B accessing getPullRequestById(prB.id) succeeds', async () => {
  authenticateAsTenantB();

  const { data: pr } = await getPullRequestById(prB.id);
  assert.ok(pr);
  assert.equal(pr.id, prB.id);
  assert.equal(pr.repositoryId, repoB.id);
});

// -------------------------------------------------------------
// P1 Regression Tests: Data Layer Query Scoping with repoId
// -------------------------------------------------------------
dbTest('P1 Regression: User A querying getPullRequests with repoB.id returns empty results (no tenant leak)', async () => {
  authenticateAsTenantA();

  // User A supplies Tenant B's repository ID
  const result = await getDataPullRequests({ repoId: repoB.id });
  assert.equal(result.data.length, 0, 'Cross-tenant repoId in data loader must never return Tenant B PRs');
});

dbTest('P1 Regression: User B querying getPullRequests with repoB.id returns Tenant B PRs', async () => {
  authenticateAsTenantB();

  const result = await getDataPullRequests({ repoId: repoB.id });
  assert.equal(result.data.length, 1, 'Authorized user querying own repoId returns their PR');
  assert.equal(result.data[0].id, prB.id);
});

// -------------------------------------------------------------
// P1 Regression Tests: Issue Batch PATCH Endpoint RBAC & Tenancy
// -------------------------------------------------------------
dbTest('P1 Regression: User A cannot dismiss Issue B via PATCH /api/reviews/[id]/issues (returns 403)', async () => {
  authenticateAsTenantA();

  const req = new NextRequest(`http://localhost:3000/api/reviews/${reviewB.id}/issues`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ issueId: issueB.id, status: 'dismissed' }),
  });
  const res = await patchBatchReviewIssues(req, { params: { id: String(reviewB.id) } });

  assert.equal(res.status, 403, 'Cross-tenant batch issue update must return 403');
});

dbTest('P1 Regression: User B with VIEWER role cannot dismiss issue via PATCH /api/reviews/[id]/issues (returns 403)', async () => {
  authenticateAsTenantB();
  setRoleOverride(() => 'VIEWER');

  const req = new NextRequest(`http://localhost:3000/api/reviews/${reviewB.id}/issues`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ issueId: issueB.id, status: 'dismissed' }),
  });
  const res = await patchBatchReviewIssues(req, { params: { id: String(reviewB.id) } });

  assert.equal(res.status, 403, 'VIEWER role cannot dismiss issue via batch endpoint');
  const body = await res.json();
  assert.equal(body.error, 'Forbidden');
});

dbTest('P1 Regression: User B with OWNER role can dismiss issue via PATCH /api/reviews/[id]/issues (returns 200 and audits)', async () => {
  authenticateAsTenantB();
  setRoleOverride(() => 'OWNER');

  const req = new NextRequest(`http://localhost:3000/api/reviews/${reviewB.id}/issues`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ issueId: issueB.id, status: 'dismissed' }),
  });
  const res = await patchBatchReviewIssues(req, { params: { id: String(reviewB.id) } });

  assert.equal(res.status, 200, 'OWNER role can dismiss issue');

  // Verify audit log entry was created
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      installationId: instB.id,
      action: 'issue.dismissed',
      resourceId: String(issueB.id),
    },
  });
  assert.ok(auditLogs.length > 0, 'Audit log entry must be created when issue is dismissed');
});

