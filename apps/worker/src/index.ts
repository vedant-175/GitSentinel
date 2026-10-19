import 'dotenv/config';
import { Worker, Job, DelayedError, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@ai-reviewer/db';
import {
  ReviewJobData,
  PRClosedJobData,
  InstallationSyncJobData,
  InstallationReposSyncJobData,
  QueueJobData,
  AuditAction,
  classifyErrorCategory,
  createStageTimingRecord,
} from '@ai-reviewer/shared';
import { processReviewJob } from './review/pipeline.js';
import { reapStaleReviews } from './review/reaper.js';
import { logger, createChildLogger } from './logger.js';
import {
  acquireInstallationSlot,
  releaseInstallationSlot,
  reapExpiredLeases,
  computeJitteredBackoff,
  heartbeatLease,
} from './queue/fairness.js';
import {
  acquireReviewLock,
  releaseReviewLock,
  extendReviewLock,
  HeadShaChangedError,
} from './queue/idempotency.js';
import { startHealthServer } from './server.js';
import { runModelPreflight } from './review/llm.js';
import { metrics } from './metrics.js';

// Boot validation: In production or runtime, required environment variables must be present
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error('Missing required environment variable: REDIS_URL');
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

// Phase A Requirement 3: Startup LLM Preflight Check
const providerName = (process.env.LLM_PROVIDER || '').toLowerCase();
if (providerName && providerName !== 'mock') {
  logger.info({ provider: providerName, msg: 'Executing startup LLM preflight health check...' });
  try {
    await runModelPreflight(providerName);
    logger.info({ provider: providerName, msg: 'Startup LLM preflight check succeeded.' });
  } catch (err: any) {
    logger.fatal({ err: err.message, msg: 'Startup LLM preflight check failed. Halting boot.' });
    process.exit(1);
  }
}

const QUEUE_NAME = 'pr-review-queue';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
const LOCK_DURATION_MS = 300000; // 5 minutes for long LLM calls

logger.info({
  redis_url: REDIS_URL,
  concurrency: CONCURRENCY,
  msg: 'Initializing AI Code Review Worker...',
});

const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on('connect', () => {
  logger.info({ msg: 'Connected to Redis successfully' });
});

redisConnection.on('error', (err: Error) => {
  logger.error({ err: err.message, msg: 'Redis Connection Error' });
});

export const queue = new Queue<QueueJobData>(QUEUE_NAME, {
  connection: redisConnection,
});

let isShuttingDown = false;

export const healthServer = startHealthServer({
  redis: redisConnection,
  queue,
  isShuttingDown: () => isShuttingDown,
});

// Track per-job lock info for cleanup in finally blocks
interface JobLockInfo {
  installationId?: number;
  jobId?: string;
  reviewLockValue?: string;
  repoFullName?: string;
  prNumber?: number;
  commitSha?: string;
}

export const worker = new Worker<QueueJobData>(
  QUEUE_NAME,
  async (job: Job<QueueJobData>, token?: string) => {
    const jobType = (job.data as { type?: string }).type || job.name || 'review-pr';
    const deliveryId = (job.data as any)?.deliveryId || (job.data as any)?.delivery_id;

    // Per-installation fairness check (Requirement 17 + Item 21)
    let installationId: number | undefined;
    if (job.data) {
      if ('installationId' in job.data && job.data.installationId) {
        installationId = job.data.installationId;
      } else if ('githubInstallationId' in job.data && job.data.githubInstallationId) {
        installationId = Number(job.data.githubInstallationId);
      }
    }

    const lockInfo: JobLockInfo = {
      installationId,
      jobId: job.id,
    };

    const jobStartTime = Date.now();
    const queueWaitMs = job.timestamp ? Math.max(0, jobStartTime - job.timestamp) : 0;
    metrics.recordQueueWait(queueWaitMs);

    const correlationId =
      (job.data as any)?.correlationId ||
      deliveryId ||
      (job.id ? `c-${job.id}` : `c-unknown-${Date.now()}`);

    if (job.attemptsMade > 0) {
      metrics.recordRetry();
    }

    // Stage 4: worker_start
    const workerStartRecord = createStageTimingRecord({
      stage: 'worker_start',
      durationMs: queueWaitMs,
      status: 'success',
      retryCount: job.attemptsMade,
      jobId: job.id,
      reviewId: null,
      repositoryId: (job.data as any)?.githubRepoId || (job.data as any)?.repoId || null,
      commitSha: (job.data as any)?.commitSha || 'unknown',
      correlationId,
      startedAt: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
      completedAt: new Date(jobStartTime).toISOString(),
    });
    metrics.recordStageExecution('worker_start', queueWaitMs, 'success');

    if (job.data && typeof job.data === 'object') {
      if (!(job.data as any).stageTimings) {
        (job.data as any).stageTimings = {};
      }
      (job.data as any).stageTimings.worker_start = workerStartRecord;
      (job.data as any).correlationId = correlationId;
      (job.data as any).retryCount = job.attemptsMade;
    }

    if (installationId) {
      const acquired = await acquireInstallationSlot(
        redisConnection,
        installationId,
        undefined, // use default concurrency limit
        LOCK_DURATION_MS,
        job.id
      );
      if (!acquired) {
        // Item 21: jittered exponential delay instead of fixed 1.5s
        const delay = computeJitteredBackoff(job.attemptsMade || 0);
        logger.info({
          job_id: job.id,
          delivery_id: deliveryId,
          installation_id: installationId,
          delay_ms: delay,
          msg: `Installation ${installationId} reached concurrency limit. Delaying job ${delay}ms.`,
        });
        await job.moveToDelayed(Date.now() + delay, token || job.token);
        throw new DelayedError();
      }

      // Record per-installation metric
      metrics.recordInstallationJob(installationId, 'started');
    }

    // Item 21: Start heartbeat interval to renew fairness lease
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    if (installationId && job.id) {
      heartbeatTimer = setInterval(async () => {
        try {
          await heartbeatLease(redisConnection, installationId!, job.id!, LOCK_DURATION_MS);
          // Also extend the review lock if we hold one
          if (lockInfo.reviewLockValue && lockInfo.repoFullName && lockInfo.prNumber && lockInfo.commitSha) {
            await extendReviewLock(
              redisConnection,
              lockInfo.repoFullName,
              lockInfo.prNumber,
              lockInfo.commitSha,
              lockInfo.reviewLockValue
            );
          }
        } catch {
          // Non-fatal; lease will expire naturally if heartbeat fails
        }
      }, Math.floor(LOCK_DURATION_MS / 3)); // renew at 1/3 of TTL
    }

    try {
      if (deliveryId) {
        try {
          await prisma.webhookDelivery.upsert({
            where: { deliveryId },
            update: { statusCode: 200 },
            create: {
              deliveryId,
              event: jobType === 'review-pr' ? 'pull_request' : jobType,
              action: (job.data as any)?.action || null,
              repositoryId: (job.data as any)?.repoId || null,
              installationId: installationId ? BigInt(installationId) : null,
              payload: (job.data as any) || null,
              statusCode: 200,
            },
          });
        } catch {
          // Non-fatal
        }
      }

      if (jobType === 'pr-closed') {
        const data = job.data as PRClosedJobData;
        const jobLog = createChildLogger({
          job_id: job.id,
          delivery_id: deliveryId,
          installation_id: installationId,
          pr_number: data.prNumber,
        });
        jobLog.info({ repo_id: data.githubRepoId, merged: data.merged, msg: 'Received PR Closed event' });
        const repo = await prisma.repository.findUnique({
          where: { githubRepoId: BigInt(data.githubRepoId) },
        });
        if (repo) {
          await prisma.pullRequest.updateMany({
            where: {
              repositoryId: repo.id,
              githubPrNumber: data.prNumber,
            },
            data: {
              state: data.merged ? 'merged' : 'closed',
              mergedAt: data.mergedAt ? new Date(data.mergedAt) : null,
              closedAt: data.closedAt ? new Date(data.closedAt) : new Date(),
            },
          });
          jobLog.info({ msg: `Updated PR #${data.prNumber} state to ${data.merged ? 'merged' : 'closed'}` });
        }
        return { success: true, updated: true };
      }

      if (jobType === 'installation-sync') {
        const data = job.data as InstallationSyncJobData;
        const jobLog = createChildLogger({
          job_id: job.id,
          delivery_id: deliveryId,
          installation_id: data.githubInstallationId,
        });
        jobLog.info({ action: data.action, msg: 'Received Installation Sync event' });
        if (data.action === 'created' || data.action === 'unsuspend') {
          await prisma.installation.upsert({
            where: { githubInstallationId: BigInt(data.githubInstallationId) },
            update: {
              accountLogin: data.accountLogin,
              accountType: data.accountType,
            },
            create: {
              githubInstallationId: BigInt(data.githubInstallationId),
              accountLogin: data.accountLogin,
              accountType: data.accountType,
            },
          });
        } else if (data.action === 'deleted') {
          await prisma.installation.deleteMany({
            where: { githubInstallationId: BigInt(data.githubInstallationId) },
          });
        }
        return { success: true };
      }

      if (jobType === 'installation-repositories-sync') {
        const data = job.data as InstallationReposSyncJobData;
        const jobLog = createChildLogger({
          job_id: job.id,
          delivery_id: deliveryId,
          installation_id: data.githubInstallationId,
        });
        jobLog.info({
          added_count: data.added.length,
          removed_count: data.removed.length,
          msg: 'Received Installation Repositories Sync event',
        });
        const inst = await prisma.installation.findUnique({
          where: { githubInstallationId: BigInt(data.githubInstallationId) },
        });
        if (inst) {
          for (const added of data.added) {
            const repoRecord = await prisma.repository.upsert({
              where: { githubRepoId: BigInt(added.id) },
              update: { fullName: added.fullName },
              create: {
                installationId: inst.id,
                githubRepoId: BigInt(added.id),
                fullName: added.fullName,
              },
            });

            await prisma.auditLog.create({
              data: {
                installationId: inst.id,
                actor: 'worker',
                actorRole: 'SYSTEM',
                action: AuditAction.REPOSITORY_CONNECTED,
                resourceType: 'repository',
                resourceId: String(repoRecord.id),
                metadata: {
                  fullName: added.fullName,
                  githubRepoId: added.id,
                },
              },
            }).catch(() => {});
          }
          for (const removed of data.removed) {
            await prisma.repository.deleteMany({
              where: { githubRepoId: BigInt(removed.id) },
            });

            await prisma.auditLog.create({
              data: {
                installationId: inst.id,
                actor: 'worker',
                actorRole: 'SYSTEM',
                action: AuditAction.REPOSITORY_DISCONNECTED,
                resourceType: 'repository',
                resourceId: String(removed.id),
                metadata: {
                  fullName: removed.fullName,
                  githubRepoId: removed.id,
                },
              },
            }).catch(() => {});
          }
        }
        return { success: true };
      }

      // Default: review-pr
      const reviewData = job.data as ReviewJobData;
      const jobLog = createChildLogger({
        job_id: job.id,
        correlation_id: correlationId,
        delivery_id: deliveryId,
        installation_id: reviewData.installationId,
        repo: reviewData.repoFullName,
        pr_number: reviewData.prNumber,
        commit_sha: reviewData.commitSha,
        retry_count: job.attemptsMade,
      });
      jobLog.info({
        event: 'job_started',
        stage: 'worker_start',
        correlation_id: correlationId,
        retry_count: job.attemptsMade,
        queue_wait_ms: queueWaitMs,
        msg: `Processing Review Job [ID: ${job.id}]`,
      });

      // Item 20: Acquire distributed lock per (repo, PR, sha)
      if (reviewData.repoFullName && reviewData.prNumber && reviewData.commitSha) {
        lockInfo.repoFullName = reviewData.repoFullName;
        lockInfo.prNumber = reviewData.prNumber;
        lockInfo.commitSha = reviewData.commitSha;

        const lockValue = await acquireReviewLock(
          redisConnection,
          reviewData.repoFullName,
          reviewData.prNumber,
          reviewData.commitSha
        );

        if (!lockValue) {
          jobLog.info({
            event: 'job_duplicate_skipped',
            msg: `Another worker is already processing review for ${reviewData.repoFullName}#${reviewData.prNumber}@${reviewData.commitSha.substring(0, 7)}. Skipping.`,
          });
          return { reviewId: 0, issuesCount: 0, status: 'duplicate-locked' };
        }

        lockInfo.reviewLockValue = lockValue;
      }

      const result = await processReviewJob(reviewData, undefined, redisConnection, job.id);

      // Record per-installation completion metric
      if (installationId) {
        metrics.recordInstallationJob(installationId, 'completed');
      }

      return result;
    } catch (err) {
      const errorCat = classifyErrorCategory(err);
      metrics.recordErrorCategory(errorCat);

      // Item 20: Treat failed head-SHA verification as a retryable error
      if (err instanceof HeadShaChangedError) {
        logger.warn({
          event: 'job_retryable_sha_changed',
          job_id: job.id,
          correlation_id: correlationId,
          error_category: errorCat,
          err: err.message,
          msg: 'Head SHA changed; marking as retryable',
        });
        throw err; // BullMQ will retry based on job attempts config
      }

      if (installationId) {
        metrics.recordInstallationJob(installationId, 'failed');
      }

      logger.error({
        event: 'job_failed',
        job_id: job.id,
        correlation_id: correlationId,
        retry_count: job.attemptsMade,
        error_category: errorCat,
        err: (err as Error).message,
        msg: `Job ${job.id} failed: ${(err as Error).message}`,
      });

      throw err;
    } finally {
      metrics.recordJobDuration(Date.now() - jobStartTime);

      // Clear heartbeat timer
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }

      // Release fairness slot
      if (lockInfo.installationId) {
        await releaseInstallationSlot(redisConnection, lockInfo.installationId, lockInfo.jobId);
      }

      // Release review idempotency lock
      if (lockInfo.reviewLockValue && lockInfo.repoFullName && lockInfo.prNumber && lockInfo.commitSha) {
        await releaseReviewLock(
          redisConnection,
          lockInfo.repoFullName,
          lockInfo.prNumber,
          lockInfo.commitSha,
          lockInfo.reviewLockValue
        );
      }
    }
  },
  {
    connection: redisConnection,
    concurrency: CONCURRENCY,
    lockDuration: LOCK_DURATION_MS,
    stalledInterval: 30000,
    maxStalledCount: 2,
  }
);

