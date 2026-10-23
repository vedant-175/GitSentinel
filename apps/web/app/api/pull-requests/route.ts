import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import {
  requireSession,
  getSessionInstallationIds,
  requireInstallationAccess,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/auth-helpers';
import { checkApiRateLimit } from '@/lib/rate-limit';
import { parsePaginationParams, paginateResults } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    // 1. Rate limiting
    const rateLimitResponse = await checkApiRateLimit(req);
    if (rateLimitResponse) return rateLimitResponse;
    const { searchParams } = new URL(req.url);
    const repoIdParam = searchParams.get('repo_id');
    const stateParam = searchParams.get('state');

    // 2. Cursor pagination (default: 25, max: 100)
    const { cursor, limit } = parsePaginationParams(req.url, 25, 100);

    let whereClause: Record<string, unknown> = {};

    if (repoIdParam) {
      const repoId = parseInt(repoIdParam, 10);
      if (isNaN(repoId)) {
        return NextResponse.json({ error: 'Invalid repo_id' }, { status: 400 });
      }
      // Verify access to specific repository
      await requireInstallationAccess(repoId);
      whereClause = { repositoryId: repoId };
    } else {
      // Scope by user's installation IDs
      const installationIds = await getSessionInstallationIds();
      whereClause = {
        repository: {
          installation: {
            githubInstallationId: {
              in: installationIds,
            },
          },
        },
      };
    }

    if (stateParam) {
      whereClause.state = stateParam;
    }

    // 3. Stable deterministic ordering with cursor pagination
    const pullRequests = await prisma.pullRequest.findMany({
      where: whereClause,
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        repository: true,
        reviews: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          include: {
            issues: {
              select: {
                id: true,
                severity: true,
                category: true,
                message: true,
                filePath: true,
                lineNumber: true,
              },
            },
          },
        },
      },
      orderBy: cursor
        ? { id: 'desc' }
        : [{ openedAt: 'desc' }, { githubPrNumber: 'desc' }, { id: 'desc' }],
    });

    const paginated = paginateResults(pullRequests, limit);
    return NextResponse.json(serializeWithBigInt(paginated));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Failed to list pull requests:', error);
    return NextResponse.json({ error: 'Failed to list pull requests' }, { status: 500 });
  }
}

