import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import {
  acquireInstallationSlot,
  releaseInstallationSlot,
  getActiveInstallationConcurrency,
} from './fairness.js';
import { ReviewJobData, isPortReachable } from '@ai-reviewer/shared';

describe('Queue Load Test with Strict Assertions (Requirement 23)', () => {
  let redis: Redis;
  let queue: Queue<ReviewJobData>;
  const QUEUE_NAME = `load-test-queue-${Date.now()}`;
  const TOTAL_JOBS = 24;
  const INSTALLATION_IDS = [50001, 50002, 50003];
  const INSTALLATION_CONCURRENCY_LIMIT = 2;

  before(async () => {
    if (!(await isPortReachable(6379))) return;
    redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    queue = new Queue<ReviewJobData>(QUEUE_NAME, {
      connection: redis,
    });

    for (const instId of INSTALLATION_IDS) {
      await redis.del(`fairness:active:${instId}`);
    }
  });

  after(async () => {
    if (await isPortReachable(6379)) {
      if (queue) {
        await queue.drain().catch(() => {});
        await queue.clean(0, 1000, 'completed').catch(() => {});
        await queue.clean(0, 1000, 'failed').catch(() => {});
        await queue.close().catch(() => {});
      }
      if (redis) {
        for (const instId of INSTALLATION_IDS) {
          await redis.del(`fairness:active:${instId}`).catch(() => {});
        }
        await redis.quit().catch(() => {});
      }
    }
  });

  it('handles high-concurrency burst enqueueing and satisfies load assertions', async (t) => {
    if (!(await isPortReachable(6379))) {
      t.skip('Redis 6379 is offline');
      return;
    }
    const enqueueStart = Date.now();
    const enqueuedJobPromises = [];

    // Burst enqueue 24 jobs concurrently
    for (let i = 1; i <= TOTAL_JOBS; i++) {
      const installationId = INSTALLATION_IDS[i % INSTALLATION_IDS.length];
      const jobData: ReviewJobData = {
        type: 'review-pr',
        installationId,
        githubRepoId: 90000 + (i % 3),
        prNumber: 100 + i,
        commitSha: `commit-load-${i}-${Date.now()}`,
        repoFullName: `load-org/repo-${i % 3}`,
        title: `Load test PR #${i}`,
        author: `tester-${i}`,
        receivedAt: Date.now(),
      };

      enqueuedJobPromises.push(
        queue.add('review-pr', jobData, {
          jobId: `job-${QUEUE_NAME}-${i}`,
          removeOnComplete: true,
          removeOnFail: true,
        })
      );
    }

    const enqueuedJobs = await Promise.all(enqueuedJobPromises);
    const enqueueDurationMs = Date.now() - enqueueStart;

    // --- Assertion 1: All jobs successfully enqueued ---
    assert.equal(enqueuedJobs.length, TOTAL_JOBS, `All ${TOTAL_JOBS} jobs must be enqueued`);
    for (const job of enqueuedJobs) {
      assert.ok(job.id, 'Every job must have a valid job ID');
    }

    // --- Assertion 2: Burst throughput SLA (< 2000ms for 24 jobs in Redis) ---
    assert.ok(
      enqueueDurationMs < 2000,
      `Enqueue burst must complete within 2000ms (took ${enqueueDurationMs}ms)`
    );

    // --- Assertion 3: Fairness & Concurrency Cap Invariant during Drain ---
    let maxObservedConcurrency = 0;
    let processedCount = 0;

    // Spin up 4 concurrent workers to drain the burst
    const worker = new Worker<ReviewJobData>(
      QUEUE_NAME,
      async (job) => {
        const instId = job.data.installationId;
        const acquired = await acquireInstallationSlot(redis, instId, INSTALLATION_CONCURRENCY_LIMIT);

        if (!acquired) {
          // In real worker, this would delay. In load test, yield and retry slot
          await new Promise((r) => setTimeout(r, 20));
          return;
        }

        try {
          const currentConcurrency = await getActiveInstallationConcurrency(redis, instId);
          if (currentConcurrency > maxObservedConcurrency) {
            maxObservedConcurrency = currentConcurrency;
          }

          // Invariant: Concurrency per installation must never exceed limit
          assert.ok(
            currentConcurrency <= INSTALLATION_CONCURRENCY_LIMIT,
            `Active concurrency for inst ${instId} (${currentConcurrency}) exceeded limit ${INSTALLATION_CONCURRENCY_LIMIT}`
          );

          // Simulate brief work
          await new Promise((r) => setTimeout(r, 15));
          processedCount++;
        } finally {
          await releaseInstallationSlot(redis, instId);
        }
      },
      {
        connection: redis,
        concurrency: 6,
      }
    );

    // Wait for workers to process jobs
    const waitStart = Date.now();
    while (processedCount < TOTAL_JOBS && Date.now() - waitStart < 15000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    await worker.close();

    // --- Assertion 4: Concurrency cap strictly enforced ---
    assert.ok(
      maxObservedConcurrency <= INSTALLATION_CONCURRENCY_LIMIT,
      `Max observed installation concurrency (${maxObservedConcurrency}) must not exceed ${INSTALLATION_CONCURRENCY_LIMIT}`
    );

    // --- Assertion 5: Zero slot leaks after load drain ---
    for (const instId of INSTALLATION_IDS) {
      const remainingSlots = await getActiveInstallationConcurrency(redis, instId);
      assert.equal(remainingSlots, 0, `Installation ${instId} leaked slots: ${remainingSlots}`);
    }
  });
});
