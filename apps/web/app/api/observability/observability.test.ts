import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { REVIEW_LIFECYCLE_STAGES } from '@ai-reviewer/shared';

describe('Operational Health API (/api/observability)', () => {
  it('returns complete operational telemetry payload with 11 lifecycle stages', async () => {
    const req = new NextRequest('http://localhost:3000/api/observability');
    const res = await GET(req);

    assert.equal(res.status, 200);
    const body = await res.json();

    // 1. Queue depth
    assert.ok(body.queueDepth);
    assert.equal(typeof body.queueDepth.waiting, 'number');
    assert.equal(typeof body.queueDepth.active, 'number');
    assert.equal(typeof body.queueDepth.failed, 'number');

    // 2. Worker health
    assert.ok(body.workerHealth);
    assert.equal(typeof body.workerHealth.uptimeSeconds, 'number');
    assert.ok(body.workerHealth.memory);

    // 3. Stale jobs
    assert.ok(body.staleJobs);
    assert.equal(typeof body.staleJobs.detectedTotal, 'number');
    assert.equal(typeof body.staleJobs.reapedTotal, 'number');
    assert.equal(typeof body.staleJobs.stuckReviewsActive, 'number');

    // 4. LLM & cost metrics
    assert.ok(body.llmMetrics);
    assert.ok(body.llmMetrics.latency);
    assert.equal(typeof body.llmMetrics.tokensConsumedTotal, 'number');
    assert.equal(typeof body.llmMetrics.estimatedCostUsd, 'number');

    // 5. Failure metrics
    assert.ok(body.failureMetrics);
    assert.ok(body.failureMetrics.errorCategories);
    assert.equal(typeof body.failureMetrics.errorCategories.rate_limit, 'number');
    assert.equal(typeof body.failureMetrics.errorCategories.timeout, 'number');
    assert.equal(typeof body.failureMetrics.errorCategories.llm_error, 'number');

    // 6. All 11 lifecycle stages
    assert.ok(body.lifecycleStages);
    for (const stage of REVIEW_LIFECYCLE_STAGES) {
      assert.ok(body.lifecycleStages[stage], `Expected stage ${stage} to be present`);
      assert.equal(typeof body.lifecycleStages[stage].count, 'number');
      assert.equal(typeof body.lifecycleStages[stage].avgMs, 'number');
      assert.equal(typeof body.lifecycleStages[stage].p50Ms, 'number');
      assert.equal(typeof body.lifecycleStages[stage].p95Ms, 'number');
    }

    // 7. Recent traces & stuck reviews arrays
    assert.ok(Array.isArray(body.recentTraces));
    assert.ok(Array.isArray(body.stuckReviews));

    // 8. Strict security: payload contains NO secret tokens or raw file diff contents
    const rawJson = JSON.stringify(body);
    assert.doesNotMatch(rawJson, /ghp_/);
    assert.doesNotMatch(rawJson, /github_pat_/);
    assert.doesNotMatch(rawJson, /diff --git/);
  });

  it('handles query for nonexistent trace ID cleanly with 404', async () => {
    const req = new NextRequest('http://localhost:3000/api/observability?traceId=999999999');
    const res = await GET(req);

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'Trace not found');
  });
});
