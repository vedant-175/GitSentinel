import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import {
  requireSession,
  getSessionInstallationIds,
  getUserRoleForInstallation,
} from '@/lib/auth-helpers';
import {
  Permission,
  assertPermission,
  RbacForbiddenError,
  RepoConfigSchema,
  OrgPolicySchema,
  getKeyPool,
  maskApiKey,
  AuditAction,
} from '@ai-reviewer/shared';

const SUPPORTED_GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
] as const;
import { recordAuditLog } from '@/lib/audit';
import { reviewQueue, redisProducerConnection, ensureRedisReady } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const SettingsUpdateSchema = z.object({
  repositoryId: z.number().int().optional(),
  repoConfig: RepoConfigSchema.partial().optional(),
  orgPolicy: OrgPolicySchema.partial().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const installationIds = await getSessionInstallationIds();

    const { searchParams } = new URL(req.url);
    const repoIdParam = searchParams.get('repoId');

    // 1. Resolve Installation
    const targetGithubInstId = installationIds[0];
    const inst = targetGithubInstId
      ? await prisma.installation.findUnique({
          where: { githubInstallationId: targetGithubInstId },
          include: {
            repositories: {
              orderBy: { id: 'desc' },
              take: 20,
              select: {
                id: true,
                fullName: true,
                defaultBranch: true,
                config: true,
                organizationPolicy: true,
              },
            },
          },
        })
      : null;

    // RBAC: Check user role
    const userRole = targetGithubInstId
      ? await getUserRoleForInstallation(session, targetGithubInstId)
      : 'VIEWER';

    // 2. Resolve Selected Repository
    let selectedRepo = null;
    if (inst && inst.repositories.length > 0) {
      if (repoIdParam) {
        selectedRepo = inst.repositories.find((r) => r.id === parseInt(repoIdParam, 10)) || inst.repositories[0];
      } else {
        selectedRepo = inst.repositories[0];
      }
    }

    // 3. AI Review Engine Telemetry (Real Backend Data)
    const activeProvider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
    const groqPool = getKeyPool('groq');
    const geminiPool = getKeyPool('gemini');

    const groqKeys = groqPool.getAllKeys().map((k) => maskApiKey(k));
    const geminiKeys = geminiPool.getAllKeys().map((k) => maskApiKey(k));

    const aiEngine = {
      providerOrder: [
        {
          tier: 1,
          name: 'Groq KeyPool (Primary)',
          provider: 'groq',
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          keysCount: groqPool.size,
          activeKeys: groqPool.getActiveKeysCount(),
          maskedKeys: groqKeys,
          status: groqPool.hasKeys() ? 'healthy' : 'unconfigured',
        },
        {
          tier: 2,
          name: 'Gemini Multi-Key Fallback',
          provider: 'gemini',
          model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
          keysCount: geminiPool.size,
          activeKeys: geminiPool.getActiveKeysCount(),
          maskedKeys: geminiKeys,
          status: geminiPool.hasKeys() ? 'healthy' : 'unconfigured',
        },
        {
          tier: 3,
          name: 'Deterministic Static Analysis Gate',
          provider: 'deterministic-cyberops',
          model: 'ast-rules-engine-v1',
          keysCount: 0,
          activeKeys: 0,
          maskedKeys: [],
          status: 'healthy',
        },
      ],
      activeProvider,
      groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      supportedGeminiModels: SUPPORTED_GEMINI_MODELS,
      timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10),
      schemaMaxRetries: 2,
      keyPoolMaxAttempts: 5,
    };

    // 4. Token Budget & Usage (from Redis & DB)
    let dailyTokenBudget = {
      currentTokens: 0,
      limit: parseInt(process.env.DAILY_TOKEN_BUDGET || '500000', 10),
      allowed: true,
    };

    try {
      if (inst) {
        await ensureRedisReady();
        const dateStr = new Date().toISOString().split('T')[0];
        const raw = await redisProducerConnection.get(`token_budget:${inst.id}:${dateStr}`);
        const currentTokens = raw ? parseInt(raw, 10) : 0;
        dailyTokenBudget.currentTokens = currentTokens;
        dailyTokenBudget.allowed = currentTokens < dailyTokenBudget.limit;
      }
    } catch {
      // Redis optional fallback
    }

    // 5. Recent Failovers from FailedReview table
    const recentFailovers = await prisma.failedReview.findMany({
      orderBy: { failedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        commitSha: true,
        errorMessage: true,
        failedAt: true,
        resolvedAt: true,
      },
    });

    // 6. GitHub & Webhook Health
    const recentDeliveries = await prisma.webhookDelivery.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        deliveryId: true,
        event: true,
        action: true,
        statusCode: true,
        errorMessage: true,
        receivedAt: true,
      },
    });

    const totalDeliveries = await prisma.webhookDelivery.count();
    const successfulDeliveries = await prisma.webhookDelivery.count({
      where: { statusCode: { gte: 200, lt: 300 } },
    });
    const webhookSuccessRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 100;

    // 7. Queue & Concurrency Controls (BullMQ)
    let queueMetrics = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    };

    try {
      if (reviewQueue) {
        const counts = await reviewQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
        queueMetrics.waiting = counts.waiting || 0;
        queueMetrics.active = counts.active || 0;
        queueMetrics.completed = counts.completed || 0;
        queueMetrics.failed = counts.failed || 0;
      }
    } catch {
      // BullMQ optional
    }

    // 8. Configuration History from AuditLog
    const configHistory = await prisma.auditLog.findMany({
      where: {
        action: AuditAction.CONFIGURATION_UPDATED,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        actor: true,
        actorRole: true,
        action: true,
        resourceId: true,
        metadata: true,
        createdAt: true,
      },
    });

    // 9. Total Reviews this month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const reviewsThisMonth = await prisma.review.count({
      where: {
        startedAt: { gte: startOfMonth },
      },
    });

    return NextResponse.json(
      serializeWithBigInt({
        userRole,
        installation: inst
          ? {
              id: inst.id,
              githubInstallationId: inst.githubInstallationId,
              accountLogin: inst.accountLogin,
              accountType: inst.accountType,
              createdAt: inst.createdAt,
              repositories: inst.repositories.map((r) => ({
                id: r.id,
                fullName: r.fullName,
                defaultBranch: r.defaultBranch,
              })),
            }
          : null,
        selectedRepository: selectedRepo,
        aiEngine,
        dailyTokenBudget,
        recentFailovers,
        github: {
          appId: process.env.GITHUB_APP_ID || '123456',
          hasWebhookSecret: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
          hasPrivateKey: Boolean(process.env.GITHUB_PRIVATE_KEY),
          webhookSuccessRate: Math.round(webhookSuccessRate * 10) / 10,
          totalDeliveries,
          recentDeliveries,
          supportedEvents: ['pull_request', 'installation', 'installation_repositories'],
        },
        notifications: {
          supportedChannels: [
            { id: 'pr_comments', name: 'GitHub PR Inline Comments', status: 'ACTIVE', type: 'in_app' },
            { id: 'checks_api', name: 'GitHub Check Runs & Security Gates', status: 'ACTIVE', type: 'in_app' },
            { id: 'audit_logs', name: 'Audit Log & Telemetry Streaming', status: 'ACTIVE', type: 'in_app' },
            { id: 'slack', name: 'Slack Incoming Webhook', status: 'NOT_ATTACHED', type: 'external', note: 'Outbound notification worker required' },
            { id: 'discord', name: 'Discord Webhook', status: 'NOT_ATTACHED', type: 'external', note: 'Outbound notification worker required' },
            { id: 'email', name: 'Email Dispatcher', status: 'NOT_ATTACHED', type: 'external', note: 'Outbound notification worker required' },
          ],
        },
        runtime: {
          reviewsThisMonth,
          monthlyQuota: 500,
          queueMetrics,
          retention: {
            deliveryDedupTtlHours: 48,
            tokenBudgetTtlHours: 48,
            reviewRecordsRetention: 'Indefinite (PostgreSQL)',
          },
          configHistory,
        },
      })
    );
  } catch (error: any) {
    if (error?.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('[Settings API GET error]:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const installationIds = await getSessionInstallationIds();
    const body = await req.json();

    const parseResult = SettingsUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Validation Error', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { repositoryId, repoConfig, orgPolicy } = parseResult.data;

    if (!repositoryId) {
      return NextResponse.json({ error: 'repositoryId is required to update repository security policies' }, { status: 400 });
    }

    // 1. RBAC: User must have CONFIG_UPDATE or POLICY_UPDATE (OWNER or ADMIN)
    const targetGithubInstId = installationIds[0];
    const userRole = targetGithubInstId
      ? await getUserRoleForInstallation(session, targetGithubInstId)
      : 'VIEWER';

    assertPermission(userRole, Permission.CONFIG_UPDATE);

    // 2. Fetch repository
    const repo = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: { installation: true },
    });

    if (!repo) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    // 3. Update Repository Configuration if provided
    let updatedConfig = repo.config;
    if (repoConfig) {
      const currentConfig = (repo.config as any) || {};
      const merged = { ...currentConfig, ...repoConfig };
      const validated = RepoConfigSchema.parse(merged);

      await prisma.repository.update({
        where: { id: repo.id },
        data: { config: validated },
      });
      updatedConfig = validated;
    }

    // 4. Update Organization Policy if provided
    let updatedPolicy = repo.organizationPolicy;
    if (orgPolicy) {
      assertPermission(userRole, Permission.POLICY_UPDATE);
      const currentPolicy = (repo.organizationPolicy as any) || {};
      const mergedPolicy = { ...currentPolicy, ...orgPolicy };
      const validatedPolicy = OrgPolicySchema.parse(mergedPolicy);

      await prisma.repository.update({
        where: { id: repo.id },
        data: { organizationPolicy: validatedPolicy },
      });
      updatedPolicy = validatedPolicy;
    }

    // 5. Record Audit Log
    await recordAuditLog({
      installationId: repo.installationId,
      actor: session.user.login || session.user.id || 'anonymous',
      actorRole: userRole,
      action: AuditAction.CONFIGURATION_UPDATED,
      resourceType: 'configuration',
      resourceId: String(repo.id),
      metadata: {
        repoFullName: repo.fullName,
        updatedConfig,
        updatedPolicy,
      },
    });

    return NextResponse.json({
      success: true,
      repositoryId: repo.id,
      config: updatedConfig,
      organizationPolicy: updatedPolicy,
    });
  } catch (error: any) {
    if (error instanceof RbacForbiddenError || error?.name === 'ForbiddenError') {
      return NextResponse.json({ error: 'Forbidden', message: error.message }, { status: 403 });
    }
    if (error?.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('[Settings API PATCH error]:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
