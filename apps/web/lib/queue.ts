import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ReviewJobData } from '@ai-reviewer/shared';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const QUEUE_NAME = 'pr-review-queue';

declare global {
  // eslint-disable-next-line no-var
  var reviewQueueGlobal: Queue<ReviewJobData> | undefined;
  // eslint-disable-next-line no-var
  var redisProducerGlobal: Redis | undefined;
}

const redisConnection =
  globalThis.redisProducerGlobal ??
  new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.redisProducerGlobal = redisConnection;
}

export const reviewQueue =
  globalThis.reviewQueueGlobal ??
  new Queue<ReviewJobData>(QUEUE_NAME, {
    connection: redisConnection,
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
 * Enqueue a new PR review job
 */
export async function enqueueReviewJob(data: ReviewJobData): Promise<string> {
  // Deterministic job ID per commit SHA prevents duplicate enqueuing
  const jobId = `review-${data.repoId}-${data.prNumber}-${data.commitSha.substring(0, 10)}`;

  const job = await reviewQueue.add('review-pr', data, {
    jobId,
  });

  return job.id || jobId;
}
