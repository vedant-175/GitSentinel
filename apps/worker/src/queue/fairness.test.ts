import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Redis } from 'ioredis';
import { isPortReachable } from '@ai-reviewer/shared';
import {
  acquireInstallationSlot,
  releaseInstallationSlot,
  getActiveInstallationConcurrency,
  heartbeatLease,
  reapExpiredLeases,
  computeJitteredBackoff,
} from './fairness.js';
import {
  checkDailyTokenBudget,
  recordDailyTokens,
} from './tokenBudget.js';

function itRedis(name: string, fn: () => Promise<void> | void) {
  it(name, async (t) => {
    if (!(await isPortReachable(6379))) {
      t.skip('Redis 6379 is offline');
      return;
    }
    await fn();
  });
}

describe('Queue Fairness and Concurrency Cap (Requirement 17, 19 & Item 21)', () => {
  let redis: Redis;
  const testInstallationNoisy = 99901;
  const testInstallationQuiet = 99902;
  const FAIRNESS_KEY = `fairness:leases:test:${Date.now()}`;

  before(async () => {
    if (!(await isPortReachable(6379))) return;
    redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    await redis.del(FAIRNESS_KEY);
  });

  after(async () => {
    if (await isPortReachable(6379) && redis) {
      await redis.del(FAIRNESS_KEY).catch(() => {});
      await redis.quit().catch(() => {});
    }
  });

  beforeEach(async () => {
    if (await isPortReachable(6379) && redis) {
      await redis.del(FAIRNESS_KEY).catch(() => {});
    }
  });

  itRedis('enforces concurrency limit per installation using sorted set leases', async () => {
    const limit = 2;

    const slot1 = await acquireInstallationSlot(redis, testInstallationNoisy, limit, 300000, 'job-1', FAIRNESS_KEY);
    assert.equal(slot1, true, 'First slot for noisy installation should be acquired');

    const slot2 = await acquireInstallationSlot(redis, testInstallationNoisy, limit, 300000, 'job-2', FAIRNESS_KEY);
    assert.equal(slot2, true, 'Second slot for noisy installation should be acquired');

    const slot3 = await acquireInstallationSlot(redis, testInstallationNoisy, limit, 300000, 'job-3', FAIRNESS_KEY);
    assert.equal(slot3, false, 'Third slot for noisy installation should be rejected (cap reached)');

    const count = await getActiveInstallationConcurrency(redis, testInstallationNoisy, FAIRNESS_KEY);
    assert.equal(count, 2, 'Active count should equal limit');
  });

  itRedis('ensures a noisy installation at capacity does NOT starve a quiet installation', async () => {
    const limit = 2;

    // Fill noisy installation up to capacity
    await acquireInstallationSlot(redis, testInstallationNoisy, limit, 300000, 'noisy-1', FAIRNESS_KEY);
    await acquireInstallationSlot(redis, testInstallationNoisy, limit, 300000, 'noisy-2', FAIRNESS_KEY);

    const noisyActive = await getActiveInstallationConcurrency(redis, testInstallationNoisy, FAIRNESS_KEY);
    assert.equal(noisyActive, 2, 'Noisy installation should have 2 active slots');

    const noisyNext = await acquireInstallationSlot(redis, testInstallationNoisy, limit, 300000, 'noisy-3', FAIRNESS_KEY);
    assert.equal(noisyNext, false, 'Noisy installation next job cannot acquire slot');

    // Quiet installation should immediately acquire a slot without being starved
    const quietSlot = await acquireInstallationSlot(redis, testInstallationQuiet, limit, 300000, 'quiet-1', FAIRNESS_KEY);
    assert.equal(quietSlot, true, 'Quiet installation should acquire slot even when noisy installation is at capacity');

    const quietActive = await getActiveInstallationConcurrency(redis, testInstallationQuiet, FAIRNESS_KEY);
    assert.equal(quietActive, 1, 'Quiet installation should have 1 active slot');

    // Release quiet slot
    await releaseInstallationSlot(redis, testInstallationQuiet, 'quiet-1', FAIRNESS_KEY);
    const quietActiveAfter = await getActiveInstallationConcurrency(redis, testInstallationQuiet, FAIRNESS_KEY);
    assert.equal(quietActiveAfter, 0, 'Quiet installation should have 0 active slots after release');
  });

  itRedis('releases slots accurately so queued jobs can proceed', async () => {
    const limit = 2;

    await acquireInstallationSlot(redis, testInstallationNoisy, limit, 300000, 'job-a', FAIRNESS_KEY);
    await acquireInstallationSlot(redis, testInstallationNoisy, limit, 300000, 'job-b', FAIRNESS_KEY);

    await releaseInstallationSlot(redis, testInstallationNoisy, 'job-a', FAIRNESS_KEY);
    let count = await getActiveInstallationConcurrency(redis, testInstallationNoisy, FAIRNESS_KEY);
    assert.equal(count, 1, 'Noisy installation count should be 1 after one release');

    const canAcquireNow = await acquireInstallationSlot(redis, testInstallationNoisy, limit, 300000, 'job-c', FAIRNESS_KEY);
    assert.equal(canAcquireNow, true, 'Should be able to acquire newly freed slot');

    // Cleanup noisy slots
    await releaseInstallationSlot(redis, testInstallationNoisy, 'job-b', FAIRNESS_KEY);
    await releaseInstallationSlot(redis, testInstallationNoisy, 'job-c', FAIRNESS_KEY);
    count = await getActiveInstallationConcurrency(redis, testInstallationNoisy, FAIRNESS_KEY);
    assert.equal(count, 0, 'Noisy installation count should be 0 after releasing all slots');
  });

  itRedis('heartbeat extends lease score in sorted set', async () => {
    const jobId = 'heartbeat-job-1';
    await acquireInstallationSlot(redis, testInstallationNoisy, 2, 10000, jobId, FAIRNESS_KEY);

    const initialScoreStr = await redis.zscore(FAIRNESS_KEY, `${testInstallationNoisy}:${jobId}`);
    assert.ok(initialScoreStr, 'Initial lease score should exist');
    const initialScore = parseFloat(initialScoreStr!);

    // Extend by 60 seconds
    const renewed = await heartbeatLease(redis, testInstallationNoisy, jobId, 60000, FAIRNESS_KEY);
    assert.equal(renewed, true, 'Heartbeat renewal should return true');

    const newScoreStr = await redis.zscore(FAIRNESS_KEY, `${testInstallationNoisy}:${jobId}`);
    assert.ok(newScoreStr, 'Updated lease score should exist');
    const newScore = parseFloat(newScoreStr!);

    assert.ok(newScore > initialScore, 'New score should be greater than initial score');
  });

  itRedis('reaper reclaims expired leases automatically', async () => {
    const expiredJobId = 'expired-job-1';
    const activeJobId = 'active-job-2';

    // Inject an expired lease manually with score in the past
    const pastTimestamp = Date.now() - 50000;
    await redis.zadd(FAIRNESS_KEY, pastTimestamp, `${testInstallationNoisy}:${expiredJobId}`);

    // Inject an active lease with score in the future
    const futureTimestamp = Date.now() + 50000;
    await redis.zadd(FAIRNESS_KEY, futureTimestamp, `${testInstallationNoisy}:${activeJobId}`);

    const countBefore = await redis.zcard(FAIRNESS_KEY);
    assert.equal(countBefore, 2, 'Should have 2 leases before reaping');

    const reaped = await reapExpiredLeases(redis, FAIRNESS_KEY);
    assert.ok(reaped >= 1, 'Should have reaped at least 1 expired lease');

    const remaining = await redis.zrange(FAIRNESS_KEY, 0, -1);
    assert.deepEqual(remaining, [`${testInstallationNoisy}:${activeJobId}`], 'Only active lease should remain');
  });

  it('computes jittered exponential backoff within expected bounds', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const delay = computeJitteredBackoff(attempt, 500, 30000);
      const minExpected = 500 * Math.pow(2, attempt);
      const maxExpected = minExpected + 500;
      assert.ok(delay >= minExpected, `Delay (${delay}) should be >= ${minExpected} for attempt ${attempt}`);
      assert.ok(delay <= maxExpected, `Delay (${delay}) should be <= ${maxExpected} for attempt ${attempt}`);
    }

    // High attempt capped at maxMs
    const capped = computeJitteredBackoff(20, 500, 30000);
    assert.equal(capped, 30000, 'High attempt backoff should be capped at maxMs');
  });

  itRedis('simulates job dispatch order: quiet installation finishes before backlogged noisy jobs', async () => {
    const limit = 2;
    const noisyInst = 88801;
    const quietInst = 88802;

    interface SimulatedJob {
      id: string;
      installationId: number;
    }

    const queue: SimulatedJob[] = [
      { id: 'noisy-1', installationId: noisyInst },
      { id: 'noisy-2', installationId: noisyInst },
      { id: 'noisy-3', installationId: noisyInst },
      { id: 'noisy-4', installationId: noisyInst },
      { id: 'quiet-1', installationId: quietInst },
    ];

    const executionOrder: string[] = [];
    const activeJobs = new Map<string, number>();

    // Simulating dispatcher: process until queue is empty and all jobs complete
    let iterations = 0;
    while ((queue.length > 0 || activeJobs.size > 0) && iterations < 50) {
      iterations++;

      // Complete any running jobs that have simulated "execution"
      for (const [jobId, instId] of Array.from(activeJobs.entries())) {
        executionOrder.push(jobId);
        await releaseInstallationSlot(redis, instId, jobId);
        activeJobs.delete(jobId);
      }

      // Try dispatching waiting jobs
      const remaining: SimulatedJob[] = [];
      for (const job of queue) {
        const acquired = await acquireInstallationSlot(redis, job.installationId, limit, 300000, job.id);
        if (acquired) {
          activeJobs.set(job.id, job.installationId);
        } else {
          // Delayed/re-queued for later turn
          remaining.push(job);
        }
      }
      queue.length = 0;
      queue.push(...remaining);
    }

    // quiet-1 was behind noisy-3 and noisy-4 in the queue, but because noisy reached cap (2),
    // quiet-1 acquired a slot in the first scheduling round alongside noisy-1 and noisy-2!
    const quietIndex = executionOrder.indexOf('quiet-1');
    const noisy3Index = executionOrder.indexOf('noisy-3');
    const noisy4Index = executionOrder.indexOf('noisy-4');

    assert.ok(quietIndex !== -1, 'quiet-1 should have executed');
    assert.ok(noisy3Index !== -1, 'noisy-3 should have executed');
    assert.ok(noisy4Index !== -1, 'noisy-4 should have executed');
    assert.ok(
      quietIndex < noisy3Index,
      `quiet-1 (index ${quietIndex}) should execute before delayed noisy-3 (index ${noisy3Index})`
    );
    assert.ok(
      quietIndex < noisy4Index,
      `quiet-1 (index ${quietIndex}) should execute before delayed noisy-4 (index ${noisy4Index})`
    );
  });

  itRedis('tracks daily token budget and blocks jobs when budget is exceeded', async () => {
    const budgetInstallation = 77701;
    const dateStr = new Date().toISOString().split('T')[0];
    const budgetKey = `token_budget:${budgetInstallation}:${dateStr}`;
    await redis.del(budgetKey);

    const initial = await checkDailyTokenBudget(redis, budgetInstallation, 1000);
    assert.equal(initial.allowed, true, 'Initial budget should be allowed');
    assert.equal(initial.currentTokens, 0);

    // Consume 600 tokens
    await recordDailyTokens(redis, budgetInstallation, 600);
    const mid = await checkDailyTokenBudget(redis, budgetInstallation, 1000);
    assert.equal(mid.allowed, true, '600/1000 should still be allowed');
    assert.equal(mid.currentTokens, 600);

    // Consume 500 more tokens (total 1100 > 1000)
    await recordDailyTokens(redis, budgetInstallation, 500);
    const exceeded = await checkDailyTokenBudget(redis, budgetInstallation, 1000);
    assert.equal(exceeded.allowed, false, '1100/1000 should be rejected as budget exceeded');
    assert.equal(exceeded.currentTokens, 1100);

    await redis.del(budgetKey);
  });
});
