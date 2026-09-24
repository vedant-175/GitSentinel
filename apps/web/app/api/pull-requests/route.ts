import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const repoIdParam = searchParams.get('repo_id');

    const whereClause: { repositoryId?: number } = {};
    if (repoIdParam) {
      const repoId = parseInt(repoIdParam, 10);
      if (!isNaN(repoId)) {
        whereClause.repositoryId = repoId;
      }
    }

    const pullRequests = await prisma.pullRequest.findMany({
      where: whereClause,
      include: {
        repository: true,
        reviews: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          include: {
            issues: true,
          },
        },
      },
      orderBy: { openedAt: 'desc' },
    });

    return NextResponse.json(serializeWithBigInt(pullRequests));
  } catch (error) {
    console.error('Failed to list pull requests:', error);
    return NextResponse.json({ error: 'Failed to list pull requests' }, { status: 500 });
  }
}
