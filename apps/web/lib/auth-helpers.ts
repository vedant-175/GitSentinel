import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { prisma } from '@ai-reviewer/db';
import {
  Role,
  RoleType,
  PermissionType,
  assertPermission,
  normalizeRole,
} from '@ai-reviewer/shared';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * In-memory cache for user accessible installation IDs, refreshed at a fixed interval.
 * Item 6: Refresh installation access at a fixed interval instead of trusting a stale JWT.
 */
interface CachedInstallations {
  installationIds: bigint[];
  cachedAt: number;
}

const installationAccessCache = new Map<string, CachedInstallations>();

export const DEFAULT_INSTALLATION_REFRESH_INTERVAL_MS = 60 * 1000; // 60s fixed interval

export function clearInstallationAccessCache(userKey?: string) {
  if (userKey) {
    installationAccessCache.delete(userKey);
  } else {
    installationAccessCache.clear();
  }
}

let sessionOverride: (() => Promise<any>) | null = null;
let sessionInstallationIdsOverride: (() => Promise<bigint[]>) | null = null;
let roleOverride: ((userLogin: string, installationId: number | bigint) => Promise<RoleType> | RoleType) | null = null;

export function setSessionOverride(fn: (() => Promise<any>) | null) {
  sessionOverride = fn;
}

export function setSessionInstallationIdsOverride(fn: (() => Promise<bigint[]>) | null) {
  sessionInstallationIdsOverride = fn;
}

export function setRoleOverride(fn: ((userLogin: string, installationId: number | bigint) => Promise<RoleType> | RoleType) | null) {
  roleOverride = fn;
}

/**
 * Ensures user has an active session, or throws UnauthorizedError
 */
export async function requireSession() {
  if (sessionOverride) {
    const session = await sessionOverride();
    if (!session || !session.user) {
      throw new UnauthorizedError('Authentication required');
    }
    return session;
  }
  if (sessionInstallationIdsOverride) {
    return {
      user: {
        id: 'test-user-id',
        login: 'test-admin',
      },
      installationIds: [],
    };
  }
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return session;
}

/**
 * Resolves user installation access and caches it for a fixed interval.
 * Item 5 & 6: Installations come ONLY from GitHub App installation webhooks in our database;
 * the user-to-server token's /user/installations is used just to decide which of them the user may see.
 * Refreshes at a fixed interval instead of trusting a stale JWT.
 */
export async function resolveUserInstallations(
  session: {
    accessToken?: string;
    installationIds?: number[];
    user: { id?: string; login?: string };
  },
  refreshIntervalMs = DEFAULT_INSTALLATION_REFRESH_INTERVAL_MS,
  fetchFn: typeof fetch = fetch
): Promise<bigint[]> {
  const userKey = session.user.id || session.user.login || 'anonymous';

  const cached = installationAccessCache.get(userKey);
  const now = Date.now();

  // If cache is fresh within the fixed interval, return cached IDs
  if (cached && now - cached.cachedAt < refreshIntervalMs) {
    return cached.installationIds;
  }

  let accessibleIds: bigint[] = [];

  if (session.accessToken) {
    try {
      const res = await fetchFn('https://api.github.com/user/installations', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'ai-reviewer-app',
        },
      });

      if (res.ok) {
        const data = (await res.json()) as { installations?: Array<{ id: number }> };
        const userGithubInstallationIds = (data.installations || []).map((inst) => BigInt(inst.id));

        // Installations come ONLY from GitHub App installation webhooks in our DB.
        // User-to-server token is used JUST to decide which of them the user may see.
        if (userGithubInstallationIds.length > 0) {
          const dbInstallations = await prisma.installation.findMany({
            where: {
              githubInstallationId: {
                in: userGithubInstallationIds,
              },
            },
            select: { githubInstallationId: true },
          });
          accessibleIds = dbInstallations.map((i) => i.githubInstallationId);
        } else {
          accessibleIds = [];
        }
      } else {
        console.warn(`GitHub /user/installations returned status ${res.status}`);
        if (cached) return cached.installationIds;
      }
    } catch (err) {
      console.warn('Failed to fetch user installations from GitHub API:', err);
      if (cached) return cached.installationIds;
    }
  } else if (session.installationIds && session.installationIds.length > 0) {
    // For local dev login session: verify against existing database installations
    const sessionIds = session.installationIds.map((id) => BigInt(id));
    const dbInstallations = await prisma.installation.findMany({
      where: {
        githubInstallationId: {
          in: sessionIds,
        },
      },
      select: { githubInstallationId: true },
    });
    accessibleIds = dbInstallations.map((i) => i.githubInstallationId);
  } else if (session.user.login) {
    // Local dev mode fallback by login: only match existing installations from DB
    const dbInstallations = await prisma.installation.findMany({
      where: {
        accountLogin: {
          equals: session.user.login,
          mode: 'insensitive',
        },
      },
      select: { githubInstallationId: true },
    });

    if (dbInstallations.length === 0) {
      try {
        const { syncUserRepositories } = await import('./github-sync');
        await syncUserRepositories(session.user.login);
        const refreshed = await prisma.installation.findMany({
          where: {
            accountLogin: {
              equals: session.user.login,
              mode: 'insensitive',
            },
          },
          select: { githubInstallationId: true },
        });
        accessibleIds = refreshed.map((i) => i.githubInstallationId);
      } catch (syncErr) {
        console.warn('Failed auto-sync in resolveUserInstallations:', syncErr);
        accessibleIds = [];
      }
    } else {
      accessibleIds = dbInstallations.map((i) => i.githubInstallationId);
    }
  }

  // Update fixed-interval cache
  installationAccessCache.set(userKey, {
    installationIds: accessibleIds,
    cachedAt: now,
  });

  return accessibleIds;
}

