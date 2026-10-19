import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import { requireInstallationAccess, UnauthorizedError, ForbiddenError } from '@/lib/auth-helpers';
import { checkApiRateLimit } from '@/lib/rate-limit';
import { getRepositoryAnalytics } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Rate limiting
  const rateLimitResponse = await checkApiRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const repoId = parseInt(params.id, 10);
    if (isNaN(repoId)) {
      return NextResponse.json({ error: 'Invalid repository ID' }, { status: 400 });
    }

    // 2. Auth: ensure user has access to this repo installation
    const { repo } = await requireInstallationAccess(repoId);

    const totalPrs = await prisma.pullRequest.count({
      where: { repositoryId: repo.id },
    });

    // 3. Native SQL aggregates
    const analytics = await getRepositoryAnalytics(repo.id);

    return NextResponse.json(
      serializeWithBigInt({
        repository: {
          id: repo.id,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          config: repo.config,
        },
        metrics: {
          totalPRs: totalPrs,
          totalReviews: analytics.latency.totalCompletedReviews,
          latency: analytics.latency,
          weeklyTrends: analytics.weeklyTrends,
          topFiles: analytics.topFiles,
          severityBreakdown: analytics.severityBreakdown,
          categoryBreakdown: analytics.categoryBreakdown,
        },
      })
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Failed to compute repo analytics:', error);
    return NextResponse.json({ error: 'Failed to compute repo analytics' }, { status: 500 });
  }
}
