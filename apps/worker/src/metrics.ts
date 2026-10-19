import { Queue } from 'bullmq';
import {
  ReviewLifecycleStage,
  StageExecutionStatus,
  ObservabilityErrorCategory,
  REVIEW_LIFECYCLE_STAGES,
} from '@ai-reviewer/shared';

export interface InstallationMetrics {
  started: number;
  completed: number;
  failed: number;
}

export interface PercentileMetric {
  count: number;
  avg: number;
  p50: number;
  p95: number;
  last: number;
}

export interface WorkerHealthMetrics {
  uptime_seconds: number;
  memory: {
    rss_mb: number;
    heap_used_mb: number;
    heap_total_mb: number;
    external_mb: number;
  };
}

export interface StaleJobMetrics {
  detected_total: number;
  reaped_total: number;
  last_reap_timestamp: string | null;
}

export interface MetricsData {
  queue_depth: {
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
  };
  queue_wait_ms: PercentileMetric;
  job_duration_ms: PercentileMetric;
  review_duration_ms: PercentileMetric;
  review_latency_ms: PercentileMetric; // legacy alias
  llm_latency_ms: PercentileMetric;
  llm_failures_total: number;
  github_failures_total: number;
  retries_total: number;
  tokens_consumed_total: number; // legacy number for backward compat
  token_usage: {
    prompt: number;
    completion: number;
    total: number;
  };
  estimated_cost_usd: number;
  dropped_invalid_issues_total: number;
  webhook_counts: {
    received: number;
    failures: number;
  };
  per_installation: Record<string, InstallationMetrics>;
  stage_latencies: Record<ReviewLifecycleStage, PercentileMetric>;
  error_categories: Record<ObservabilityErrorCategory, number>;
  worker_health: WorkerHealthMetrics;
  stale_jobs: StaleJobMetrics;
}

export class LatencyReservoir {
  private values: number[] = [];
  private readonly maxSize: number;
  private total = 0;
  private count = 0;
  private lastValue = 0;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  record(val: number) {
    this.count++;
    this.total += val;
    this.lastValue = val;
    if (this.values.length < this.maxSize) {
      this.values.push(val);
    } else {
      const idx = Math.floor(Math.random() * this.count);
      if (idx < this.maxSize) {
        this.values[idx] = val;
      }
    }
  }

  getStats(): PercentileMetric {
    if (this.count === 0) {
      return { count: 0, avg: 0, p50: 0, p95: 0, last: 0 };
    }
    const sorted = [...this.values].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0;
    return {
      count: this.count,
      avg: Math.round(this.total / this.count),
      p50,
      p95,
      last: this.lastValue,
    };
  }
}

export class MetricsRegistry {
  private llmLatency = new LatencyReservoir();
  private queueWait = new LatencyReservoir();
  private jobDuration = new LatencyReservoir();
  private reviewLatency = new LatencyReservoir();

  private llmFailuresTotal = 0;
  private githubFailuresTotal = 0;
  private retriesTotal = 0;

  private promptTokensTotal = 0;
  private completionTokensTotal = 0;
  private tokensConsumedTotal = 0;
  private estimatedCostUsd = 0;

  private droppedInvalidIssuesTotal = 0;
  private webhooksReceivedTotal = 0;
  private webhooksFailedTotal = 0;

  /** Item 23: Per-installation job counters */
  private installationMetrics = new Map<string, InstallationMetrics>();

  /** 11 Lifecycle Stage Latency Reservoirs */
  private stageLatencies = new Map<ReviewLifecycleStage, LatencyReservoir>();

  /** Failure breakdown by category */
  private errorCategoryCounts = new Map<ObservabilityErrorCategory, number>();

  /** Stale job detection and reaper metrics */
  private staleJobsDetectedTotal = 0;
  private staleJobsReapedTotal = 0;
  private lastReapTimestamp: string | null = null;

  constructor() {
    for (const stage of REVIEW_LIFECYCLE_STAGES) {
      this.stageLatencies.set(stage, new LatencyReservoir());
    }

    const categories: ObservabilityErrorCategory[] = [
      'none',
      'validation_error',
      'auth_error',
      'rate_limit',
      'timeout',
      'llm_error',
      'stale_commit',
      'db_error',
      'syntax_error',
      'unknown',
    ];
    for (const cat of categories) {
      this.errorCategoryCounts.set(cat, 0);
    }
  }

  recordStageExecution(
    stage: ReviewLifecycleStage,
    durationMs: number,
    status: StageExecutionStatus = 'success',
    errorCategory?: ObservabilityErrorCategory
  ) {
    const res = this.stageLatencies.get(stage);
    if (res) {
      res.record(durationMs);
    }

    if (errorCategory && errorCategory !== 'none') {
      const current = this.errorCategoryCounts.get(errorCategory) || 0;
      this.errorCategoryCounts.set(errorCategory, current + 1);
    } else if (status === 'failed') {
      const current = this.errorCategoryCounts.get('unknown') || 0;
      this.errorCategoryCounts.set('unknown', current + 1);
    }
  }