/**
 * Gets accessible GitHub installation IDs for the current session as BigInts.
 */
export async function getSessionInstallationIds(
  refreshIntervalMs = DEFAULT_INSTALLATION_REFRESH_INTERVAL_MS
): Promise<bigint[]> {
  if (sessionInstallationIdsOverride) {
    return sessionInstallationIdsOverride();
  }
  const session = await requireSession();
  return resolveUserInstallations(
    {
      accessToken: session.accessToken,
      installationIds: session.installationIds,
      user: {
        id: session.user.id,
        login: session.user.login,
      },
    },
    refreshIntervalMs
  );
}

/**
 * Asserts that a repository belongs to a specific installation.
 * Item 5: Enforces unique (installation_id, repo_id) tenancy invariant.
 */
export async function assertRepoBelongsToInstallation(
  installationId: number | bigint,
  repoId: number
) {
  const repo = await prisma.repository.findFirst({
    where: {
      id: repoId,
      installation: {
        OR: [
          { id: typeof installationId === 'bigint' ? Number(installationId) : installationId },
          { githubInstallationId: BigInt(installationId) },
        ],
      },
    },
    select: { id: true, installationId: true, githubRepoId: true },
  });

  if (!repo) {
    throw new ForbiddenError(
      `Repository #${repoId} does not belong to installation #${installationId}`
    );
  }

  return repo;
}

/**
 * Validates that the specified installation IDs have access to the repository.
 * Throws ForbiddenError if access is not permitted.
 */
export async function assertInstallationAccess(repoId: number, installationIds: bigint[]) {
  if (installationIds.length === 0) {
    throw new ForbiddenError(`No accessible installations in current session.`);
  }

  const repo = await prisma.repository.findFirst({
    where: {
      id: repoId,
      installation: {
        githubInstallationId: {
          in: installationIds,
        },
      },
    },
    include: {
      installation: true,
    },
  });

  if (!repo) {
    throw new ForbiddenError(`Access denied to repository #${repoId} or repository does not exist.`);
  }

  return repo;
}

/**
 * Validates that the current user has access to the specified repository.
 * Throws ForbiddenError if user does not have access.
 */
export async function requireInstallationAccess(repoId: number) {
  const session = await requireSession();
  const installationIds = await getSessionInstallationIds();
  const repo = await assertInstallationAccess(repoId, installationIds);
  return { repo, session };
}

/**
 * Validates that the specified installation IDs have access to the pull request.
 * Throws ForbiddenError if access is not permitted.
 */
export async function assertPullRequestAccess(prId: number, installationIds: bigint[]) {
  if (installationIds.length === 0) {
    throw new ForbiddenError(`No accessible installations in current session.`);
  }

  const pr = await prisma.pullRequest.findFirst({
    where: {
      id: prId,
      repository: {
        installation: {
          githubInstallationId: {
            in: installationIds,
          },
        },
      },
    },
    include: {
      repository: {
        include: {
          installation: true,
        },
      },
    },
  });

  if (!pr) {
    throw new ForbiddenError(`Access denied to pull request #${prId} or PR does not exist.`);
  }

  return pr;
}

