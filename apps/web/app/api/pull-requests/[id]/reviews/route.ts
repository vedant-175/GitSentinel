import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import {
  requireSession,
  getSessionInstallationIds,
  requirePullRequestAccess,
  getUserRoleForInstallation,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/auth-helpers';
import { Permission, assertPermission, AuditAction, RbacForbiddenError } from '@ai-reviewer/shared';
import { recordAuditLog } from '@/lib/audit';
import { checkApiRateLimit, checkReviewRerunRateLimit } from '@/lib/rate-limit';
import { getInstallationOctokit } from '@/lib/github';
import { enqueueReviewJob } from '@/lib/queue';

import { parsePaginationParams, paginateResults } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const rateLimitResponse = await checkApiRateLimit(req, 120, 60);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const prId = parseInt(params.id, 10);
    if (isNaN(prId)) {
      return NextResponse.json({ error: 'Bad Request', message: 'Invalid pull request ID' }, { status: 400 });
    }

    const { pr } = await requirePullRequestAccess(prId);

    // Cursor pagination (default: 25, max: 100)
    const { cursor, limit } = parsePaginationParams(req.url, 25, 100);

    const reviews = await prisma.review.findMany({
      where: { pullRequestId: pr.id },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        _count: { select: { issues: true } },
        issues: {
          take: 50,
        },
      },
      orderBy: { id: 'desc' },
    });

    const paginated = paginateResults(reviews, limit);
    return NextResponse.json(serializeWithBigInt(paginated));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden', message: error.message }, { status: 403 });
    }
    console.error('Failed to fetch PR reviews:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to fetch PR reviews' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Rate limiting (10 req/min for expensive review rerun)
  const rateLimitResponse = await checkReviewRerunRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  // 2. Authentication
  let session: any;
  try {
    session = await requireSession();
  } catch (authError) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  // 3. Validation
  const prId = parseInt(params.id, 10);
  if (isNaN(prId)) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid pull request ID' },
      { status: 400 }
    );
  }

  try {
    // 4. Verify PR exists in database
    const pr = await prisma.pullRequest.findUnique({
      where: { id: prId },
      include: {
        repository: {
          include: {
            installation: true,
          },
        },
      },
    });

    if (!pr) {
      return NextResponse.json(
        { error: 'Not Found', message: `Pull request #${prId} not found` },
        { status: 404 }
      );
    }

    // 5. Authorization: user has access to repo installation
    const installationIds = await getSessionInstallationIds();
    const repoInstallationId = pr.repository.installation.githubInstallationId;
    const isAuthorized = installationIds.some(
      (id) => BigInt(id) === BigInt(repoInstallationId)
    );

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Forbidden', message: `Access denied to repository ${pr.repository.fullName}` },
        { status: 403 }
      );
    }

    const userRole = await getUserRoleForInstallation(session, repoInstallationId);
    assertPermission(userRole, Permission.REVIEW_RERUN);

    // 6. Fetch current PR head SHA from GitHub API
    const [owner, repoName] = pr.repository.fullName.split('/');
    const octokit = getInstallationOctokit(Number(pr.repository.installation.githubInstallationId));

    if (!octokit) {
      return NextResponse.json(
        { error: 'Bad Gateway', message: 'GitHub App authentication is not configured on the server' },
        { status: 502 }
      );
    }

    let ghPr: any;
    try {
      const ghRes = await octokit.rest.pulls.get({
        owner,
        repo: repoName,
        pull_number: pr.githubPrNumber,
      });
      ghPr = ghRes.data;
    } catch (ghErr: any) {
      console.error('GitHub API error fetching PR details:', ghErr.message);
      return NextResponse.json(
        { error: 'Bad Gateway', message: `Failed to fetch pull request from GitHub API: ${ghErr.message || 'Upstream error'}` },
        { status: 502 }
      );
    }

    const headSha = ghPr?.head?.sha;
    if (!headSha) {
      return NextResponse.json(
        { error: 'Bad Gateway', message: 'GitHub API did not return a valid head commit SHA' },
        { status: 502 }
      );
    }

    // 7. Prevent duplicate active reviews for the same repository + PR + SHA
    // Auto-recover reviews that have been stuck in 'pending' or 'posting' beyond threshold (10 minutes)
    const activeReview = await prisma.review.findFirst({
      where: {
        pullRequestId: pr.id,
        commitSha: headSha,
        status: { in: ['pending', 'processing', 'posting'] },
      },
    });

    if (activeReview) {
      const STUCK_THRESHOLD_MS = 10 * 60 * 1000;
      const ageMs = Date.now() - new Date(activeReview.startedAt).getTime();
      if (ageMs > STUCK_THRESHOLD_MS) {
        // Recover stuck review and proceed with fresh rerun
        await prisma.review.update({
          where: { id: activeReview.id },
          data: {
            status: 'failed',
            stage: 'FAILED',
            summary: `Review timed out after ${Math.round(ageMs / 60000)}m (auto-recovered by system)`,
            completedAt: new Date(),
          },
        });
        await prisma.failedReview.create({
          data: {
            pullRequestId: pr.id,
            commitSha: headSha,
            errorMessage: `Stuck review auto-recovered on rerun: was in '${activeReview.status}' for ${Math.round(ageMs / 60000)}m`,
            failedAt: new Date(),
            jobData: {
              recoveredFromStatus: activeReview.status,
              stuckMinutes: Math.round(ageMs / 60000),
            },
          },
        });
      } else {
        return NextResponse.json(
          {
            error: 'Conflict',
            message: `An active review (ID ${activeReview.id}) is already in progress for commit ${headSha.substring(0, 7)}`,
            reviewId: activeReview.id,
          },
          { status: 409 }
        );
      }
    }

    // 8. Update PR head SHA if newer & Upsert Review database record
    if (pr.headSha !== headSha) {
      await prisma.pullRequest.update({
        where: { id: pr.id },
        data: { headSha },
      });
    }

    const review = await prisma.review.upsert({
      where: {
        pullRequestId_commitSha: {
          pullRequestId: pr.id,
          commitSha: headSha,
        },
      },
      update: {
        status: 'pending',
        stage: 'QUEUED',
        verdict: null,
        summary: null,
        latencyMs: null,
        startedAt: new Date(),
        completedAt: null,
      },
      create: {
        pullRequestId: pr.id,
        commitSha: headSha,
        status: 'pending',
        stage: 'QUEUED',
        startedAt: new Date(),
      },
    });

    // 9. Enqueue the BullMQ review job
    let jobId: string;
    try {
      jobId = await enqueueReviewJob({
        type: 'review-pr',
        installationId: Number(pr.repository.installation.githubInstallationId),
        repoId: pr.repository.id,
        githubRepoId: Number(pr.repository.githubRepoId),
        prNumber: pr.githubPrNumber,
        commitSha: headSha,
        repoFullName: pr.repository.fullName,
        headBranch: ghPr.head?.ref,
        baseBranch: ghPr.base?.ref,
        title: ghPr.title || pr.title || undefined,
        author: ghPr.user?.login || pr.author || undefined,
        authorType: ghPr.user?.type,
        draft: ghPr.draft,
        receivedAt: Date.now(),
      });
    } catch (queueErr: any) {
      console.error('Failed to enqueue review job:', queueErr.message);
      await prisma.review.update({
        where: { id: review.id },
        data: {
          status: 'failed',
          stage: 'FAILED',
          summary: `Failed to enqueue review job into queue: ${queueErr.message}`,
          completedAt: new Date(),
        },
      });

      await prisma.failedReview.create({
        data: {
          pullRequestId: pr.id,
          commitSha: headSha,
          errorMessage: `Failed to enqueue review job into queue: ${queueErr.message}`,
          failedAt: new Date(),
          jobData: {
            type: 'review-pr',
            installationId: Number(pr.repository.installation.githubInstallationId),
            repoId: pr.repository.id,
            githubRepoId: Number(pr.repository.githubRepoId),
            prNumber: pr.githubPrNumber,
            commitSha: headSha,
            repoFullName: pr.repository.fullName,
            headBranch: ghPr.head?.ref,
            baseBranch: ghPr.base?.ref,
            title: ghPr.title || pr.title || undefined,
            author: ghPr.user?.login || pr.author || undefined,
            authorType: ghPr.user?.type,
            draft: ghPr.draft,
            receivedAt: Date.now(),
          },
        },
      }).catch((dbErr) => {
        console.error('Failed to create failedReview on enqueue failure:', dbErr);
      });

      await recordAuditLog({
        installationId: pr.repository.installationId,
        actor: session.user.login || session.user.id || 'anonymous',
        actorRole: userRole,
        action: AuditAction.REVIEW_FAILED,
        resourceType: 'review',
        resourceId: String(review.id),
        metadata: {
          prNumber: pr.githubPrNumber,
          commitSha: headSha,
          error: queueErr.message,
        },
      }).catch(() => {});

      return NextResponse.json(
        { error: 'Service Unavailable', message: 'Failed to enqueue review job into queue' },
        { status: 503 }
      );
    }

    // 10. Record audit log
    await recordAuditLog({
      installationId: pr.repository.installationId,
      actor:
        session?.user?.login ||
        (session?.user as any)?.name ||
        (session?.user as any)?.id ||
        'anonymous',
      actorRole: userRole,
      action: AuditAction.REVIEW_RERUN,
      resourceType: 'review',
      resourceId: String(review.id),
      metadata: {
        prId: pr.id,
        prNumber: pr.githubPrNumber,
        commitSha: headSha,
        jobId,
      },
    });

    // 11. Return HTTP 202 Accepted
    return NextResponse.json(
      {
        status: 'queued',
        reviewId: review.id,
        jobId,
        commitSha: headSha,
        message: 'Review job enqueued successfully',
      },
      { status: 202 }
    );
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized', message: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError || err instanceof RbacForbiddenError) {
      return NextResponse.json({ error: 'Forbidden', message: err.message }, { status: 403 });
    }
    console.error('Unexpected error in PR rerun endpoint:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred while processing the review request' },
      { status: 500 }
    );
  }
}