worker.on('completed', (job: Job<QueueJobData>, returnvalue: unknown) => {
  const deliveryId = (job.data as any)?.deliveryId || (job.data as any)?.delivery_id;
  logger.info({
    job_id: job.id,
    delivery_id: deliveryId,
    returnvalue,
    msg: `Job [ID: ${job.id}] completed successfully`,
  });
  syncMetricsToRedis().catch(() => {});
});

worker.on('stalled', (jobId: string) => {
  logger.warn({
    job_id: jobId,
    msg: `Job [ID: ${jobId}] stalled and will be recovered`,
  });
});

worker.on('failed', async (job: Job<QueueJobData> | undefined, err: Error) => {
  if (!job) return;
  if (err instanceof DelayedError) {
    return; // Delayed for fairness slot; not a real failure
  }

  const deliveryId = (job.data as any)?.deliveryId || (job.data as any)?.delivery_id;
  const attempts = job.opts?.attempts || 3;
  logger.error({
    job_id: job.id,
    delivery_id: deliveryId,
    attempts_made: job.attemptsMade,
    max_attempts: attempts,
    err: err.message,
    msg: `Job [ID: ${job.id}] failed after attempt ${job.attemptsMade}/${attempts}`,
  });

  // If final attempt failed, record in failed_reviews table (Fail Closed - Requirement 18)
  if (job.attemptsMade >= attempts) {
    logger.error({
      job_id: job.id,
      delivery_id: deliveryId,
      msg: `Job [ID: ${job.id}] permanently failed. Recording failed_reviews row.`,
    });
    try {
      const data = job.data as ReviewJobData;
      let pullRequestId: number | undefined;
      const commitSha = data?.commitSha || 'unknown';

      if (data && data.githubRepoId && data.prNumber) {
        const repo = await prisma.repository.findUnique({
          where: { githubRepoId: BigInt(data.githubRepoId) },
        });
        if (repo) {
          const pr = await prisma.pullRequest.findFirst({
            where: { repositoryId: repo.id, githubPrNumber: data.prNumber },
          });
          pullRequestId = pr?.id;
        }
      }

      const retryOfFailedReviewId = (data as any)?._retryOfFailedReviewId;
      if (retryOfFailedReviewId) {
        await prisma.failedReview.update({
          where: { id: retryOfFailedReviewId },
          data: {
            errorMessage: `Retry failed after ${attempts} attempts: ${err.message || 'Unknown failure'}`,
            errorStack: err.stack || null,
            jobId: null,
            failedAt: new Date(),
          },
        }).catch(() => {});
      } else {
        await prisma.failedReview.create({
          data: {
            pullRequestId: pullRequestId || null,
            commitSha,
            errorMessage: err.message || 'Unknown processing failure',
            errorStack: err.stack || null,
            jobId: job.id ? String(job.id) : null,
            jobData: job.data ? (job.data as any) : null,
          },
        });
      }
    } catch (dbErr) {
      logger.error({ err: (dbErr as Error).message, msg: 'Failed to write to failed_reviews table' });
    }
  }
  syncMetricsToRedis().catch(() => {});
});