  recordErrorCategory(category: ObservabilityErrorCategory) {
    const current = this.errorCategoryCounts.get(category) || 0;
    this.errorCategoryCounts.set(category, current + 1);
  }

  recordStaleJobDetected(count = 1) {
    this.staleJobsDetectedTotal += Math.max(0, count);
  }

  recordStaleJobReaped(count = 1) {
    this.staleJobsReapedTotal += Math.max(0, count);
    this.lastReapTimestamp = new Date().toISOString();
  }

  recordLlmCall(latencyMs: number) {
    this.llmLatency.record(latencyMs);
  }

  recordLlmFailure() {
    this.llmFailuresTotal++;
    this.recordErrorCategory('llm_error');
  }

  recordGitHubFailure() {
    this.githubFailuresTotal++;
  }

  recordRetry() {
    this.retriesTotal++;
  }

  recordQueueWait(waitMs: number) {
    this.queueWait.record(waitMs);
  }

  recordJobDuration(durationMs: number) {
    this.jobDuration.record(durationMs);
  }

  recordTokens(tokensOrPrompt: number, completionTokens?: number) {
    const prompt = Math.max(0, tokensOrPrompt);
    const completion = Math.max(0, completionTokens || 0);
    this.promptTokensTotal += prompt;
    this.completionTokensTotal += completion;
    const total = prompt + completion;
    this.tokensConsumedTotal += total;

    // Blended estimation ($0.15 / 1M prompt, $0.60 / 1M completion)
    const cost = prompt * 0.00000015 + completion * 0.0000006;
    this.estimatedCostUsd += cost;
  }

  recordDroppedIssues(count: number) {
    this.droppedInvalidIssuesTotal += Math.max(0, count);
  }

  recordReviewCompletion(latencyMs: number) {
    this.reviewLatency.record(latencyMs);
  }

  recordWebhook(success: boolean) {
    this.webhooksReceivedTotal++;
    if (!success) {
      this.webhooksFailedTotal++;
    }
  }

  recordInstallationJob(
    installationId: number | string,
    event: 'started' | 'completed' | 'failed'
  ) {
    const key = String(installationId);
    let entry = this.installationMetrics.get(key);
    if (!entry) {
      entry = { started: 0, completed: 0, failed: 0 };
      this.installationMetrics.set(key, entry);
    }
    entry[event]++;
  }

  async getSnapshot(queue?: Queue): Promise<MetricsData> {
    let queueCounts = {
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    };

    if (queue) {
      try {
        const counts = await queue.getJobCounts(
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
        // If queue query fails, keep zeroes
      }
    }

    const perInstallation: Record<string, InstallationMetrics> = {};
    for (const [id, m] of this.installationMetrics.entries()) {
      perInstallation[id] = { ...m };
    }

    const revStats = this.reviewLatency.getStats();

    const stageLatenciesSnapshot: Record<ReviewLifecycleStage, PercentileMetric> = {} as any;
    for (const stage of REVIEW_LIFECYCLE_STAGES) {
      const reservoir = this.stageLatencies.get(stage);
      stageLatenciesSnapshot[stage] = reservoir
        ? reservoir.getStats()
        : { count: 0, avg: 0, p50: 0, p95: 0, last: 0 };
    }

    const errorCategoriesSnapshot: Record<ObservabilityErrorCategory, number> = {} as any;
    for (const [cat, count] of this.errorCategoryCounts.entries()) {
      errorCategoriesSnapshot[cat] = count;
    }

    const mem = process.memoryUsage();

    return {
      queue_depth: queueCounts,
      queue_wait_ms: this.queueWait.getStats(),
      job_duration_ms: this.jobDuration.getStats(),
      review_duration_ms: revStats,
      review_latency_ms: revStats,
      llm_latency_ms: this.llmLatency.getStats(),
      llm_failures_total: this.llmFailuresTotal,
      github_failures_total: this.githubFailuresTotal,
      retries_total: this.retriesTotal,
      tokens_consumed_total: this.tokensConsumedTotal,
      token_usage: {
        prompt: this.promptTokensTotal,
        completion: this.completionTokensTotal,
        total: this.tokensConsumedTotal,
      },
      estimated_cost_usd: Number(this.estimatedCostUsd.toFixed(6)),
      dropped_invalid_issues_total: this.droppedInvalidIssuesTotal,
      webhook_counts: {
        received: this.webhooksReceivedTotal,
        failures: this.webhooksFailedTotal,
      },
      per_installation: perInstallation,
      stage_latencies: stageLatenciesSnapshot,
      error_categories: errorCategoriesSnapshot,
      worker_health: {
        uptime_seconds: Math.round(process.uptime()),
        memory: {
          rss_mb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
          heap_used_mb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
          heap_total_mb: Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100,
          external_mb: Math.round((mem.external / (1024 * 1024)) * 100) / 100,
        },
      },
      stale_jobs: {
        detected_total: this.staleJobsDetectedTotal,
        reaped_total: this.staleJobsReapedTotal,
        last_reap_timestamp: this.lastReapTimestamp,
      },
    };
  }
}

export const metrics = new MetricsRegistry();
