import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { POST } from './route.js';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
} from '@/lib/auth-helpers';
import { setOctokitOverrideForTest } from '@/lib/github';
import { setEnqueueReviewJobOverride } from '@/lib/queue';

function dbTest(name: string, fn: () => Promise<void> | void) {
  test(name, async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    await fn();
  });
}

const installationId = BigInt(445566);
const otherInstallationId = BigInt(999999);
let inst: any;
let repo: any;
let pr: any;

before(async () => {
  if (!(await isDatabaseAvailable())) return;
  inst = await prisma.installation.upsert({
    where: { githubInstallationId: installationId },
    update: {},
    create: {
      githubInstallationId: installationId,
      accountLogin: 'rerun-test-org',
      accountType: 'Organization',
    },
  });

  repo = await prisma.repository.upsert({
    where: { githubRepoId: BigInt(771234) },
    update: {},
    create: {
      githubRepoId: BigInt(771234),
      fullName: 'rerun-test-org/rerun-repo',
      installationId: inst.id,
    },
  });

  pr = await prisma.pullRequest.upsert({
    where: {
      repositoryId_githubPrNumber: {
        repositoryId: repo.id,
        githubPrNumber: 42,
      },
    },
    update: {},
    create: {
      repositoryId: repo.id,
      githubPrNumber: 42,
      title: 'PR for Rerun Test',
      author: 'rerun-dev',
      headSha: '1111222233334444555566667777888899990000',
      state: 'open',
    },
  });
});

after(async () => {
  setSessionOverride(null);
  setSessionInstallationIdsOverride(null);
  setOctokitOverrideForTest(null);
  setEnqueueReviewJobOverride(null);

  if (await isDatabaseAvailable()) {
    if (pr) {
      await prisma.reviewIssue.deleteMany({
        where: { review: { pullRequestId: pr.id } },
      });
      await prisma.review.deleteMany({
        where: { pullRequestId: pr.id },
      });
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
    user: { id: 'test-user-1', login: 'test-user' },
  }));
  setSessionInstallationIdsOverride(async () => [installationId]);
  setOctokitOverrideForTest(() => ({
    rest: {
      pulls: {
        get: async () => ({
          data: {
            head: {
              sha: '1111222233334444555566667777888899990000',
              ref: 'feature-branch',
            },
            base: { ref: 'main' },
            title: 'PR for Rerun Test',
            user: { login: 'rerun-dev', type: 'User' },
            draft: false,
          },
        }),
      },
    },
  } as any));
  setEnqueueReviewJobOverride(async (jobData) => {
    return `job-${jobData.prNumber}-${jobData.commitSha.substring(0, 7)}`;
  });
}

dbTest('1. unauthenticated user returns 401', async () => {
  setupDefaultMocks();
  setSessionOverride(async () => null);

  const req = new NextRequest(`http://localhost:3000/api/pull-requests/${pr.id}/reviews`, {
    method: 'POST',
  });
  const res = await POST(req, { params: { id: String(pr.id) } });

  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.error, 'Unauthorized');
});

dbTest('2. unauthorized user returns 403', async () => {
  setupDefaultMocks();
  setSessionInstallationIdsOverride(async () => [otherInstallationId]);

  const req = new NextRequest(`http://localhost:3000/api/pull-requests/${pr.id}/reviews`, {
    method: 'POST',
  });
  const res = await POST(req, { params: { id: String(pr.id) } });

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.error, 'Forbidden');
});

dbTest('3. missing PR returns 404', async () => {
  setupDefaultMocks();
  const missingPrId = 9999999;
  const req = new NextRequest(`http://localhost:3000/api/pull-requests/${missingPrId}/reviews`, {
    method: 'POST',
  });
  const res = await POST(req, { params: { id: String(missingPrId) } });

  assert.equal(res.status, 404);
  const json = await res.json();
  assert.equal(json.error, 'Not Found');
});

dbTest('4. GitHub API failure returns 502 Bad Gateway', async () => {
  setupDefaultMocks();
  setOctokitOverrideForTest(() => ({
    rest: {
      pulls: {
        get: async () => {
          throw new Error('GitHub API 500: Server error from upstream');
        },
      },
    },
  } as any));

  const req = new NextRequest(`http://localhost:3000/api/pull-requests/${pr.id}/reviews`, {
    method: 'POST',
  });
  const res = await POST(req, { params: { id: String(pr.id) } });

  assert.equal(res.status, 502);
  const json = await res.json();
  assert.equal(json.error, 'Bad Gateway');
  assert.match(json.message, /GitHub API/i);
});

dbTest('5. queue failure returns 503 Service Unavailable', async () => {
  setupDefaultMocks();
  setEnqueueReviewJobOverride(async () => {
    throw new Error('Redis connection refused: ECONNREFUSED');
  });

  const req = new NextRequest(`http://localhost:3000/api/pull-requests/${pr.id}/reviews`, {
    method: 'POST',
  });
  const res = await POST(req, { params: { id: String(pr.id) } });

  assert.equal(res.status, 503);
  const json = await res.json();
  assert.equal(json.error, 'Service Unavailable');
});

dbTest('6. successful enqueue creates/updates review and returns 202 Accepted', async () => {
  setupDefaultMocks();
  const req = new NextRequest(`http://localhost:3000/api/pull-requests/${pr.id}/reviews`, {
    method: 'POST',
  });
  const res = await POST(req, { params: { id: String(pr.id) } });

  assert.equal(res.status, 202);
  const json = await res.json();
  assert.equal(json.status, 'queued');
  assert.ok(json.reviewId, 'reviewId must be returned');
  assert.ok(json.jobId, 'jobId must be returned');
  assert.equal(json.commitSha, '1111222233334444555566667777888899990000');

  // Verify DB state
  const createdReview = await prisma.review.findUnique({
    where: { id: json.reviewId },
  });
  assert.ok(createdReview, 'Review record must exist in DB');
  assert.equal(createdReview?.status, 'pending');
  assert.equal(createdReview?.commitSha, '1111222233334444555566667777888899990000');
});

dbTest('7. duplicate review returns 409 Conflict', async () => {
  setupDefaultMocks();
  // Review is already in status 'pending' from previous test
  const req = new NextRequest(`http://localhost:3000/api/pull-requests/${pr.id}/reviews`, {
    method: 'POST',
  });
  const res = await POST(req, { params: { id: String(pr.id) } });

  assert.equal(res.status, 409);
  const json = await res.json();
  assert.equal(json.error, 'Conflict');
  assert.match(json.message, /already in progress/);
});
