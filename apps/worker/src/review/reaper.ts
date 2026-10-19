import { prisma } from '@ai-reviewer/db';
import { Redis } from 'ioredis';
import { logger } from '../logger.js';
import { metrics } from '../metrics.js';

export interface StuckReviewThresholds {
  pendingMinutes?: number;
  processingMinutes?: number;
  postingMinutes?: number;
}

export const DEFAULT_THRESHOLDS: Required<StuckReviewThresholds> = {
  pendingMinutes: 10,
  processingMinutes: 10,
  postingMinutes: 5,
};

/**
 * Reaps stale reviews stuck in 'pending', 'processing', or 'posting' states (e.g. from crashed workers or timeouts).
 * Marks them as 'failed' and writes a corresponding record to failed_reviews so operators can inspect and retry.
 */
export async function reapStaleReviews(
  thresholds: StuckReviewThresholds = DEFAULT_THRESHOLDS,
  redis?: Redis
): Promise<number> {
  const cfg = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const now = Date.now();

  const pendingCutoff = new Date(now - cfg.pendingMinutes * 60 * 1000);
  const processingCutoff = new Date(now - cfg.processingMinutes * 60 * 1000);
  const postingCutoff = new Date(now - cfg.postingMinutes * 60 * 1000);

  // Find candidate stale reviews
  const staleReviews = await prisma.review.findMany({
    where: {
      OR: [
        { status: 'pending', startedAt: { lt: pendingCutoff } },
        { status: 'processing', startedAt: { lt: processingCutoff } },
        { status: 'posting', startedAt: { lt: postingCutoff } },
      ],
    },
    include: {
      pullRequest: {
        include: {
          repository: true,
        },
      },
    },
    take: 100, // Batch limit to avoid overwhelming DB
  });

  if (staleReviews.length === 0) {
    return 0;
  }

  metrics.recordStaleJobDetected(staleReviews.length);
  let reapedCount = 0;

  for (const review of staleReviews) {
    try {
      const priorStatus = review.status;
      const timeoutReason = `Review timed out or worker process terminated unexpectedly while in status '${priorStatus}'. Exceeded threshold.`;

      await prisma.$transaction([
        prisma.review.update({
          where: { id: review.id },
          data: {
            status: 'failed',
            stage: 'FAILED',
            summary: timeoutReason,
            completedAt: new Date(),
          },
        }),
        prisma.failedReview.create({
          data: {
            pullRequestId: review.pullRequestId,
            commitSha: review.commitSha,
            errorMessage: timeoutReason,
            jobId: null,
            jobData: {
              reapedFromStatus: priorStatus,
              startedAt: review.startedAt,
              reapedAt: new Date().toISOString(),
              thresholdMinutes:
                priorStatus === 'posting'
                  ? cfg.postingMinutes
                  : priorStatus === 'processing'
                  ? cfg.processingMinutes
                  : cfg.pendingMinutes,
            },
          },
        }),
      ]);

      // Release distributed review lock in Redis if available
      if (redis && review.pullRequest?.repository?.fullName) {
        const lockKey = `review-lock:${review.pullRequest.repository.fullName}:${review.pullRequest.githubPrNumber}:${review.commitSha}`;
        try {
          await redis.del(lockKey);
        } catch {
          // Non-fatal
        }
      }

      reapedCount++;
      metrics.recordStaleJobReaped(1);
      metrics.recordErrorCategory('timeout');

      logger.warn({
        event: 'stale_review_reaped',
        review_id: review.id,
        pull_request_id: review.pullRequestId,
        commit_sha: review.commitSha,
        prior_status: priorStatus,
        error_category: 'timeout',
        started_at: review.startedAt,
        msg: `Reaped stuck review #${review.id} (${priorStatus} -> failed) and created FailedReview record.`,
      });
    } catch (err) {
      logger.error({
        review_id: review.id,
        err: (err as Error).message,
        msg: `Failed to reap review #${review.id}`,
      });
    }
  }

  return reapedCount;
}

