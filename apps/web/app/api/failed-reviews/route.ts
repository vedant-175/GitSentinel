import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import { getSessionInstallationIds, UnauthorizedError, ForbiddenError } from '@/lib/auth-helpers';
import { checkApiRateLimit } from '@/lib/rate-limit';
import { parsePaginationParams, paginateResults } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // 1. Rate limiting
  const rateLimitResponse = await checkApiRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // 2. Auth: Scope by user's installation IDs
    const installationIds = await getSessionInstallationIds();

    // 3. Cursor pagination & filter
    const { cursor, limit } = parsePaginationParams(req.url, 25, 100);
    const { searchParams } = new URL(req.url);
    const resolvedParam = searchParams.get('resolved');

    let resolvedFilter: Record<string, unknown> | null | undefined;
    if (resolvedParam === 'true') {
      resolvedFilter = { not: null };
    } else if (resolvedParam === 'false') {
      resolvedFilter = null;
    }

    const failedReviews = await prisma.failedReview.findMany({
      where: {
        pullRequest: {
          repository: {
            installation: {
              githubInstallationId: {
                in: installationIds,
              },
            },
          },
        },
        ...(resolvedFilter !== undefined ? { resolvedAt: resolvedFilter } : {}),
      },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        pullRequest: {
          include: {
            repository: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    const paginated = paginateResults(failedReviews, limit);
    return NextResponse.json(serializeWithBigInt(paginated));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Failed to list failed reviews:', error);
    return NextResponse.json({ error: 'Failed to list failed reviews' }, { status: 500 });
  }
}
