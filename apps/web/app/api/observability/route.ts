import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import {
  ReviewLifecycleStage,
  REVIEW_LIFECYCLE_STAGES,
  ReviewLifecycleTrace,
  ObservabilityErrorCategory,
} from '@ai-reviewer/shared';
import { reviewQueue, redisProducerConnection, ensureRedisReady } from '@/lib/queue';

export const dynamic = 'force-dynamic';

interface ObservabilityResponse {
  timestamp: string;
  workerStatus: 'online' | 'degraded' | 'offline';
  queueDepth: {
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
  };
  workerHealth: {
    uptimeSeconds: number;
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
      externalMb: number;
    };
  };
  staleJobs: {
    detectedTotal: number;
    reapedTotal: number;
    lastReapTimestamp: string | null;
    stuckReviewsActive: number;
  };
  llmMetrics: {
    latency: {
      avg: number;
      p50: number;
      p95: number;
      last: number;
      count: number;
    };
    tokensConsumedTotal: number;
    tokenUsage: {
      prompt: number;
      completion: number;
      total: number;
    };
    estimatedCostUsd: number;
    llmFailuresTotal: number;
  };
  failureMetrics: {
    errorCategories: Record<ObservabilityErrorCategory, number>;
    githubFailuresTotal: number;
    retriesTotal: number;
    droppedInvalidIssuesTotal: number;
  };
  lifecycleStages: Record<
    ReviewLifecycleStage,
    {
      count: number;
      avgMs: number;
      p50Ms: number;
      p95Ms: number;
      lastMs: number;
    }
  >;
  recentTraces: Array<{
    reviewId: number | null;
    jobId: string;
    correlationId: string;
    repoFullName: string;
    prNumber: number;
    commitSha: string;
    totalDurationMs: number;
    status: string;
    verdict?: string;
    completedAt: string;
    stages?: Record<ReviewLifecycleStage, any>;
  }>;
  stuckReviews: Array<{
    id: number;
    prNumber: number;
    repoName: string;
    commitSha: string;
    status: string;
    stage: string | null;
    startedAt: string;
    runningDurationSeconds: number;
  }>;
}

