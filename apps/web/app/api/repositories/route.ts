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

    // 3. Cursor pagination (default: 100, max: 500)
    const { cursor, limit } = parsePaginationParams(req.url, 100, 500);

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

    const filteredRepositories = repositories.filter((repo) => {
      if (repo.installation?.accountLogin) {
        const [repoOwner] = (repo.fullName || '').toLowerCase().split('/');
        if (repoOwner && repoOwner !== repo.installation.accountLogin.toLowerCase()) {
          return false;
        }
      }
      return true;
    });

    const paginated = paginateResults(filteredRepositories, limit);
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

