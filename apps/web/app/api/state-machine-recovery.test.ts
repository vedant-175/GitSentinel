import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { isPortReachable } from '@ai-reviewer/shared';
import { Redis } from 'ioredis';
import { POST as rerunReview } from './pull-requests/[id]/reviews/route.js';
import { POST as retryFailedReview } from './failed-reviews/[id]/retry/route.js';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
} from '@/lib/auth-helpers';
import { setOctokitOverrideForTest } from '@/lib/github';
import { setEnqueueReviewJobOverride, reviewQueue } from '@/lib/queue';
import { reapStaleReviews } from '../../../worker/src/review/reaper.js';

function stateTest(name: string, fn: () => Promise<void> | void) {
  test(name, async (t) => {
    if (!(await isDatabaseAvailable()) || !(await isPortReachable(6379))) {
      t.skip('PostgreSQL & Redis required');
      return;
    }
    await fn();
  });
}

describe('Review / Retry / Job State Machine & Safe Recovery Tests', () => {
  const installationId = BigInt(334455);
  let redis: Redis;
  let inst: any;
  let repo: any;
  let pr: any;

  before(async () => {
    if (!(await isDatabaseAvailable()) || !(await isPortReachable(6379))) return;
    redis = new Redis('redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    inst = await prisma.installation.upsert({
      where: { githubInstallationId: installationId },
      update: {},
      create: {
        githubInstallationId: installationId,
        accountLogin: 'state-machine-test-org',
        accountType: 'Organization',
      },
    });

    repo = await prisma.repository.upsert({
      where: { githubRepoId: BigInt(667788) },
      update: {},
      create: {
        githubRepoId: BigInt(667788),
        fullName: 'state-machine-test-org/state-machine-repo',
        installationId: inst.id,
      },
    });

    pr = await prisma.pullRequest.upsert({
      where: {
        repositoryId_githubPrNumber: {
          repositoryId: repo.id,
          githubPrNumber: 101,
        },
      },
      update: {},
      create: {
        repositoryId: repo.id,
        githubPrNumber: 101,
        title: 'State Machine PR',
        author: 'state-machine-dev',
        headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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
        await prisma.failedReview.deleteMany({
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
    if (redis) {
      await redis.quit().catch(() => {});
    }
  });

  function setupAuthMocks() {
    setSessionOverride(async () => ({
      user: { id: 'state-machine-tester', login: 'state-machine-tester' },
    }));
    setSessionInstallationIdsOverride(async () => [installationId]);
    setOctokitOverrideForTest(() => ({
      rest: {
        pulls: {
          get: async () => ({
            data: {
              head: {
                sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                ref: 'feature/recovery',
              },
              base: { ref: 'main' },
              title: 'State Machine PR',
              user: { login: 'state-machine-dev', type: 'User' },
              draft: false,
            },
          }),
        },
      },
    } as any));
  }

  stateTest('Transition 1: DB update succeeds but queue enqueue fails -> Review marked failed, FailedReview recorded in DLQ', async () => {
    setupAuthMocks();

    // Inject queue enqueue failure (e.g. Redis disconnects)
    setEnqueueReviewJobOverride(async () => {
      throw new Error('Simulated Redis outage: connection refused ECONNREFUSED');
    });

    const req = new NextRequest(`http://localhost:3000/api/pull-requests/${pr.id}/reviews`, {
      method: 'POST',
    });
    const res = await rerunReview(req, { params: { id: String(pr.id) } });

    assert.equal(res.status, 503, 'Must return 503 Service Unavailable when queue enqueue fails');
    const json = await res.json();
    assert.equal(json.error, 'Service Unavailable');

    // Verify Review DB record transition
    const failedReviewRecord = await prisma.review.findFirst({
      where: {
        pullRequestId: pr.id,
        commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    });
    assert.ok(failedReviewRecord, 'Review record must exist in DB');
    assert.equal(failedReviewRecord.status, 'failed', 'Review status must be failed');
    assert.equal(failedReviewRecord.stage, 'FAILED', 'Review stage must be FAILED');
    assert.match(failedReviewRecord.summary || '', /Failed to enqueue review job/);

    // Verify FailedReview record created in DLQ with payload
    const dlqRecord = await prisma.failedReview.findFirst({
      where: {
        pullRequestId: pr.id,
        commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      orderBy: { failedAt: 'desc' },
    });
    assert.ok(dlqRecord, 'FailedReview DLQ record must be created for visibility');
    assert.match(dlqRecord.errorMessage, /Simulated Redis outage/);
    assert.ok(dlqRecord.jobData, 'DLQ record must preserve job payload for future recovery');

    // Clean up
    setEnqueueReviewJobOverride(null);
  });

  stateTest('Transition 2: Retrying -> Enqueue failure -> Rollback to recoverable state (No permanent lock)', async () => {
    setupAuthMocks();

    // 1. Create a failed review in DLQ
    const failureToRetry = await prisma.failedReview.create({
      data: {
        pullRequestId: pr.id,
        commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        errorMessage: 'Initial processing failure',
        jobData: {
          installationId: Number(installationId),
          repoFullName: repo.fullName,
          prNumber: pr.githubPrNumber,
          commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
    });

    // 2. Mock reviewQueue.add to fail (simulating Redis down during retry dispatch)
    const originalAdd = reviewQueue.add.bind(reviewQueue);
    let addAttempted = false;
    (reviewQueue as any).add = async () => {
      addAttempted = true;
      throw new Error('Simulated Redis outage on retry queue enqueue');
    };

    try {
      const retryReq = new NextRequest(
        `http://localhost:3000/api/failed-reviews/${failureToRetry.id}/retry`,
        { method: 'POST' }
      );
      const retryRes = await retryFailedReview(retryReq, { params: { id: String(failureToRetry.id) } });

      assert.equal(retryRes.status, 503, 'Must return 503 on failed queue enqueue');
      assert.equal(addAttempted, true, 'reviewQueue.add must have been called');

      // 3. Verify Rollback: FailedReview.jobId must NOT remain locked as review-retry-*
      const rolledBack = await prisma.failedReview.findUnique({
        where: { id: failureToRetry.id },
      });
      assert.ok(rolledBack);
      assert.equal(
        rolledBack.jobId,
        null,
        'failedReview.jobId must be rolled back to null so it is not permanently locked'
      );
      assert.equal(rolledBack.resolvedAt, null, 'resolvedAt must remain null');

      // 4. Verify Recovery: When Redis recovers, the next retry attempt succeeds
      (reviewQueue as any).add = async (name: string, data: any, opts: any) => {
        return { id: opts.jobId };
      };

      const recoveryReq = new NextRequest(
        `http://localhost:3000/api/failed-reviews/${failureToRetry.id}/retry`,
        { method: 'POST' }
      );
      const recoveryRes = await retryFailedReview(recoveryReq, { params: { id: String(failureToRetry.id) } });

      assert.equal(
        recoveryRes.status,
        200,
        'Subsequent retry after Redis recovery must succeed without 409 Conflict deadlock'
      );
      const recoveryJson = await recoveryRes.json();
      assert.equal(recoveryJson.success, true);
    } finally {
      (reviewQueue as any).add = originalAdd;
      await prisma.failedReview.deleteMany({ where: { id: failureToRetry.id } });
    }
  });

  stateTest('Transition 3: Stale retry (>10m ago) allows recovery rather than blocking forever', async () => {
    setupAuthMocks();

    const elevenMinsAgo = Date.now() - 11 * 60 * 1000;
    const staleRetryJobId = `review-retry-9999-${elevenMinsAgo}`;

    const staleFailure = await prisma.failedReview.create({
      data: {
        pullRequestId: pr.id,
        commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        errorMessage: 'Worker crashed on previous retry',
        jobId: staleRetryJobId,
        jobData: {
          installationId: Number(installationId),
          repoFullName: repo.fullName,
          prNumber: pr.githubPrNumber,
          commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
    });

    const originalAdd = reviewQueue.add.bind(reviewQueue);
    (reviewQueue as any).add = async (_name: string, _data: any, opts: any) => {
      return { id: opts.jobId };
    };

    try {
      const retryReq = new NextRequest(
        `http://localhost:3000/api/failed-reviews/${staleFailure.id}/retry`,
        { method: 'POST' }
      );
      const retryRes = await retryFailedReview(retryReq, { params: { id: String(staleFailure.id) } });

      assert.equal(
        retryRes.status,
        200,
        'Stale retry must allow recovery and return 200 instead of 409 Conflict'
      );
      const json = await retryRes.json();
      assert.equal(json.success, true);
      assert.notEqual(json.newJobId, staleRetryJobId, 'New retry must generate fresh jobId');
    } finally {
      (reviewQueue as any).add = originalAdd;
      await prisma.failedReview.deleteMany({ where: { id: staleFailure.id } });
    }
  });

  stateTest('Transition 4: Stuck processing review auto-recovers on fresh rerun request', async () => {
    setupAuthMocks();
    await prisma.review.deleteMany({ where: { pullRequestId: pr.id } });

    // Create an old review stuck in 'processing' (15 minutes ago)
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const stuckProcessingReview = await prisma.review.create({
      data: {
        pullRequestId: pr.id,
        commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'processing',
        stage: 'AI ANALYSIS',
        startedAt: fifteenMinsAgo,
      },
    });

    setEnqueueReviewJobOverride(async (jobData) => {
      return `job-rerun-${jobData.prNumber}-${jobData.commitSha.substring(0, 7)}`;
    });

    try {
      const req = new NextRequest(`http://localhost:3000/api/pull-requests/${pr.id}/reviews`, {
        method: 'POST',
      });
      const res = await rerunReview(req, { params: { id: String(pr.id) } });

      assert.equal(res.status, 202, 'Rerun must succeed and return 202 Accepted');
      const json = await res.json();
      assert.equal(json.status, 'queued');

      // Verify a FailedReview DLQ record was created documenting the auto-recovery
      const autoRecoveredFailure = await prisma.failedReview.findFirst({
        where: {
          pullRequestId: pr.id,
          commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          errorMessage: { contains: 'Stuck review auto-recovered' },
        },
      });
      assert.ok(autoRecoveredFailure, 'A FailedReview DLQ record must be created when auto-recovering stuck review');

      // Verify the review record was re-queued for processing
      const queuedReview = await prisma.review.findUnique({
        where: { id: stuckProcessingReview.id },
      });
      assert.ok(queuedReview);
      assert.equal(queuedReview.status, 'pending', 'Review must be re-queued with pending status');
      assert.equal(queuedReview.stage, 'QUEUED');
    } finally {
      setEnqueueReviewJobOverride(null);
      await prisma.review.deleteMany({ where: { id: stuckProcessingReview.id } });
      await prisma.failedReview.deleteMany({ where: { pullRequestId: pr.id } });
    }
  });

  stateTest('Transition 5: Active processing review rejects concurrent rerun with 409 Conflict', async () => {
    setupAuthMocks();
    await prisma.review.deleteMany({ where: { pullRequestId: pr.id } });

    // Create a healthy review started 1 minute ago in 'processing'
    const oneMinAgo = new Date(Date.now() - 1 * 60 * 1000);
    const activeReview = await prisma.review.create({
      data: {
        pullRequestId: pr.id,
        commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'processing',
        stage: 'STATIC ANALYSIS',
        startedAt: oneMinAgo,
      },
    });

    try {
      const req = new NextRequest(`http://localhost:3000/api/pull-requests/${pr.id}/reviews`, {
        method: 'POST',
      });
      const res = await rerunReview(req, { params: { id: String(pr.id) } });

      assert.equal(res.status, 409, 'Active processing review must reject concurrent rerun with 409 Conflict');
      const json = await res.json();
      assert.equal(json.error, 'Conflict');
      assert.match(json.message, /already in progress/);
    } finally {
      await prisma.review.deleteMany({ where: { id: activeReview.id } });
    }
  });

  stateTest('Transition 6: Watchdog reaper detects and reaps stale pending & processing reviews', async () => {
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
    const staleProcessing = await prisma.review.create({
      data: {
        pullRequestId: pr.id,
        commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        status: 'processing',
        stage: 'AI ANALYSIS',
        startedAt: twentyMinsAgo,
      },
    });

    const lockKey = `review-lock:${repo.fullName}:${pr.githubPrNumber}:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`;
    await redis.set(lockKey, 'worker-dead-lock');

    try {
      const reaped = await reapStaleReviews(
        { pendingMinutes: 10, processingMinutes: 10, postingMinutes: 5 },
        redis
      );
      assert.ok(reaped >= 1, 'Reaper must reap the stale processing review');

      const updated = await prisma.review.findUnique({
        where: { id: staleProcessing.id },
      });
      assert.equal(updated?.status, 'failed', 'Stale review must be marked failed');
      assert.equal(updated?.stage, 'FAILED', 'Stale review stage must be FAILED');

      const dlq = await prisma.failedReview.findFirst({
        where: { commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      });
      assert.ok(dlq, 'FailedReview must be created in DLQ');

      const lockValue = await redis.get(lockKey);
      assert.equal(lockValue, null, 'Redis review lock must be deleted on reap');
    } finally {
      await prisma.review.deleteMany({ where: { id: staleProcessing.id } });
      await prisma.failedReview.deleteMany({ where: { commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } });
    }
  });
});
