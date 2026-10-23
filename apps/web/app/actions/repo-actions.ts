'use server';

import { prisma } from '@ai-reviewer/db';
import {
  RepoConfig,
  RepoConfigSchema,
  OrgPolicy,
  OrgPolicySchema,
  Permission,
  AuditAction,
} from '@ai-reviewer/shared';
import { revalidatePath } from 'next/cache';
import { requirePermissionForRepo, requireSession, getServerOAuthToken } from '@/lib/auth-helpers';
import { setCachedRepoConfig } from '@/lib/queue';
import { checkConfigMutationRateLimit } from '@/lib/rate-limit';
import { recordAuditLog } from '@/lib/audit';

export async function updateRepoConfig(repoId: number, newConfig: RepoConfig) {
  try {
    // 1. Enforce RBAC permission: CONFIG_UPDATE (OWNER or ADMIN only)
    const { repo, session, role } = await requirePermissionForRepo(repoId, Permission.CONFIG_UPDATE);

    // 2. Rate limiting (30 mutations per minute)
    const rateCheck = await checkConfigMutationRateLimit(String(repoId));
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded: maximum 30 configuration updates per minute. Please retry after ${rateCheck.retryAfter}s.`,
      };
    }

    // 3. Validate config with Zod schema
    const validatedConfig = RepoConfigSchema.parse(newConfig);

    // 4. Update database scoped by repository
    await prisma.repository.update({
      where: { id: repo.id },
      data: {
        config: validatedConfig,
      },
    });

    // 4. Update cached configuration in Redis
    if (repo.githubRepoId) {
      await setCachedRepoConfig(Number(repo.githubRepoId), validatedConfig);
    }

    // 5. Record Audit Log
    await recordAuditLog({
      installationId: repo.installationId,
      actor: session.user.login || session.user.id || 'anonymous',
      actorRole: role,
      action: AuditAction.CONFIGURATION_UPDATED,
      resourceType: 'configuration',
      resourceId: String(repo.id),
      metadata: {
        scope: 'repo_config',
        repoFullName: repo.fullName,
        config: validatedConfig,
      },
    });

    try {
      revalidatePath('/repositories');
      revalidatePath(`/repositories/${repoId}`);
    } catch {
      // ignored outside Next request context (e.g. test runner)
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to update repository configuration:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function updateOrgPolicy(repoId: number, newPolicy: OrgPolicy) {
  try {
    const { repo, session, role } = await requirePermissionForRepo(repoId, Permission.POLICY_UPDATE);

    const validatedPolicy = OrgPolicySchema.parse(newPolicy);

    await prisma.repository.update({
      where: { id: repo.id },
      data: {
        organizationPolicy: validatedPolicy,
      },
    });

    await recordAuditLog({
      installationId: repo.installationId,
      actor: session.user.login || session.user.id || 'anonymous',
      actorRole: role,
      action: AuditAction.CONFIGURATION_UPDATED,
      resourceType: 'configuration',
      resourceId: String(repo.id),
      metadata: {
        scope: 'organization_policy',
        repoFullName: repo.fullName,
        policy: validatedPolicy,
      },
    });

    try {
      revalidatePath('/repositories');
      revalidatePath(`/repositories/${repoId}`);
    } catch {
      // ignored outside Next request context
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to update organization policy:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function disconnectRepository(repoId: number) {
  try {
    // Strictly OWNER only
    const { repo, session, role } = await requirePermissionForRepo(repoId, Permission.REPOSITORY_DISCONNECT);

    await prisma.repository.delete({
      where: { id: repo.id },
    });

    await recordAuditLog({
      installationId: repo.installationId,
      actor: session.user.login || session.user.id || 'anonymous',
      actorRole: role,
      action: AuditAction.REPOSITORY_DISCONNECTED,
      resourceType: 'repository',
      resourceId: String(repo.id),
      metadata: {
        repoFullName: repo.fullName,
      },
    });

    try {
      revalidatePath('/repositories');
    } catch {
      // ignored outside Next request context
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to disconnect repository:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function syncUserReposAction(targetUsername?: string) {
  try {
    let username = targetUsername?.trim();
    let accessToken: string | undefined;

    try {
      const session = await requireSession();
      if (!username) {
        username = session?.user?.login;
      }
      accessToken = await getServerOAuthToken().catch(() => undefined);
    } catch {
      // In unauthenticated context, proceed with targetUsername
    }

    if (!username) {
      return { success: false, error: 'No GitHub username provided or found in session' };
    }

    const { syncUserRepositories } = await import('@/lib/github-sync');
    const result = await syncUserRepositories(username, accessToken);

    try {
      revalidatePath('/');
      revalidatePath('/repositories');
      revalidatePath('/pull-requests');
    } catch {
      // ignored outside Next request context
    }

    return result;
  } catch (error) {
    console.error('Failed to sync repositories:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function analyseRepositoryAction(repoId: number, repoFullName?: string) {
  try {
    let userLogin = '';
    let accessToken: string | undefined;
    try {
      const session = await requireSession();
      userLogin = session?.user?.login || (session?.user as any)?.name || '';
      accessToken = await getServerOAuthToken().catch(() => undefined);
    } catch {
      // In development mode or unauthenticated preview, gracefully proceed
    }

    let repo: any = null;
    try {
      repo = await prisma.repository.findUnique({
        where: { id: repoId },
        include: {
          installation: true,
          pullRequests: {
            orderBy: { id: 'desc' },
            take: 5,
            include: { reviews: true },
          },
        },
      });
    } catch (dbErr) {
      console.warn('[analyseRepositoryAction] Database query failed, continuing with fallback:', dbErr);
    }

    if (repo && repo.installation?.githubInstallationId) {
      const { getSessionInstallationIds } = await import('@/lib/auth-helpers');
      const installationIds = await getSessionInstallationIds().catch(() => []);
      const hasAccess = installationIds.some((id) => BigInt(id) === BigInt(repo.installation.githubInstallationId));
      if (!hasAccess) {
        return { success: false, error: 'Forbidden: Access denied to repository' };
      }
    }

    const REPO_NAME_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

    if (!repo) {
      const session = await requireSession().catch(() => null);
      if (!session) {
        return { success: false, error: 'Unauthorized: Authentication required to analyze repository' };
      }

      // Resolve repository full name
      let resolvedFullName = repoFullName;
      if (!resolvedFullName && userLogin) {
        try {
          const { syncUserRepositories } = await import('@/lib/github-sync');
          const syncRes = await syncUserRepositories(userLogin, accessToken);
          const matched = syncRes.repos?.find((r: any) => r.id === repoId || String(r.id) === String(repoId));
          if (matched) {
            resolvedFullName = matched.fullName;
          }
        } catch {
          // ignore
        }
      }

      if (!resolvedFullName || !REPO_NAME_REGEX.test(resolvedFullName)) {
        return { success: false, error: `Repository #${repoId} not found or invalid format` };
      }

      repo = {
        id: repoId,
        fullName: resolvedFullName,
        defaultBranch: 'main',
        installation: { accountLogin: userLogin || resolvedFullName.split('/')[0] },
        pullRequests: [],
      };
    }

    // Check if repository already has PRs or create a security scan session
    let targetPr = repo.pullRequests?.[0];
    if (!targetPr) {
      try {
        targetPr = await (prisma.pullRequest as any).create({
          data: {
            repositoryId: repo.id,
            githubPrNumber: Math.floor(Date.now() % 100000) || 1,
            title: `Autonomous Security & Code Analysis (${repo.defaultBranch || 'main'})`,
            author: repo.installation?.accountLogin || userLogin,
            state: 'open',
            headSha: 'head-' + Date.now().toString(16),
          },
          include: { reviews: true },
        });
      } catch {
        targetPr = {
          id: Math.abs(repo.id * 100 + 1),
          repositoryId: repo.id,
          githubPrNumber: 1,
          title: `Autonomous Security & Code Analysis (${repo.defaultBranch || 'main'})`,
          author: repo.installation?.accountLogin || userLogin,
          state: 'open',
          headSha: 'head-' + Date.now().toString(16),
          reviews: [],
        };
      }
    }

    // Run deep analysis
    const { analyseRepositoryCode } = await import('@/lib/repo-analyzer');
    const review = await analyseRepositoryCode(repo, targetPr);

    try {
      revalidatePath('/repositories');
      revalidatePath(`/repositories/${repo.id}`);
      revalidatePath('/pull-requests');
      revalidatePath(`/pull-requests/${targetPr.id}`);
    } catch {
      // ignored outside Next request context
    }

    return {
      success: true,
      repoId: repo.id,
      prId: targetPr.id,
      reviewId: review.id,
      issuesCount: (review as any).issues?.length ?? 0,
    };
  } catch (error) {
    console.error('Failed to analyze repository:', error);
    return { success: false, error: (error as Error).message };
  }
}

