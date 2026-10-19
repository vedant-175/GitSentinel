import { Redis } from 'ioredis';
import { logger } from '../logger.js';

/**
 * Item 20: Distributed idempotency lock per (repo, PR, sha).
 *
 * Takes a Redis lock keyed on "review-lock:{owner/repo}:{pr}:{sha}" so that
 * two workers cannot both post a review for the same commit.
 *
 * Uses SET NX EX for atomic acquire and a Lua CAS script for safe release
 * (only the holder can delete the key).
 *
 * Failed head-SHA verification is treated as a retryable error (throws
 * `HeadShaChangedError` with `retryable = true`).
 */

const LOCK_TTL_SECONDS = 600; // 10 minutes – generous for long LLM calls

/**
 * Acquires a distributed lock for a review job.
 * Returns the lock value (a random token) on success, or null if the lock is already held.
 */
export async function acquireReviewLock(
  redis: Redis,
  repoFullName: string,
  prNumber: number,
  commitSha: string,
  ttlSeconds: number = LOCK_TTL_SECONDS
): Promise<string | null> {
  const lockKey = `review-lock:${repoFullName}:${prNumber}:${commitSha}`;
  const lockValue = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const result = await redis.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');
  if (result === 'OK') {
    logger.debug({ lock_key: lockKey, msg: 'Acquired review lock' });
    return lockValue;
  }

  logger.info({ lock_key: lockKey, msg: 'Review lock already held by another worker' });
  return null;
}

/**
 * Releases the distributed lock only if the caller holds it (CAS via Lua).
 */
export async function releaseReviewLock(
  redis: Redis,
  repoFullName: string,
  prNumber: number,
  commitSha: string,
  lockValue: string
): Promise<boolean> {
  const lockKey = `review-lock:${repoFullName}:${prNumber}:${commitSha}`;

  const luaScript = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(luaScript, 1, lockKey, lockValue);
  const released = result === 1;
  if (released) {
    logger.debug({ lock_key: lockKey, msg: 'Released review lock' });
  }
  return released;
}

/**
 * Extends the lock TTL (heartbeat) if the caller still holds it.
 */
export async function extendReviewLock(
  redis: Redis,
  repoFullName: string,
  prNumber: number,
  commitSha: string,
  lockValue: string,
  ttlSeconds: number = LOCK_TTL_SECONDS
): Promise<boolean> {
  const lockKey = `review-lock:${repoFullName}:${prNumber}:${commitSha}`;

  const luaScript = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
    else
      return 0
    end
  `;

  const result = await redis.eval(luaScript, 1, lockKey, lockValue, ttlSeconds);
  return result === 1;
}

/**
 * Custom error for head-SHA mismatch that signals BullMQ to retry.
 */
export class HeadShaChangedError extends Error {
  public readonly retryable = true;

  constructor(
    public readonly jobSha: string,
    public readonly currentSha: string
  ) {
    super(
      `PR head SHA changed from ${jobSha.substring(0, 7)} to ${currentSha.substring(0, 7)}. ` +
        `Treating as retryable error.`
    );
    this.name = 'HeadShaChangedError';
  }
}
