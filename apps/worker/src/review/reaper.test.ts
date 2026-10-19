import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { isPortReachable } from '@ai-reviewer/shared';
import { Redis } from 'ioredis';
import { reapStaleReviews } from './reaper.js';

describe('Stuck Job Recovery & Reaper Tests (Phase 3 Requirement 7)', () => {
  let redis: Redis;
  const testRepoId = 888777;
  let testRepoDbId: number;
  let testPrId: number;

  before(async () => {
    if (!(await isDatabaseAvailable()) || !(await isPortReachable(6379))) return;

    redis = new Redis('redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    const inst = await prisma.installation.upsert({
      where: { githubInstallationId: BigInt(998877) },
      update: {},
      create: {
        githubInstallationId: BigInt(998877),
        accountLogin: 'stuck-job-test-org',
        accountType: 'Organization',
      },
    });

    const repo = await prisma.repository.upsert({
      where: { githubRepoId: BigInt(testRepoId) },
      update: {},
      create: {
        installationId: inst.id,
        githubRepoId: BigInt(testRepoId),
        fullName: 'stuck-job-test-org/repo-watchdog',
      },
    });
    testRepoDbId = repo.id;

    const pr = await prisma.pullRequest.upsert({
      where: {
        repositoryId_githubPrNumber: {
          repositoryId: repo.id,
          githubPrNumber: 991,
        },
      },
      update: {},
      create: {
        repositoryId: repo.id,
        githubPrNumber: 991,
        title: 'Watchdog PR Test',
        state: 'open',
      },
    });
    testPrId = pr.id;
  });

  after(async () => {
    if (await isDatabaseAvailable() && testPrId) {
      try {
        await prisma.reviewIssue.deleteMany({
          where: { review: { pullRequestId: testPrId } },
        });
        await prisma.review.deleteMany({
          where: { pullRequestId: testPrId },
        });
        await prisma.failedReview.deleteMany({
          where: { pullRequestId: testPrId },
        });
        await prisma.pullRequest.deleteMany({
          where: { id: testPrId },
        });
        if (testRepoDbId) {
          await prisma.repository.deleteMany({
            where: { id: testRepoDbId },
          });
        }
      } catch {
        // ignore
      }
    }
    if (await isPortReachable(6379) && redis) {
      await redis.quit().catch(() => {});
    }
  });

  it('recovers stuck pending, processing, and posting reviews while leaving active reviews untouched', async (t) => {
    if (!(await isDatabaseAvailable()) || !(await isPortReachable(6379))) {
      t.skip('Database or Redis is offline');
      return;
    }
    const now = Date.now();
    const twentyMinsAgo = new Date(now - 20 * 60 * 1000);
    const fifteenMinsAgo = new Date(now - 15 * 60 * 1000);
    const sevenMinsAgo = new Date(now - 7 * 60 * 1000);
    const twoMinsAgo = new Date(now - 2 * 60 * 1000);

    // 1. Stuck pending (> 10 mins)
    const stuckPending = await prisma.review.create({
      data: {
        pullRequestId: testPrId,
        commitSha: 'sha-stuck-pending-111',
        status: 'pending',
        startedAt: twentyMinsAgo,
      },
    });

    // 2. Stuck processing (> 10 mins)
    const stuckProcessing = await prisma.review.create({
      data: {
        pullRequestId: testPrId,
        commitSha: 'sha-stuck-processing-222',
        status: 'processing',
        startedAt: fifteenMinsAgo,
      },
    });

    // 3. Stuck posting (> 5 mins)
    const stuckPosting = await prisma.review.create({
      data: {
        pullRequestId: testPrId,
        commitSha: 'sha-stuck-posting-333',
        status: 'posting',
        startedAt: sevenMinsAgo,
      },
    });

    // 4. Healthy active review (started 2 mins ago, processing)
    const activeProcessing = await prisma.review.create({
      data: {
        pullRequestId: testPrId,
        commitSha: 'sha-active-processing-444',
        status: 'processing',
        startedAt: twoMinsAgo,
      },
    });

    // Set lock in Redis for stuck review
    const lockKey = `review-lock:stuck-job-test-org/repo-watchdog:991:sha-stuck-processing-222`;
    await redis.set(lockKey, 'locked-worker-1');

    // Run reapStaleReviews with default thresholds (10m, 10m, 5m)
    const reapedCount = await reapStaleReviews(
      { pendingMinutes: 10, processingMinutes: 10, postingMinutes: 5 },
      redis
    );

    assert.ok(reapedCount >= 3, `Expected at least 3 reaped reviews, got ${reapedCount}`);

    // Verify stuck reviews updated to failed
    const updatedPending = await prisma.review.findUnique({ where: { id: stuckPending.id } });
    const updatedProcessing = await prisma.review.findUnique({ where: { id: stuckProcessing.id } });
    const updatedPosting = await prisma.review.findUnique({ where: { id: stuckPosting.id } });
    const updatedActive = await prisma.review.findUnique({ where: { id: activeProcessing.id } });

    assert.equal(updatedPending?.status, 'failed', 'Stuck pending review must be marked failed');
    assert.equal(updatedProcessing?.status, 'failed', 'Stuck processing review must be marked failed');
    assert.equal(updatedPosting?.status, 'failed', 'Stuck posting review must be marked failed');
    assert.equal(updatedActive?.status, 'processing', 'Healthy active review must NOT be marked failed');

    // Verify FailedReview table contains rows for the reaped reviews
    const failedReviews = await prisma.failedReview.findMany({
      where: {
        pullRequestId: testPrId,
        commitSha: { in: ['sha-stuck-pending-111', 'sha-stuck-processing-222', 'sha-stuck-posting-333'] },
      },
    });
    assert.equal(failedReviews.length, 3, 'Must create 3 FailedReview records for reaped reviews');

    // Verify Redis lock was released
    const lockAfterReap = await redis.get(lockKey);
    assert.equal(lockAfterReap, null, 'Distributed review lock in Redis must be released after reaping');
  });
});
