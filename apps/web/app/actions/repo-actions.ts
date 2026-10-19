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
import { requirePermissionForRepo, requireSession } from '@/lib/auth-helpers';
import { setCachedRepoConfig } from '@/lib/queue';
import { checkConfigMutationRateLimit } from '@/lib/rate-limit';
import { recordAuditLog } from '@/lib/audit';

export async function updateRepoConfig(repoId: number, newConfig: RepoConfig) {
  try {
    // 0. Rate limiting (30 mutations per minute)
    const rateCheck = await checkConfigMutationRateLimit(String(repoId));
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded: maximum 30 configuration updates per minute. Please retry after ${rateCheck.retryAfter}s.`,
      };
    }

    // 1. Enforce RBAC permission: CONFIG_UPDATE (OWNER or ADMIN only)
    const { repo, session, role } = await requirePermissionForRepo(repoId, Permission.CONFIG_UPDATE);

    // 2. Validate config with Zod schema
    const validatedConfig = RepoConfigSchema.parse(newConfig);

    // 3. Update database scoped by repository
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
    if (!username) {
      const session = await requireSession();
      username = session?.user?.login;
    }
    if (!username) {
      return { success: false, error: 'No GitHub username provided or found in session' };
    }

    const { syncUserRepositories } = await import('@/lib/github-sync');
    const result = await syncUserRepositories(username);

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

export async function analyseRepositoryAction(repoId: number) {
  try {
    let userLogin = 'developer';
    try {
      const session = await requireSession();
      userLogin = session?.user?.login || 'developer';
    } catch {
      // In development mode or unauthenticated preview, gracefully proceed
    }

    const repo = await prisma.repository.findUnique({
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

    if (!repo) {
      return { success: false, error: 'Repository not found' };
    }

    // Check if repository already has PRs or create a security scan session
    let targetPr = repo.pullRequests[0];
    if (!targetPr) {
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

