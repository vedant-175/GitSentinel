import { prisma } from '@ai-reviewer/db';
import { FALLBACK_REPOSITORIES } from './fallback-data';

export async function getRepositories() {
  try {
    const repositories = await prisma.repository.findMany({
      include: {
        installation: true,
        pullRequests: {
          include: {
            reviews: {
              select: { id: true, issues: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (repositories && repositories.length > 0) {
      return { data: repositories, isFallback: false };
    }
  } catch (err) {
    console.warn('⚠️ Database query failed (fallback to mock data):', (err as Error).message);
  }

  return { data: FALLBACK_REPOSITORIES, isFallback: true };
}

export async function getPullRequests() {
  try {
    const pullRequests = await prisma.pullRequest.findMany({
      include: {
        repository: true,
        reviews: {
          orderBy: { completedAt: 'desc' },
          include: {
            issues: true,
          },
        },
      },
      orderBy: { openedAt: 'desc' },
    });

    if (pullRequests && pullRequests.length > 0) {
      return { data: pullRequests, isFallback: false };
    }
  } catch (err) {
    console.warn('⚠️ Database query failed for PRs (fallback to mock data):', (err as Error).message);
  }

  const fallbackPRs = FALLBACK_REPOSITORIES.flatMap((r) => r.pullRequests);
  return { data: fallbackPRs, isFallback: true };
}

export async function getPullRequestById(id: number) {
  try {
    const pullRequest = await prisma.pullRequest.findUnique({
      where: { id },
      include: {
        repository: true,
        reviews: {
          orderBy: { completedAt: 'desc' },
          include: {
            issues: {
              orderBy: [{ severity: 'asc' }, { filePath: 'asc' }, { lineNumber: 'asc' }],
            },
          },
        },
      },
    });

    if (pullRequest) {
      return { data: pullRequest, isFallback: false };
    }
  } catch (err) {
    console.warn(`⚠️ Database query failed for PR #${id} (fallback to mock data):`, (err as Error).message);
  }

  const allPRs = FALLBACK_REPOSITORIES.flatMap((r) => r.pullRequests);
  const found = allPRs.find((p) => p.id === id) || allPRs[0];
  return { data: found, isFallback: true };
}

export async function getRepositoryById(id: number) {
  try {
    const repo = await prisma.repository.findUnique({
      where: { id },
      include: {
        installation: true,
        pullRequests: {
          include: {
            reviews: {
              include: {
                issues: true,
              },
              orderBy: { completedAt: 'desc' },
            },
          },
          orderBy: { openedAt: 'desc' },
        },
      },
    });

    if (repo) {
      return { data: repo, isFallback: false };
    }
  } catch (err) {
    console.warn(`⚠️ Database query failed for Repo #${id} (fallback to mock data):`, (err as Error).message);
  }

  const found = FALLBACK_REPOSITORIES.find((r) => r.id === id) || FALLBACK_REPOSITORIES[0];
  return { data: found, isFallback: true };
}
