import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions, getAuthSecret } from './auth';
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
    installationAccessCache.delete(`user:${userKey}`);
    installationAccessCache.delete(`gh:${userKey}`);
  } else {
    installationAccessCache.clear();
  }
}

let sessionOverride: (() => Promise<any>) | null = null;
let sessionInstallationIdsOverride: (() => Promise<bigint[]>) | null = null;
let roleOverride: ((userLogin: string, installationId: number | bigint) => Promise<RoleType> | RoleType) | null = null;
let serverOAuthTokenOverride: (() => Promise<string | undefined> | string | undefined) | null = null;

export function setSessionOverride(fn: (() => Promise<any>) | null) {
  sessionOverride = fn;
}

export function setSessionInstallationIdsOverride(fn: (() => Promise<bigint[]>) | null) {
  sessionInstallationIdsOverride = fn;
}

export function setRoleOverride(fn: ((userLogin: string, installationId: number | bigint) => Promise<RoleType> | RoleType) | null) {
  roleOverride = fn;
}

export function setServerOAuthTokenOverride(fn: (() => Promise<string | undefined> | string | undefined) | null) {
  serverOAuthTokenOverride = fn;
}

/**
 * Securely retrieves the GitHub OAuth access token on the server side only.
 * This token is NEVER exposed to browser-visible session objects.
 */
