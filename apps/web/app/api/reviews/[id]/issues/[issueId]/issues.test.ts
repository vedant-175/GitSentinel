import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { PATCH } from './route.js';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
} from '@/lib/auth-helpers';

function dbTest(name: string, fn: () => Promise<void> | void) {
  test(name, async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    await fn();
  });
}

const installationId = BigInt(556677);
const otherInstallationId = BigInt(123123);
let inst: any;
let repo: any;
let pr: any;
let review: any;
let issue: any;

before(async () => {
  if (!(await isDatabaseAvailable())) return;
  inst = await prisma.installation.upsert({
    where: { githubInstallationId: installationId },
    update: {},
    create: {
      githubInstallationId: installationId,
      accountLogin: 'issue-test-org',
      accountType: 'Organization',
    },
  });

  repo = await prisma.repository.upsert({
    where: { githubRepoId: BigInt(661234) },
    update: {},
    create: {
      githubRepoId: BigInt(661234),
      fullName: 'issue-test-org/issue-repo',
      installationId: inst.id,
    },
  });

  pr = await prisma.pullRequest.upsert({
    where: {
      repositoryId_githubPrNumber: {
        repositoryId: repo.id,
        githubPrNumber: 15,
      },
    },
    update: {},
    create: {
      repositoryId: repo.id,
      githubPrNumber: 15,
      title: 'PR for Issue Dismissal Test',
      author: 'issue-dev',
      headSha: 'aabbccddeeff00112233445566778899aabbccdd',
      state: 'open',
    },
  });

  review = await prisma.review.upsert({
    where: {
      pullRequestId_commitSha: {
        pullRequestId: pr.id,
        commitSha: pr.headSha,
      },
    },
    update: {},
    create: {
      pullRequestId: pr.id,
      commitSha: pr.headSha,
      status: 'completed',
      verdict: 'REQUEST_CHANGES',
    },
  });

  issue = await prisma.reviewIssue.create({
    data: {
      reviewId: review.id,
      filePath: 'src/auth/token.ts',
      lineNumber: 42,
      severity: 'critical',
      category: 'security',
      message: 'Hardcoded API secret token detected in source',
      status: 'open',
    },
  });
});

after(async () => {
  setSessionOverride(null);
  setSessionInstallationIdsOverride(null);

  if (await isDatabaseAvailable()) {
    if (issue) {
      await prisma.reviewIssue.deleteMany({
        where: { reviewId: review.id },
      });
    }
    if (review) {
      await prisma.review.deleteMany({
        where: { id: review.id },
      });
    }
    if (pr) {
      await prisma.pullRequest.deleteMany({
        where: { id: pr.id },
      });
    }
    if (repo) {
      await prisma.repository.deleteMany({
        where: { id: repo.id },
      });
    }
    if (inst) {
      await prisma.installation.deleteMany({
        where: { id: inst.id },
      });
    }
  }
});

function setupDefaultMocks() {
  setSessionOverride(async () => ({
    user: { id: 'test-user-issue', login: 'issue-tester' },
  }));
  setSessionInstallationIdsOverride(async () => [installationId]);
}

dbTest('1. unauthenticated user returns 401', async () => {
  setupDefaultMocks();
  setSessionOverride(async () => null);

  const req = new NextRequest(
    `http://localhost:3000/api/reviews/${review.id}/issues/${issue.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DISMISSED' }),
    }
  );
  const res = await PATCH(req, {
    params: { id: String(review.id), issueId: String(issue.id) },
  });

  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.error, 'Unauthorized');
});

dbTest('2. unauthorized user returns 403', async () => {
  setupDefaultMocks();
  setSessionInstallationIdsOverride(async () => [otherInstallationId]);

  const req = new NextRequest(
    `http://localhost:3000/api/reviews/${review.id}/issues/${issue.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DISMISSED' }),
    }
  );
  const res = await PATCH(req, {
    params: { id: String(review.id), issueId: String(issue.id) },
  });

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.error, 'Forbidden');
});

dbTest('3. missing review or missing issue returns 404', async () => {
  setupDefaultMocks();
  const missingIssueId = 9999999;
  const req = new NextRequest(
    `http://localhost:3000/api/reviews/${review.id}/issues/${missingIssueId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DISMISSED' }),
    }
  );
  const res = await PATCH(req, {
    params: { id: String(review.id), issueId: String(missingIssueId) },
  });

  assert.equal(res.status, 404);
  const json = await res.json();
  assert.equal(json.error, 'Not Found');
});

dbTest('4. invalid status returns 400 Bad Request', async () => {
  setupDefaultMocks();
  const req = new NextRequest(
    `http://localhost:3000/api/reviews/${review.id}/issues/${issue.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'INVALID_STATUS' }),
    }
  );
  const res = await PATCH(req, {
    params: { id: String(review.id), issueId: String(issue.id) },
  });

  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error, 'Bad Request');
});

dbTest('5. valid dismissal persists in DB and returns 200 OK', async () => {
  setupDefaultMocks();
  const req = new NextRequest(
    `http://localhost:3000/api/reviews/${review.id}/issues/${issue.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DISMISSED' }),
    }
  );
  const res = await PATCH(req, {
    params: { id: String(review.id), issueId: String(issue.id) },
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.issue.status, 'DISMISSED');

  // Verify database state directly
  const updated = await prisma.reviewIssue.findUnique({
    where: { id: issue.id },
  });
  assert.equal(updated?.status, 'dismissed');
});

dbTest('6. repeated update with same status is idempotent (200 OK)', async () => {
  setupDefaultMocks();
  const req = new NextRequest(
    `http://localhost:3000/api/reviews/${review.id}/issues/${issue.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DISMISSED' }),
    }
  );
  const res = await PATCH(req, {
    params: { id: String(review.id), issueId: String(issue.id) },
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.issue.status, 'DISMISSED');
});
