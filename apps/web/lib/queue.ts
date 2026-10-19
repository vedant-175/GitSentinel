import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  ReviewJobData,
  PRClosedJobData,
  InstallationSyncJobData,
  InstallationReposSyncJobData,
} from '@ai-reviewer/shared';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
export const QUEUE_NAME = 'pr-review-queue';

declare global {
  // eslint-disable-next-line no-var
  var reviewQueueGlobal: Queue | undefined;
  // eslint-disable-next-line no-var
  var redisProducerGlobal: Redis | undefined;
}

// Producer Redis connection: maxRetriesPerRequest: null, enableOfflineQueue: false
export let redisProducerConnection =
  globalThis.redisProducerGlobal ??
  new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy(times) {
      if (process.env.NODE_ENV === 'test') {
        if (times > 1) return null;
        return 50;
      }
      return Math.min(times * 100, 3000);
    },
  });

redisProducerConnection.on('error', () => {
  // Suppress unhandled error events in offline/test environments
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.redisProducerGlobal = redisProducerConnection;
}

/**
 * Ensures Redis is ready before sending commands when enableOfflineQueue: false.
 * Fails fast with a timeout if Redis is unresponsive. Re-creates connection if terminated.
 */
export async function ensureRedisReady(
  timeoutMs = process.env.NODE_ENV === 'test' ? 400 : 5000
): Promise<Redis> {
  if (redisProducerConnection.status === 'end') {
    redisProducerConnection = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (process.env.NODE_ENV === 'test') {
          if (times > 1) return null;
          return 50;
        }
        return Math.min(times * 100, 3000);
      },
    });
    redisProducerConnection.on('error', () => {});
    globalThis.redisProducerGlobal = redisProducerConnection;
  }
  if (redisProducerConnection.status === 'ready') {
    return redisProducerConnection;
  }
  if (redisProducerConnection.status === 'close' || redisProducerConnection.status === 'wait') {
    try {
      await redisProducerConnection.connect();
    } catch {
      // Reconnect handled
    }
  }
  if (
    redisProducerConnection.status === 'wait' ||
    redisProducerConnection.status === 'connecting' ||
    redisProducerConnection.status === 'connect'
  ) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Redis connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: unknown) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        clearTimeout(timer);
        redisProducerConnection.removeListener('ready', onReady);
        redisProducerConnection.removeListener('error', onError);
      };
      redisProducerConnection.once('ready', onReady);
      redisProducerConnection.once('error', onError);
    });
  }
  return redisProducerConnection;
}

export const reviewQueue =
  globalThis.reviewQueueGlobal ??
  new Queue(QUEUE_NAME, {
    connection: redisProducerConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        count: 1000,
      },
      removeOnFail: {
        count: 5000,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.reviewQueueGlobal = reviewQueue;
}

/**
 * Delivery deduplication state machine:
 * - 'processing': locked while enqueuing
 * - 'done': successfully enqueued
 *
 * Item 9: set the delivery-dedupe key AFTER a successful enqueue (or delete it in a catch),
 * and use a per-delivery "processing/done" state.
 */
export async function acquireDeliveryLock(
  deliveryId: string,
  _ttlSeconds = 86400
): Promise<'new' | 'already_done' | 'in_flight'> {
  const redis = await ensureRedisReady();
  const key = `github:delivery:${deliveryId}`;

  // Check current state first
  const existing = await redis.get(key);
  if (existing === 'done') {
    return 'already_done';
  }
  if (existing === 'processing') {
    return 'in_flight';
  }

  // Set processing state with NX (30s lock for processing duration)
  const acquired = await redis.set(key, 'processing', 'EX', 30, 'NX');
  if (acquired === 'OK') {
    return 'new';
  }

  const currentState = await redis.get(key);
  return currentState === 'done' ? 'already_done' : 'in_flight';
}

export async function markDeliveryDone(
  deliveryId: string,
  ttlSeconds = 86400
): Promise<void> {
  const redis = await ensureRedisReady();
  const key = `github:delivery:${deliveryId}`;
  await redis.set(key, 'done', 'EX', ttlSeconds);
}

export async function releaseDeliveryLock(deliveryId: string): Promise<void> {
  try {
    const redis = await ensureRedisReady();
    const key = `github:delivery:${deliveryId}`;
    await redis.del(key);
  } catch (err) {
    console.warn(`Failed to release delivery lock for ${deliveryId}:`, err);
  }
}

/**
 * Backward compatibility helper for deduplication
 */
export async function deduplicateDelivery(
  deliveryId: string,
  ttlSeconds = 86400
): Promise<boolean> {
  const status = await acquireDeliveryLock(deliveryId, ttlSeconds);
  if (status === 'new') {
    await markDeliveryDone(deliveryId, ttlSeconds);
    return true;
  }
  return false;
}

/**
 * Check cached repo config from Redis (if available)
 */
export async function getCachedRepoConfig(
  githubRepoId: number
): Promise<{ skip_drafts?: boolean; skip_bot_authors?: boolean } | null> {
  try {
    const redis = await ensureRedisReady();
    const raw = await redis.get(`repo:config:${githubRepoId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Cache repo config in Redis
 */
export async function setCachedRepoConfig(
  githubRepoId: number,
  config: Record<string, unknown>,
  ttlSeconds = 86400
): Promise<void> {
  try {
    const redis = await ensureRedisReady();
    await redis.set(
      `repo:config:${githubRepoId}`,
      JSON.stringify(config),
      'EX',
      ttlSeconds
    );
  } catch (err) {
    console.warn('Failed to cache repo config in Redis:', err);
  }
}

let enqueueReviewJobOverride: ((data: ReviewJobData) => Promise<string>) | null = null;

export function setEnqueueReviewJobOverride(fn: ((data: ReviewJobData) => Promise<string>) | null) {
  enqueueReviewJobOverride = fn;
}

/**
 * Enqueue a new PR review job
 */
export async function enqueueReviewJob(data: ReviewJobData): Promise<string> {
  if (enqueueReviewJobOverride) {
    return enqueueReviewJobOverride(data);
  }

  // Deterministic job ID per commit SHA prevents duplicate enqueuing
  const jobId = `review-${data.githubRepoId}-${data.prNumber}-${data.commitSha.substring(0, 10)}`;

  const job = await reviewQueue.add('review-pr', data, {
    jobId,
  });

  return job.id || jobId;
}

/**
 * Enqueue a PR closed event job
 */
export async function enqueuePRClosedJob(data: PRClosedJobData): Promise<string> {
  const jobId = `pr-closed-${data.githubRepoId}-${data.prNumber}-${Date.now()}`;
  const job = await reviewQueue.add('pr-closed', data, {
    jobId,
  });
  return job.id || jobId;
}

/**
 * Enqueue an installation sync event job
 */
export async function enqueueInstallationSyncJob(
  data: InstallationSyncJobData
): Promise<string> {
  const jobId = `installation-sync-${data.githubInstallationId}-${Date.now()}`;
  const job = await reviewQueue.add('installation-sync', data, {
    jobId,
  });
  return job.id || jobId;
}

/**
 * Enqueue an installation repositories sync event job
 */
export async function enqueueInstallationReposSyncJob(
  data: InstallationReposSyncJobData
): Promise<string> {
  const jobId = `installation-repos-sync-${data.githubInstallationId}-${Date.now()}`;
  const job = await reviewQueue.add('installation-repositories-sync', data, {
    jobId,
  });
  return job.id || jobId;
}
