import { prisma } from '@ai-reviewer/db';
import {
  getSessionInstallationIds,
  requireInstallationAccess,
  requirePullRequestAccess,
} from './auth-helpers';
import { paginateResults } from './pagination';

export interface PaginationOptions {
  cursor?: number;
  limit?: number;
}

/**
 * Fetch repositories accessible to the current user session with cursor pagination.
 * Avoids deep eager-loading of entire pullRequest -> review -> issue graphs.
 */
export async function getRepositories(options: PaginationOptions = {}) {
  const installationIds = await getSessionInstallationIds();
  const limit = Math.min(100, Math.max(1, options.limit || 100));
  const cursor = options.cursor;

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
      pullRequests: {
        select: {
          id: true,
          reviews: {
            select: {
              issues: {
                select: { id: true },
              },
            },
          },
        },
      },
    },
    orderBy: { id: 'desc' },
  });

  // Deduplicate repositories by fullName to guarantee unique cards across any installations
  const seenRepoKeys = new Set<string>();
  const uniqueRepositories = repositories.filter((repo) => {
    const key = (repo.fullName || '').toLowerCase();
    if (seenRepoKeys.has(key)) {
      return false;
    }
    seenRepoKeys.add(key);
    return true;
  });

  return paginateResults(uniqueRepositories, limit);
}

/**
 * Fetch pull requests accessible to the current user session with cursor pagination.
 * Orders deterministically by id DESC, projecting only latest review summary.
 */
export async function getPullRequests(
  options: PaginationOptions & { repoId?: number; state?: string } = {}
) {
  const installationIds = await getSessionInstallationIds();
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const cursor = options.cursor;

  const whereClause: Record<string, unknown> = {
    repository: {
      installation: {
        githubInstallationId: {
          in: installationIds,
        },
      },
    },
  };

  if (options.repoId) {
    whereClause.repositoryId = options.repoId;
  }
  if (options.state) {
    whereClause.state = options.state;
  }

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
    orderBy: { id: 'desc' },
  });

  return paginateResults(pullRequests, limit);
}

/**
 * Fetch a specific pull request with verified access
 */
export async function getPullRequestById(id: number) {
  try {
    const { pr } = await requirePullRequestAccess(id);

    const pullRequest = await prisma.pullRequest.findUnique({
      where: { id: pr.id },
      include: {
        repository: {
          include: {
            installation: true,
          },
        },
        reviews: {
          orderBy: { completedAt: 'desc' },
          include: {
            issues: true,
          },
        },
      },
    });

    if (pullRequest) {
      const SEVERITY_WEIGHT: Record<string, number> = {
        critical: 1,
        warning: 2,
        suggestion: 3,
      };

      for (const review of pullRequest.reviews) {
        review.issues.sort((a, b) => {
          const weightA = SEVERITY_WEIGHT[a.severity] || 4;
          const weightB = SEVERITY_WEIGHT[b.severity] || 4;
          if (weightA !== weightB) return weightA - weightB;
          if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
          return (a.lineNumber || 0) - (b.lineNumber || 0);
        });
      }
    }

    return { data: pullRequest };
  } catch (err) {
    console.warn(`[getPullRequestById] Database query failed for PR #${id}:`, err);
    return { data: null };
  }
}

/**
 * Fetch a specific repository with verified access
 */
export async function getRepositoryById(id: number) {
  try {
    const { repo } = await requireInstallationAccess(id);

    const repository = await prisma.repository.findUnique({
      where: { id: repo.id },
      include: {
        installation: true,
        pullRequests: {
          take: 25,
          include: {
            reviews: {
              take: 1,
              include: {
                issues: true,
              },
              orderBy: { completedAt: 'desc' },
            },
          },
          orderBy: { id: 'desc' },
        },
      },
    });

    return { data: repository };
  } catch (err) {
    console.warn(`[getRepositoryById] Database query failed for repo #${id}:`, err);
    return { data: null };
  }
}

/**
 * Fetch failed reviews accessible to the current user session with cursor pagination.
 */
export async function getFailedReviews(
  options: PaginationOptions & { resolved?: boolean } = {}
) {
  const installationIds = await getSessionInstallationIds();
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const cursor = options.cursor;

  const whereClause: Record<string, unknown> = {
    pullRequest: {
      repository: {
        installation: {
          githubInstallationId: {
            in: installationIds,
          },
        },
      },
    },
  };

  if (options.resolved !== undefined) {
    whereClause.resolvedAt = options.resolved ? { not: null } : null;
  }

  const failedReviews = await prisma.failedReview.findMany({
    where: whereClause,
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

  return paginateResults(failedReviews, limit);
}