/**
 * Validates that the current user has access to the specified pull request.
 * Throws ForbiddenError if user does not have access.
 */
export async function requirePullRequestAccess(prId: number) {
  const session = await requireSession();
  const installationIds = await getSessionInstallationIds();
  const pr = await assertPullRequestAccess(prId, installationIds);
  return { pr, session };
}

/**
 * Validates that the specified installation IDs have access to the review.
 * Throws ForbiddenError if access is not permitted.
 */
export async function assertReviewAccess(reviewId: number, installationIds: bigint[]) {
  if (installationIds.length === 0) {
    throw new ForbiddenError(`No accessible installations in current session.`);
  }

  const review = await prisma.review.findFirst({
    where: {
      id: reviewId,
      pullRequest: {
        repository: {
          installation: {
            githubInstallationId: {
              in: installationIds,
            },
          },
        },
      },
    },
    include: {
      pullRequest: {
        include: {
          repository: true,
        },
      },
    },
  });

  if (!review) {
    throw new ForbiddenError(`Access denied to review #${reviewId} or review does not exist.`);
  }

  return review;
}

/**
 * Validates that the current user has access to the specified review.
 * Throws ForbiddenError if user does not have access.
 */
export async function requireReviewAccess(reviewId: number) {
  const session = await requireSession();
  const installationIds = await getSessionInstallationIds();
  const review = await assertReviewAccess(reviewId, installationIds);
  return { review, session };
}

/**
 * Resolves the effective RBAC role for the current user within a specific installation.
 * - If user login matches installation accountLogin -> Role.OWNER
 * - If explicit InstallationMember record exists -> record.role
 * - Otherwise defaults to Role.VIEWER (or Role.REVIEWER if user has member access)
 */
export async function getUserRoleForInstallation(
  session: { user: { login?: string; name?: string; id?: string } },
  installationId: number | bigint
): Promise<RoleType> {
  const userLogin = (
    session?.user?.login ||
    (session?.user as any)?.name ||
    (session?.user as any)?.id ||
    ''
  )
    .trim()
    .toLowerCase();

  if (roleOverride) {
    return roleOverride(userLogin || 'user', installationId);
  }

  // Find target installation
  const inst = await prisma.installation.findFirst({
    where: {
      OR: [
        { id: typeof installationId === 'bigint' ? Number(installationId) : installationId },
        { githubInstallationId: BigInt(installationId) },
      ],
    },
    include: {
      members: {
        where: {
          userLogin: {
            equals: userLogin,
            mode: 'insensitive',
          },
        },
      },
    },
  });

  if (!inst) {
    return Role.VIEWER;
  }

  // Account login is naturally the organization/user installation owner
  if (userLogin && inst.accountLogin.toLowerCase() === userLogin) {
    return Role.OWNER;
  }

  // Check explicit member record
  if (userLogin && inst.members && inst.members.length > 0) {
    return normalizeRole(inst.members[0].role);
  }

  // Default for authorized members without explicit custom assignment is REVIEWER
  return Role.REVIEWER;
}

/**
 * Enforces that the current session user has a specific RBAC permission for an installation.
 */
export async function requirePermissionForInstallation(
  installationId: number | bigint,
  permission: PermissionType
) {
  const session = await requireSession();
  const role = await getUserRoleForInstallation(session, installationId);
  assertPermission(role, permission);
  return { session, role, installationId };
}

/**
 * Enforces that the current session user has a specific RBAC permission for a repository.
 */
export async function requirePermissionForRepo(
  repoId: number,
  permission: PermissionType
) {
  const { repo, session } = await requireInstallationAccess(repoId);
  const role = await getUserRoleForInstallation(session, repo.installationId);
  assertPermission(role, permission);
  return { repo, session, role };
}

/**
 * Enforces that the current session user has a specific RBAC permission for a review.
 */
export async function requirePermissionForReview(
  reviewId: number,
  permission: PermissionType
) {
  const { review, session } = await requireReviewAccess(reviewId);
  const installationId = review.pullRequest.repository.installationId;
  const role = await getUserRoleForInstallation(session, installationId);
  assertPermission(role, permission);
  return { review, session, role };
}


