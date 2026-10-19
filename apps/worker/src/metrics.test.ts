import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { metrics } from './metrics.js';

describe('Structured Observability Metrics Suite (Phase 3 Requirement 10)', () => {
  it('computes accurate percentiles, token usage, cost estimation, and failure metrics', async () => {
    // Record queue wait latencies
    metrics.recordQueueWait(20);
    metrics.recordQueueWait(40);
    metrics.recordQueueWait(100);

    // Record job duration
    metrics.recordJobDuration(500);
    metrics.recordJobDuration(1200);

    // Record LLM calls & failures
    metrics.recordLlmCall(150);
    metrics.recordLlmCall(300);
    metrics.recordLlmFailure();

    // Record GitHub failures and retries
    metrics.recordGitHubFailure();
    metrics.recordRetry();

    // Record tokens: prompt=2000, completion=500
    metrics.recordTokens(2000, 500);

    // Record dropped issues
    metrics.recordDroppedIssues(3);

    // Record webhook
    metrics.recordWebhook(true);
    metrics.recordWebhook(false);

    // Snapshot metrics
    const snapshot = await metrics.getSnapshot();

    // Assertions
    assert.ok(snapshot.queue_wait_ms.count >= 3);
    assert.ok(snapshot.queue_wait_ms.p50 >= 20);
    assert.ok(snapshot.queue_wait_ms.p95 >= 40);

    assert.ok(snapshot.job_duration_ms.count >= 2);
    assert.ok(snapshot.job_duration_ms.p50 >= 500);

    assert.ok(snapshot.llm_latency_ms.count >= 2);
    assert.ok(snapshot.llm_failures_total >= 1);
    assert.ok(snapshot.github_failures_total >= 1);
    assert.ok(snapshot.retries_total >= 1);

    assert.ok(snapshot.token_usage.prompt >= 2000);
    assert.ok(snapshot.token_usage.completion >= 500);
    assert.ok(snapshot.token_usage.total >= 2500);
    assert.ok(snapshot.estimated_cost_usd > 0);

    assert.ok(snapshot.dropped_invalid_issues_total >= 3);
    assert.ok(snapshot.webhook_counts.received >= 2);
    assert.ok(snapshot.webhook_counts.failures >= 1);
  });
});
