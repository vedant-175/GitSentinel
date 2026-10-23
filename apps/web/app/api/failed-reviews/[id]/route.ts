import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import {
  requireSession,
  getSessionInstallationIds,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/auth-helpers';
import { checkApiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const rateLimitResponse = await checkApiRateLimit(req);
    if (rateLimitResponse) return rateLimitResponse;

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

    // Tenant check
    let hasAccess = false;
    const prInstallationId =
      failedReview.pullRequest?.repository?.installation?.githubInstallationId;
    if (prInstallationId && installationIds.some((id) => BigInt(id) === BigInt(prInstallationId))) {
      hasAccess = true;
    } else if (failedReview.jobData && typeof failedReview.jobData === 'object') {
      const jobInstId = (failedReview.jobData as any).installationId;
      if (jobInstId && installationIds.some((id) => BigInt(id) === BigInt(jobInstId))) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(serializeWithBigInt(failedReview));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Failed to get failed review:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const rateLimitResponse = await checkApiRateLimit(req);
    if (rateLimitResponse) return rateLimitResponse;

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

    // Tenant check
    let hasAccess = false;
    const prInstallationId =
      failedReview.pullRequest?.repository?.installation?.githubInstallationId;
    if (prInstallationId && installationIds.some((id) => BigInt(id) === BigInt(prInstallationId))) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const resolved = Boolean(body.resolved);

    const updated = await prisma.failedReview.update({
      where: { id: failedReview.id },
      data: {
        resolvedAt: resolved ? new Date() : null,
      },
    });

    return NextResponse.json(serializeWithBigInt(updated));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Failed to update failed review:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
