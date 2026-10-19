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
    // 2. Auth & Scope by session's installation IDs
    const installationIds = await getSessionInstallationIds();

    // 3. Cursor pagination (default: 25, max: 100)
    const { cursor, limit } = parsePaginationParams(req.url, 25, 100);

    const repositories = await prisma.repository.findMany({
      where: {
        installation: {
          githubInstallationId: {
            in: installationIds,
          },
        },
      },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        installation: true,
        _count: {
          select: { pullRequests: true },
        },
      },
      orderBy: { id: 'desc' },
    });

    const paginated = paginateResults(repositories, limit);
    return NextResponse.json(serializeWithBigInt(paginated));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Failed to fetch repositories:', error);
    return NextResponse.json({ error: 'Failed to fetch repositories' }, { status: 500 });
  }
}