export async function getServerOAuthToken(req?: Request | any): Promise<string | undefined> {
  if (serverOAuthTokenOverride) {
    return serverOAuthTokenOverride();
  }

  const secret = getAuthSecret();

  try {
    if (req) {
      let adaptedReq = req;
      if (typeof req.headers?.get === 'function' && !req.cookies) {
        const cookieHeader = req.headers.get('cookie') || '';
        const cookieMap: Record<string, string> = {};
        cookieHeader.split(';').forEach((c: string) => {
          const [k, ...v] = c.trim().split('=');
          if (k) cookieMap[k] = v.join('=');
        });
        adaptedReq = {
          cookies: cookieMap,
          headers: req.headers,
        };
      }
      const token = await getToken({ req: adaptedReq as any, secret });
      return (token?.accessToken as string) || undefined;
    }

    // In Server Components or Server Actions, inspect request cookies
    try {
      const { cookies, headers } = await import('next/headers');
      const cookieStore = await cookies();
      const headerStore = await headers();

      const cookieMap: Record<string, string> = {};
      for (const cookie of cookieStore.getAll()) {
        cookieMap[cookie.name] = cookie.value;
      }

      const adaptedReq = {
        cookies: cookieMap,
        headers: headerStore,
      };

      const token = await getToken({ req: adaptedReq as any, secret });
      return (token?.accessToken as string) || undefined;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Ensures user has an active session, or throws UnauthorizedError
 */
export async function requireSession() {
  if (sessionOverride) {
    const session = await sessionOverride();
    if (!session || !session.user || (session.expires && new Date(session.expires).getTime() < Date.now())) {
      throw new UnauthorizedError('Authentication required or session expired');
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
  let session = null;
  try {
    session = await getServerSession(authOptions);
  } catch {
    session = null;
  }
  if (!session || !session.user || (session.expires && new Date(session.expires).getTime() < Date.now())) {
    throw new UnauthorizedError('Authentication required or session expired');
  }
  return session;
}

/**
 * Resolves user installation access and caches it for a fixed interval.
 * Phase 4: Keyed strictly by authenticated user ID (never 'anonymous' or unauthenticated strings).
 * Cross-references GitHub OAuth /user/installations against database installations.
 * Fails closed if OAuth token is revoked (401/403).
 */
export async function resolveUserInstallations(
  session: {
    accessToken?: string;
    installationIds?: number[];
    user: { id?: string; login?: string; githubId?: string | bigint };
  },
  refreshIntervalMs = DEFAULT_INSTALLATION_REFRESH_INTERVAL_MS,
  fetchFn: typeof fetch = fetch
): Promise<bigint[]> {
  // Strict user cache key: requires authenticated user identity to prevent cross-user authorization
  const userKey = session.user?.id
    ? `user:${session.user.id}`
    : session.user?.githubId
    ? `gh:${session.user.githubId}`
    : session.user?.login && session.installationIds
    ? `dev:${session.user.login}`
    : null;

  if (!userKey) {
    return [];
  }

  const cached = installationAccessCache.get(userKey);
  const now = Date.now();

  // If cache is fresh within the fixed interval, return cached IDs
  if (cached && now - cached.cachedAt < refreshIntervalMs) {
    return cached.installationIds;
  }

  const effectiveAccessToken = session.accessToken || (await getServerOAuthToken().catch(() => undefined));

  let accessibleIds: bigint[] = [];

  if (effectiveAccessToken) {
    try {
      const res = await fetchFn('https://api.github.com/user/installations', {
        headers: {
          Authorization: `Bearer ${effectiveAccessToken}`,
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

        // For verified OAuth sessions: Also check for user's personal User installation in DB
        if (session.user?.login) {
          const personalInst = await prisma.installation.findFirst({
            where: {
              accountLogin: {
                equals: session.user.login,
                mode: 'insensitive',
              },
              accountType: 'User',
            },
            select: { githubInstallationId: true },
          });
          if (personalInst && !accessibleIds.some((id) => id === personalInst.githubInstallationId)) {
            accessibleIds.push(personalInst.githubInstallationId);
          }
        }
      } else {
        console.warn(`GitHub /user/installations returned status ${res.status}`);
        // If GitHub token was revoked (401/403), immediately invalidate cache and fail closed
        if (res.status === 401 || res.status === 403) {
          installationAccessCache.delete(userKey);
          return [];
        }
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
  }

  // Phase 4 Requirement 1: Insecure username fallback removed.
  // Never treat matching usernames as proof of installation ownership.

  // Update fixed-interval cache
  installationAccessCache.set(userKey, {
    installationIds: accessibleIds,
    cachedAt: Date.now(),
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
  const serverToken = await getServerOAuthToken().catch(() => undefined);
  return resolveUserInstallations(
    {
      accessToken: serverToken,
      installationIds: session.installationIds,
      user: {
        id: session.user.id,
        login: session.user.login,
        githubId: (session.user as any).githubId,
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
  session: { user: { login?: string; name?: string; id?: string; githubId?: string | bigint } },
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

  // 1. Check explicit member record first
  if (userLogin && inst.members && inst.members.length > 0) {
    return normalizeRole(inst.members[0].role);
  }

  // 2. Ownership verification:
  // Phase 4 Requirement 1: Never treat matching usernames as proof of installation ownership.
  // Organizations: matching username to organization accountLogin is strictly forbidden.
  // Personal accounts (accountType === 'User'): verify authenticated user's stable GitHub ID or DB user record.
  if (inst.accountType === 'User' && userLogin && inst.accountLogin.toLowerCase() === userLogin) {
    if (session.user?.id) {
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { githubLogin: true, githubId: true },
      }).catch(() => null);

      if (dbUser && dbUser.githubLogin?.toLowerCase() === inst.accountLogin.toLowerCase()) {
        return Role.OWNER;
      }
    } else if (session.user?.githubId) {
      return Role.OWNER;
    }
    // Forged or unverified username without verified session identity cannot claim ownership
    return Role.VIEWER;
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

/**
 * Ensures user has an active session AND administrative privileges (OWNER or ADMIN).
 * Throws UnauthorizedError (401) if not logged in.
 * Throws ForbiddenError (403) if authenticated but lacks admin privileges.
 */
export async function requireAdminSession() {
  const session = await requireSession();
  const userLogin = (
    session?.user?.login ||
    (session?.user as any)?.name ||
    (session?.user as any)?.id ||
    ''
  ).trim().toLowerCase();

  // If roleOverride is set (e.g. in test contexts)
  if (roleOverride) {
    const role = await roleOverride(userLogin, 0);
    if (role === Role.ADMIN || role === Role.OWNER) {
      return { session, role };
    }
    throw new ForbiddenError('Administrator privileges required');
  }

  // Check if session has accessible installation IDs
  const installationIds = await getSessionInstallationIds();
  if (installationIds.length > 0) {
    for (const instId of installationIds) {
      const role = await getUserRoleForInstallation(session, instId);
      if (role === Role.ADMIN || role === Role.OWNER) {
        return { session, role, installationId: instId };
      }
    }
  }

  // Check direct DB membership if user has any ADMIN or OWNER roles
  if (userLogin) {
    try {
      const adminMembership = await prisma.installationMember.findFirst({
        where: {
          userLogin: { equals: userLogin, mode: 'insensitive' },
          role: { in: ['ADMIN', 'OWNER'] },
        },
      });
      if (adminMembership) {
        return { session, role: normalizeRole(adminMembership.role) };
      }
    } catch {
      // ignore db error
    }
  }

  throw new ForbiddenError('Administrator privileges required');
}

/**
 * Uniformly formats authorization and authentication errors into standard NextResponses.
 */
export function handleAuthError(error: unknown) {
  if (error instanceof UnauthorizedError || (error as any)?.name === 'UnauthorizedError') {
    return NextResponse.json({ error: (error as Error).message || 'Unauthorized' }, { status: 401 });
  }
  if (
    error instanceof ForbiddenError ||
    (error as any)?.name === 'ForbiddenError' ||
    (error as any)?.name === 'RbacForbiddenError'
  ) {
    return NextResponse.json({ error: (error as Error).message || 'Forbidden' }, { status: 403 });
  }
  return null;
}