import {
  requireSession,
  requireAdminSession,
  getSessionInstallationIds,
  handleAuthError,
} from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const traceId = searchParams.get('traceId');

  // If a specific trace is requested (by reviewId or correlationId)
  if (traceId) {
    try {
      await requireSession();
    } catch (error) {
      const authRes = handleAuthError(error);
      if (authRes) return authRes;
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const installationIds: bigint[] = await getSessionInstallationIds().catch(() => []);
    const isAdmin = await requireAdminSession().then(() => true).catch(() => false);

    try {
      await ensureRedisReady();
      // Try Redis first
      const rawTrace = await redisProducerConnection.get(`review:trace:${traceId}`);
      if (rawTrace) {
        const parsedTrace = JSON.parse(rawTrace);
        if (!isAdmin && parsedTrace.repositoryId) {
          const repo = await prisma.repository.findUnique({
            where: { id: parsedTrace.repositoryId },
            include: { installation: true },
          });
          if (repo && !installationIds.some((id) => BigInt(id) === BigInt(repo.installation.githubInstallationId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
        }
        return NextResponse.json(parsedTrace);
      }
    } catch {
      // Redis unavailable; fall through to database
    }

    // Try finding by review ID in DB
    const reviewIdNum = parseInt(traceId, 10);
    if (!isNaN(reviewIdNum)) {
      try {
        const review = await prisma.review.findUnique({
          where: { id: reviewIdNum },
          include: {
            pullRequest: {
              include: {
                repository: {
                  include: {
                    installation: true,
                  },
                },
              },
            },
          },
        });

        if (review) {
          const repoInstId = review.pullRequest?.repository?.installation?.githubInstallationId;
          if (!isAdmin && repoInstId && !installationIds.some((id) => BigInt(id) === BigInt(repoInstId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }

          const structured = (review.summaryStructured as any) || {};
          const trace: Partial<ReviewLifecycleTrace> = {
            correlationId: `rev-${review.id}`,
            jobId: String(review.id),
            reviewId: review.id,
            repositoryId: review.pullRequest?.repository?.id ?? null,
            repoFullName: review.pullRequest?.repository?.fullName ?? 'unknown',
            prNumber: review.pullRequest?.githubPrNumber ?? 0,
            commitSha: review.commitSha,
            totalDurationMs: review.latencyMs ?? 0,
            status: review.status as any,
            stages: structured.stageTimings || {},
            createdAt: review.startedAt.toISOString(),
            completedAt: review.completedAt?.toISOString(),
          };
          return NextResponse.json(serializeWithBigInt(trace));
        }
      } catch (dbErr) {
        console.error('Error fetching review trace from DB:', dbErr);
      }
    }

    return NextResponse.json({ error: 'Trace not found' }, { status: 404 });
  }

  // Global operational metrics require administrator session
  try {
    await requireAdminSession();
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Administrator privileges required' }, { status: 403 });
  }

  // 1. Fetch BullMQ Queue Counts
  let queueCounts = {
    waiting: 0,
    active: 0,
    delayed: 0,
    failed: 0,
    completed: 0,
  };

  try {
    const counts = await reviewQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    );
    queueCounts = {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      delayed: counts.delayed || 0,
      failed: counts.failed || 0,
      completed: counts.completed || 0,
    };
  } catch {
    // Non-fatal if queue is down
  }

  // 2. Fetch Worker Metrics (from Worker HTTP or Redis snapshot)
  let workerSnapshot: any = null;
  let workerStatus: 'online' | 'degraded' | 'offline' = 'offline';

  // Try HTTP probe first with 1.5s timeout
  const workerBase = process.env.WORKER_URL || process.env.WORKER_METRICS_URL;
  const workerMetricsUrl = workerBase
    ? (workerBase.endsWith('/metrics') ? workerBase : `${workerBase.replace(/\/$/, '')}/metrics`)
    : 'http://127.0.0.1:3001/metrics';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const workerRes = await fetch(workerMetricsUrl, {
      signal: controller.signal,
      headers: process.env.WORKER_METRICS_TOKEN
        ? { Authorization: `Bearer ${process.env.WORKER_METRICS_TOKEN}` }
        : {},
      cache: 'no-store',
    });
    clearTimeout(timeout);
    if (workerRes.ok) {
      workerSnapshot = await workerRes.json();
      workerStatus = 'online';
    }
  } catch {
    // HTTP fetch failed
  }

  // If HTTP failed, try reading Redis cached snapshot
  if (!workerSnapshot) {
    try {
      await ensureRedisReady();
      const cached = await redisProducerConnection.get('observability:worker_metrics');
      if (cached) {
        workerSnapshot = JSON.parse(cached);
        workerStatus = 'online';
      }
    } catch {
      // Redis unavailable
    }
  }

  // 3. Stalled / Stuck Reviews Detection (>90 seconds in pending/processing/posting)
  const stuckThreshold = new Date(Date.now() - 90 * 1000);
  let stuckReviews: any[] = [];
  try {
    stuckReviews = await prisma.review.findMany({
      where: {
        status: { in: ['pending', 'processing', 'posting'] },
        startedAt: { lt: stuckThreshold },
      },
      include: {
        pullRequest: {
          include: {
            repository: true,
          },
        },
      },
      take: 10,
      orderBy: { startedAt: 'asc' },
    });
  } catch {
    // Database query failed
  }

  const formattedStuckReviews = stuckReviews.map((r) => ({
    id: r.id,
    prNumber: r.pullRequest?.githubPrNumber ?? 0,
    repoName: r.pullRequest?.repository?.fullName ?? 'unknown',
    commitSha: r.commitSha,
    status: r.status,
    stage: r.stage,
    startedAt: r.startedAt.toISOString(),
    runningDurationSeconds: Math.round((Date.now() - new Date(r.startedAt).getTime()) / 1000),
  }));

  // 4. Fetch Recent Traces
  let recentTraces: any[] = [];
  try {
    await ensureRedisReady();
    const rawList = await redisProducerConnection.lrange('observability:recent_traces', 0, 19);
    if (rawList && rawList.length > 0) {
      recentTraces = rawList.map((str) => {
        try {
          return JSON.parse(str);
        } catch {
          return null;
        }
      }).filter(Boolean);
    }
  } catch {
    // Redis unavailable
  }

  // Fallback: If no recent traces in Redis, query recent reviews from Postgres
  if (recentTraces.length === 0) {
    try {
      const dbRecent = await prisma.review.findMany({
        take: 15,
        orderBy: { id: 'desc' },
        include: {
          pullRequest: {
            include: {
              repository: true,
            },
          },
        },
      });

      recentTraces = dbRecent.map((rev) => {
        const structured = (rev.summaryStructured as any) || {};
        return {
          reviewId: rev.id,
          jobId: String(rev.id),
          correlationId: `c-db-${rev.id}`,
          repoFullName: rev.pullRequest?.repository?.fullName ?? 'unknown',
          prNumber: rev.pullRequest?.githubPrNumber ?? 0,
          commitSha: rev.commitSha,
          totalDurationMs: rev.latencyMs || 0,
          status: rev.status,
          verdict: (rev as any).verdict ?? 'APPROVED',
          completedAt: (rev.completedAt ?? rev.startedAt).toISOString(),
          stages: structured.stageTimings || {},
        };
      });
    } catch {
      // Fallback failed
    }
  }

  // 5. Build Default / Consolidated Lifecycle Stage Metrics
  const defaultStages: Record<
    ReviewLifecycleStage,
    { count: number; avgMs: number; p50Ms: number; p95Ms: number; lastMs: number }
  > = {} as any;

  for (const s of REVIEW_LIFECYCLE_STAGES) {
    if (workerSnapshot?.stage_latencies?.[s]) {
      const st = workerSnapshot.stage_latencies[s];
      defaultStages[s] = {
        count: st.count || 0,
        avgMs: st.avg || 0,
        p50Ms: st.p50 || 0,
        p95Ms: st.p95 || 0,
        lastMs: st.last || 0,
      };
    } else {
      defaultStages[s] = { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, lastMs: 0 };
    }
  }

  // Build Default Error Categories
  const errorCategories: Record<ObservabilityErrorCategory, number> = {
    none: 0,
    validation_error: 0,
    auth_error: 0,
    rate_limit: 0,
    timeout: 0,
    llm_error: 0,
    stale_commit: 0,
    db_error: 0,
    syntax_error: 0,
    unknown: 0,
  };

  if (workerSnapshot?.error_categories) {
    for (const [k, v] of Object.entries(workerSnapshot.error_categories)) {
      if (k in errorCategories) {
        errorCategories[k as ObservabilityErrorCategory] = Number(v) || 0;
      }
    }
  }

  const response: ObservabilityResponse = {
    timestamp: new Date().toISOString(),
    workerStatus,
    queueDepth: {
      waiting: workerSnapshot?.queue_depth?.waiting ?? queueCounts.waiting,
      active: workerSnapshot?.queue_depth?.active ?? queueCounts.active,
      delayed: workerSnapshot?.queue_depth?.delayed ?? queueCounts.delayed,
      failed: workerSnapshot?.queue_depth?.failed ?? queueCounts.failed,
      completed: workerSnapshot?.queue_depth?.completed ?? queueCounts.completed,
    },
    workerHealth: {
      uptimeSeconds: workerSnapshot?.worker_health?.uptime_seconds ?? 0,
      memory: {
        rssMb: workerSnapshot?.worker_health?.memory?.rss_mb ?? 0,
        heapUsedMb: workerSnapshot?.worker_health?.memory?.heap_used_mb ?? 0,
        heapTotalMb: workerSnapshot?.worker_health?.memory?.heap_total_mb ?? 0,
        externalMb: workerSnapshot?.worker_health?.memory?.external_mb ?? 0,
      },
    },
    staleJobs: {
      detectedTotal: workerSnapshot?.stale_jobs?.detected_total ?? 0,
      reapedTotal: workerSnapshot?.stale_jobs?.reaped_total ?? 0,
      lastReapTimestamp: workerSnapshot?.stale_jobs?.last_reap_timestamp ?? null,
      stuckReviewsActive: formattedStuckReviews.length,
    },
    llmMetrics: {
      latency: workerSnapshot?.llm_latency_ms ?? { avg: 0, p50: 0, p95: 0, last: 0, count: 0 },
      tokensConsumedTotal: workerSnapshot?.tokens_consumed_total ?? 0,
      tokenUsage: workerSnapshot?.token_usage ?? { prompt: 0, completion: 0, total: 0 },
      estimatedCostUsd: workerSnapshot?.estimated_cost_usd ?? 0,
      llmFailuresTotal: workerSnapshot?.llm_failures_total ?? 0,
    },
    failureMetrics: {
      errorCategories,
      githubFailuresTotal: workerSnapshot?.github_failures_total ?? 0,
      retriesTotal: workerSnapshot?.retries_total ?? 0,
      droppedInvalidIssuesTotal: workerSnapshot?.dropped_invalid_issues_total ?? 0,
    },
    lifecycleStages: defaultStages,
    recentTraces,
    stuckReviews: formattedStuckReviews,
  };

  return NextResponse.json(serializeWithBigInt(response));
}
