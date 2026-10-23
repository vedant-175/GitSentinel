import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@ai-reviewer/db';
import {
  requireSession,
  getSessionInstallationIds,
  getUserRoleForInstallation,
  handleAuthError,
} from '@/lib/auth-helpers';
import { Permission, assertPermission, AuditAction, RbacForbiddenError } from '@ai-reviewer/shared';
import { reviewQueue } from '@/lib/queue';
import { checkFailedReviewRetryRateLimit } from '@/lib/rate-limit';
import { recordAuditLog } from '@/lib/audit';

/**
 * Item 22: Retry endpoint uses a conditional update so only one retry can be enqueued.
 *
 * The retry flow:
 * 1. Atomically set retryJobId on the failed_review row IF it is still null (no prior retry).
 * 2. Enqueue the retry job to BullMQ.
 * 3. Do NOT mark resolvedAt here – the worker marks it after the retried job completes.
 *
 * If a second retry request races, the conditional update will return count=0 and the
 * endpoint returns 409 Conflict.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Authentication check
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    const authRes = handleAuthError(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Rate limiting (10 req/min for expensive review retry)
  const rateLimitResponse = await checkFailedReviewRetryRateLimit(req, session?.user?.id || (session?.user as any)?.login);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id } = await params;
    const failedReviewId = parseInt(id, 10);
    if (isNaN(failedReviewId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const installationIds = await getSessionInstallationIds();

    const failedReview = await prisma.failedReview.findUnique({
      where: { id: failedReviewId },
      include: {
        pullRequest: {
          include: {
            repository: {
              include: {
                installation: true,
              },
            },
          },
        },
      },
    });

    if (!failedReview) {
      return NextResponse.json({ error: 'Failed review not found' }, { status: 404 });
    }

    // Access check & RBAC
    let targetGithubInstId: bigint | null = null;
    const prInstallationId =
      failedReview.pullRequest?.repository?.installation?.githubInstallationId;
    if (prInstallationId && installationIds.includes(prInstallationId)) {
      targetGithubInstId = prInstallationId;
    } else if (failedReview.jobData && typeof failedReview.jobData === 'object') {
      const jobInstId = (failedReview.jobData as any).installationId;
      if (jobInstId && installationIds.includes(BigInt(jobInstId))) {
        targetGithubInstId = BigInt(jobInstId);
      }
    }

    if (!targetGithubInstId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userRole = await getUserRoleForInstallation(session, targetGithubInstId);
    assertPermission(userRole, Permission.REVIEW_RETRY);

    if (!failedReview.jobData) {
      return NextResponse.json(
        { error: 'Cannot retry review: job payload was not recorded.' },
        { status: 400 }
      );
    }

    // Already resolved
    if (failedReview.resolvedAt) {
      return NextResponse.json(
        { error: 'This failed review has already been resolved.' },
        { status: 409 }
      );
    }

    // Already has a retry in flight (check if prior retry is stale > 10m)
    const RETRY_STUCK_THRESHOLD_MS = 10 * 60 * 1000;
    let isRetryStale = false;
    if (failedReview.jobId && failedReview.jobId.startsWith('review-retry-')) {
      const parts = failedReview.jobId.split('-');
      const ts = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(ts) && Date.now() - ts > RETRY_STUCK_THRESHOLD_MS) {
        isRetryStale = true;
      } else {
        return NextResponse.json(
          { error: 'A retry is already in progress for this failed review.' },
          { status: 409 }
        );
      }
    }

    const newJobId = `review-retry-${failedReview.id}-${Date.now()}`;

    // Item 22: Conditional update – only set retryJobId if it's not already retrying,
    // or if the prior retry attempt is stale and needs recovery.
    const updateResult = await prisma.failedReview.updateMany({
      where: {
        id: failedReview.id,
        resolvedAt: null,
        OR: [
          { jobId: null },
          { NOT: { jobId: { startsWith: 'review-retry-' } } },
          ...(isRetryStale ? [{ jobId: failedReview.jobId }] : []),
        ],
      },
      data: {
        // Store the retry job ID so we can track it; resolvedAt stays null until the job completes.
        jobId: newJobId,
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json(
        { error: 'A retry is already in progress or the review has been resolved.' },
        { status: 409 }
      );
    }

    const jobData = failedReview.jobData as any;
    // Add new receivedAt timestamp for latency tracking
    jobData.receivedAt = Date.now();
    // Tag the retry so the worker can mark the failure resolved on completion
    jobData._retryOfFailedReviewId = failedReview.id;

    try {
      await reviewQueue.add('review-pr', jobData, {
        jobId: newJobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });
    } catch (queueErr) {
      // Rollback database state so the failed review is NOT permanently locked in 'retrying' state!
      await prisma.failedReview.update({
        where: { id: failedReview.id },
        data: {
          jobId: failedReview.jobId ?? null,
        },
      }).catch((dbErr) => {
        console.error('Failed to rollback failedReview.jobId on enqueue failure:', dbErr);
      });

      await recordAuditLog({
        installationId: failedReview.pullRequest?.repository?.installationId ?? null,
        actor: session.user.login || session.user.id || 'anonymous',
        actorRole: userRole,
        action: AuditAction.REVIEW_FAILED,
        resourceType: 'review',
        resourceId: String(failedReview.id),
        metadata: {
          failedReviewId: failedReview.id,
          reason: 'Enqueue failed during retry dispatch',
          error: (queueErr as Error).message,
        },
      }).catch(() => {});

      return NextResponse.json(
        {
          error: 'Service Unavailable',
          message: `Failed to enqueue retry job into queue: ${(queueErr as Error).message}`,
        },
        { status: 503 }
      );
    }

    await recordAuditLog({
      installationId: failedReview.pullRequest?.repository?.installationId ?? null,
      actor: session.user.login || session.user.id || 'anonymous',
      actorRole: userRole,
      action: AuditAction.REVIEW_RETRIED,
      resourceType: 'review',
      resourceId: String(failedReview.id),
      metadata: {
        failedReviewId: failedReview.id,
        commitSha: failedReview.commitSha,
        retryJobId: newJobId,
      },
    });

    return NextResponse.json({ success: true, newJobId });
  } catch (err) {
    const authRes = handleAuthError(err);
    if (authRes) return authRes;
    if (err instanceof RbacForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: (err as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
