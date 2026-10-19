import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Redis } from 'ioredis';
import { isPortReachable } from '@ai-reviewer/shared';
import {
  acquireReviewLock,
  releaseReviewLock,
  extendReviewLock,
  HeadShaChangedError,
} from './idempotency.js';

function itRedis(name: string, fn: () => Promise<void> | void) {
  it(name, async (t) => {
    if (!(await isPortReachable(6379))) {
      t.skip('Redis 6379 is offline');
      return;
    }
    await fn();
  });
}

describe('Distributed Idempotency Lock and Retryable HeadShaChangedError (Item 20)', () => {
  let redis: Redis;
  const repoFullName = 'octocat/Hello-World';
  const prNumber = 42;
  const commitSha = 'abc1234567890abcdef1234567890abcdef1234';

  before(async () => {
    if (!(await isPortReachable(6379))) return;
    redis = new Redis('redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  });

  after(async () => {
    if (await isPortReachable(6379) && redis) {
      const lockKey = `review-lock:${repoFullName}:${prNumber}:${commitSha}`;
      await redis.del(lockKey).catch(() => {});
      await redis.quit().catch(() => {});
    }
  });

  beforeEach(async () => {
    if (await isPortReachable(6379) && redis) {
      const lockKey = `review-lock:${repoFullName}:${prNumber}:${commitSha}`;
      await redis.del(lockKey).catch(() => {});
    }
  });

  itRedis('acquires lock for (repo, PR, sha) and prevents duplicate concurrent worker', async () => {
    const token1 = await acquireReviewLock(redis, repoFullName, prNumber, commitSha, 60);
    assert.ok(token1, 'First worker should acquire the lock');

    // Second worker attempting to acquire lock on the same (repo, PR, sha)
    const token2 = await acquireReviewLock(redis, repoFullName, prNumber, commitSha, 60);
    assert.equal(token2, null, 'Second worker must be denied lock (preventing duplicate post)');
  });

  itRedis('releases lock using Lua CAS so only the holder can release it', async () => {
    const token = await acquireReviewLock(redis, repoFullName, prNumber, commitSha, 60);
    assert.ok(token);

    // Wrong token cannot release
    const wrongReleased = await releaseReviewLock(redis, repoFullName, prNumber, commitSha, 'wrong-token');
    assert.equal(wrongReleased, false, 'Invalid token must not release lock');

    // Correct token releases
    const released = await releaseReviewLock(redis, repoFullName, prNumber, commitSha, token!);
    assert.equal(released, true, 'Valid token must successfully release lock');

    // Lock can be acquired again after release
    const tokenAgain = await acquireReviewLock(redis, repoFullName, prNumber, commitSha, 60);
    assert.ok(tokenAgain, 'Should be able to acquire lock again after release');
    await releaseReviewLock(redis, repoFullName, prNumber, commitSha, tokenAgain!);
  });

  itRedis('extends lock TTL via heartbeat', async () => {
    const token = await acquireReviewLock(redis, repoFullName, prNumber, commitSha, 10);
    assert.ok(token);

    const extended = await extendReviewLock(redis, repoFullName, prNumber, commitSha, token!, 120);
    assert.equal(extended, true, 'Holding worker should be able to extend lock TTL');

    const lockKey = `review-lock:${repoFullName}:${prNumber}:${commitSha}`;
    const ttl = await redis.ttl(lockKey);
    assert.ok(ttl > 50, `TTL should have been extended, got ${ttl}`);

    await releaseReviewLock(redis, repoFullName, prNumber, commitSha, token!);
  });

  it('HeadShaChangedError carries retryable = true for BullMQ retry semantics', () => {
    const err = new HeadShaChangedError('old-sha-123', 'new-sha-456');
    assert.equal(err.name, 'HeadShaChangedError');
    assert.equal(err.retryable, true);
    assert.equal(err.jobSha, 'old-sha-123');
    assert.equal(err.currentSha, 'new-sha-456');
    assert.ok(err.message.includes('retryable'));
  });
});
