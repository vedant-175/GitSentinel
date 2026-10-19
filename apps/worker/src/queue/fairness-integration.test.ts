import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Queue, Worker, Job, DelayedError } from 'bullmq';
import { Redis } from 'ioredis';
import { isPortReachable } from '@ai-reviewer/shared';
import {
  acquireInstallationSlot,
  releaseInstallationSlot,
  computeJitteredBackoff,
} from './fairness.js';

interface TestJobData {
  jobName: string;
  installationId: number;
  workDurationMs?: number;
}

const REDIS_OPTS = {
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

describe('Fairness Integration Test with Real BullMQ Worker and Real Redis (Item 21)', () => {
  let redis: Redis;
  let queue: Queue<TestJobData>;
  let worker: Worker<TestJobData>;
  const queueName = `test-fairness-queue-${Date.now()}`;
  const FAIRNESS_KEY = `fairness:leases:integration:${Date.now()}`;

  const noisyInstallationId = 88801;
  const quietInstallationId = 99902;
  const CONCURRENCY_LIMIT_PER_INSTALLATION = 1; // strict limit of 1 active job per installation

  before(async () => {
    if (!(await isPortReachable(6379))) return;
    redis = new Redis('redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    await redis.del(FAIRNESS_KEY);

    queue = new Queue<TestJobData>(queueName, {
      connection: REDIS_OPTS,
    });
  });

  after(async () => {
    if (await isPortReachable(6379)) {
      if (worker) {
        await worker.close().catch(() => {});
      }
      if (queue) {
        try {
          await queue.obliterate({ force: true });
        } catch {
          // ignore
        }
        await queue.close().catch(() => {});
      }
      if (redis) {
        await redis.del(FAIRNESS_KEY).catch(() => {});
        await redis.quit().catch(() => {});
      }
    }
  });

  it('ensures a noisy installation submitting many jobs cannot starve a quiet installation', async (t) => {
    if (!(await isPortReachable(6379))) {
      t.skip('Redis 6379 is offline');
      return;
    }
    const executionOrder: string[] = [];
    const completedJobs: string[] = [];

    // Worker with worker-level concurrency = 3 (able to process up to 3 jobs in parallel)
    worker = new Worker<TestJobData>(
      queueName,
      async (job: Job<TestJobData>, token?: string) => {
        const { installationId, jobName, workDurationMs = 60 } = job.data;

        // Try to acquire per-installation fairness slot
        const acquired = await acquireInstallationSlot(
          redis,
          installationId,
          CONCURRENCY_LIMIT_PER_INSTALLATION,
          30000,
          job.id,
          FAIRNESS_KEY
        );

        if (!acquired) {
          // Delay with short backoff (50ms base) for the test
          const delay = computeJitteredBackoff(job.attemptsMade || 0, 50, 1000);
          await job.moveToDelayed(Date.now() + delay, token || job.token);
          throw new DelayedError();
        }

        try {
          executionOrder.push(jobName);
          // Simulate work
          await new Promise((resolve) => setTimeout(resolve, workDurationMs));
          completedJobs.push(jobName);
          return { success: true };
        } finally {
          await releaseInstallationSlot(redis, installationId, job.id, FAIRNESS_KEY);
        }
      },
      {
        connection: REDIS_OPTS,
        concurrency: 3,
        lockDuration: 30000,
      }
    );

    // Enqueue 4 noisy jobs first, then 1 quiet job at the tail
    await queue.add('noisy', { jobName: 'noisy-1', installationId: noisyInstallationId });
    await queue.add('noisy', { jobName: 'noisy-2', installationId: noisyInstallationId });
    await queue.add('noisy', { jobName: 'noisy-3', installationId: noisyInstallationId });
    await queue.add('noisy', { jobName: 'noisy-4', installationId: noisyInstallationId });
    await queue.add('quiet', { jobName: 'quiet-1', installationId: quietInstallationId });

    // Wait until all 5 jobs are completed (or timeout after 10 seconds)
    const startTime = Date.now();
    while (completedJobs.length < 5 && Date.now() - startTime < 10000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.equal(completedJobs.length, 5, `Expected all 5 jobs to complete, but got: ${completedJobs.join(', ')}`);

    // Verify ordering:
    // quiet-1 was enqueued AFTER noisy-1, noisy-2, noisy-3, noisy-4.
    // However, noisy installation has CONCURRENCY_LIMIT_PER_INSTALLATION = 1.
    // While noisy-1 runs, noisy-2, noisy-3, and noisy-4 cannot acquire slots and are delayed.
    // quiet-1 belongs to a different installation, so it immediately acquires its slot
    // and starts/completes BEFORE noisy-3 and noisy-4!
    const quietCompletedIdx = completedJobs.indexOf('quiet-1');
    const noisy3CompletedIdx = completedJobs.indexOf('noisy-3');
    const noisy4CompletedIdx = completedJobs.indexOf('noisy-4');

    assert.ok(quietCompletedIdx !== -1, 'quiet-1 must be completed');
    assert.ok(noisy3CompletedIdx !== -1, 'noisy-3 must be completed');
    assert.ok(noisy4CompletedIdx !== -1, 'noisy-4 must be completed');

    assert.ok(
      quietCompletedIdx < noisy3CompletedIdx,
      `quiet-1 (completed at index ${quietCompletedIdx}) must complete before noisy-3 (index ${noisy3CompletedIdx})`
    );
    assert.ok(
      quietCompletedIdx < noisy4CompletedIdx,
      `quiet-1 (completed at index ${quietCompletedIdx}) must complete before noisy-4 (index ${noisy4CompletedIdx})`
    );
  });
});