// Periodically sync worker metrics snapshot to Redis for instant dashboard telemetry
async function syncMetricsToRedis() {
  try {
    const snapshot = await metrics.getSnapshot(queue);
    await redisConnection.setex('observability:worker_metrics', 60, JSON.stringify(snapshot));
  } catch {
    // Non-fatal
  }
}

syncMetricsToRedis().catch(() => {});
const metricsSyncInterval = setInterval(() => {
  syncMetricsToRedis().catch(() => {});
}, 10000);

// Periodically reap stale pending/processing/posting reviews (Requirement 7)
reapStaleReviews(undefined, redisConnection).catch((err) =>
  logger.warn({ err: (err as Error).message, msg: 'Initial stale review reap failed' })
);

// Periodically reap expired fairness leases (Item 21)
reapExpiredLeases(redisConnection).catch((err) =>
  logger.warn({ err: (err as Error).message, msg: 'Initial fairness lease reap failed' })
);

const reaperInterval = setInterval(() => {
  reapStaleReviews(undefined, redisConnection).catch((err) =>
    logger.warn({ err: (err as Error).message, msg: 'Periodic stale review reap failed' })
  );
  reapExpiredLeases(redisConnection).catch((err) =>
    logger.warn({ err: (err as Error).message, msg: 'Periodic fairness lease reap failed' })
  );
}, 60000);

// Graceful shutdown with 30s drain timeout (Requirement 19)
async function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal, msg: `Received ${signal}. Draining and shutting down worker...` });

  clearInterval(reaperInterval);
  clearInterval(metricsSyncInterval);

  const drainTimeout = setTimeout(() => {
    logger.error({ msg: 'Worker shutdown drain timeout exceeded (30s). Forcing process exit.' });
    process.exit(1);
  }, 30000);

  try {
    await worker.close();
    logger.info({ msg: 'Worker closed.' });
    healthServer.close();
    await queue.close();
    await redisConnection.quit();
    clearTimeout(drainTimeout);
    logger.info({ msg: 'Worker process successfully terminated.' });
    process.exit(0);
  } catch (err) {
    clearTimeout(drainTimeout);
    logger.error({ err: (err as Error).message, msg: 'Error during graceful shutdown' });
    process.exit(1);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default healthServer;
