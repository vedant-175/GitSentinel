import { Redis } from 'ioredis';
import { logger } from '../logger.js';

export const DEFAULT_INSTALLATION_CONCURRENCY = parseInt(
  process.env.INSTALLATION_CONCURRENCY_LIMIT || '2',
  10
);

export const FAIRNESS_LEASE_KEY = process.env.FAIRNESS_LEASE_KEY || 'fairness:leases';

/**
 * Item 21: Active slots stored as a Redis sorted set with per-job leases.
 *
 * Each member is "{installationId}:{jobId}", scored by lease expiry timestamp.
 * - acquireInstallationSlot: ZADD only if under the per-installation limit
 * - releaseInstallationSlot: ZREM on completion
 * - reapExpiredLeases: ZRANGEBYSCORE to reclaim expired entries
 * - heartbeatLease: ZADD XX to renew the lease score
 */

/**
 * Acquires a fairness slot for the given installation and job.
 * Returns true if acquired, false if the installation is at its concurrency limit.
 *
 * The lease is stored in the sorted set scored by (now + lockDurationMs).
 */
export async function acquireInstallationSlot(
  redis: Redis,
  installationId: number | string,
  maxConcurrent: number = DEFAULT_INSTALLATION_CONCURRENCY,
  lockDurationMs: number = 300000, // 5 minutes default, matches BullMQ lockDuration
  jobId?: string,
  leaseKey: string = FAIRNESS_LEASE_KEY
): Promise<boolean> {
  const member = `${installationId}:${jobId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
  const expiresAt = Date.now() + lockDurationMs;

  // Lua: count members matching "installationId:*" that haven't expired, then ZADD if under limit
  const luaScript = `
    local pattern = ARGV[1] .. ':'
    local maxSlots = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local member = ARGV[4]
    local expiresAt = tonumber(ARGV[5])

    -- First reap expired leases
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)

    -- Count active slots for this installation
    local all = redis.call('ZRANGEBYSCORE', KEYS[1], now, '+inf')
    local count = 0
    for _, v in ipairs(all) do
      if string.sub(v, 1, #pattern) == pattern then
        count = count + 1
      end
    end

    if count >= maxSlots then
      return 0
    end

    redis.call('ZADD', KEYS[1], expiresAt, member)
    return 1
  `;

  const result = await redis.eval(
    luaScript,
    1,
    leaseKey,
    String(installationId),
    maxConcurrent,
    Date.now(),
    member,
    expiresAt
  );

  if (result === 1) {
    logger.debug({
      installation_id: installationId,
      job_id: jobId,
      msg: 'Acquired fairness slot',
    });
  }

  return result === 1;
}

/**
 * Releases a fairness slot on job completion.
 */
export async function releaseInstallationSlot(
  redis: Redis,
  installationId: number | string,
  jobId?: string,
  leaseKey: string = FAIRNESS_LEASE_KEY
): Promise<void> {
  if (jobId) {
    const member = `${installationId}:${jobId}`;
    await redis.zrem(leaseKey, member);
    logger.debug({
      installation_id: installationId,
      job_id: jobId,
      msg: 'Released fairness slot',
    });
    return;
  }

  // Legacy path: remove any single member matching this installation
  const luaScript = `
    local pattern = ARGV[1] .. ':'
    local all = redis.call('ZRANGE', KEYS[1], 0, -1)
    for _, v in ipairs(all) do
      if string.sub(v, 1, #pattern) == pattern then
        redis.call('ZREM', KEYS[1], v)
        return 1
      end
    end
    return 0
  `;

  await redis.eval(luaScript, 1, leaseKey, String(installationId));
}

/**
 * Heartbeat: renew a job's lease expiry in the sorted set.
 */
export async function heartbeatLease(
  redis: Redis,
  installationId: number | string,
  jobId: string,
  lockDurationMs: number = 300000,
  leaseKey: string = FAIRNESS_LEASE_KEY
): Promise<boolean> {
  const member = `${installationId}:${jobId}`;
  const newExpiry = Date.now() + lockDurationMs;

  // ZADD XX: only update if the member already exists
  const updated = await redis.zadd(leaseKey, 'XX', String(newExpiry), member);
  return updated === 1 || updated === 0; // ZADD XX returns 0 for updates (not new adds)
}

/**
 * Reap expired leases from the sorted set.
 * Called periodically or before slot acquisition.
 * Returns the number of reaped entries.
 */
export async function reapExpiredLeases(
  redis: Redis,
  leaseKey: string = FAIRNESS_LEASE_KEY
): Promise<number> {
  const now = Date.now();
  const removed = await redis.zremrangebyscore(leaseKey, '-inf', now);
  if (removed > 0) {
    logger.info({ reaped: removed, msg: `Reaped ${removed} expired fairness lease(s)` });
  }
  return removed;
}

/**
 * Gets the current active concurrency for an installation (non-expired leases).
 */
export async function getActiveInstallationConcurrency(
  redis: Redis,
  installationId: number | string,
  leaseKey: string = FAIRNESS_LEASE_KEY
): Promise<number> {
  const now = Date.now();
  // First reap expired
  await redis.zremrangebyscore(leaseKey, '-inf', now);

  const all = await redis.zrangebyscore(leaseKey, now, '+inf');
  const prefix = `${installationId}:`;
  return all.filter((m) => m.startsWith(prefix)).length;
}

/**
 * Item 21: Jittered exponential delay replacing the fixed 1.5s moveToDelayed polling.
 *
 * delay = min(baseMs * 2^attempt + jitter, maxMs)
 * jitter ∈ [0, baseMs)
 */
export function computeJitteredBackoff(
  attempt: number,
  baseMs: number = 500,
  maxMs: number = 30000
): number {
  const exponential = baseMs * Math.pow(2, Math.min(attempt, 10));
  const jitter = Math.floor(Math.random() * baseMs);
  return Math.min(exponential + jitter, maxMs);
}
