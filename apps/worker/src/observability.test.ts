import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { metrics } from './metrics.js';
import {
  REVIEW_LIFECYCLE_STAGES,
  ReviewLifecycleStage,
  classifyErrorCategory,
  createStageTimingRecord,
  sanitizeObservabilityMetadata,
  redactSensitiveString,
} from '@ai-reviewer/shared';

describe('End-to-End Review Lifecycle Observability Suite', () => {
  it('traces and records metrics for all 11 lifecycle stages', async () => {
    assert.equal(REVIEW_LIFECYCLE_STAGES.length, 11);

    const testStages: ReviewLifecycleStage[] = [
      'github_webhook',
      'webhook_validation',
      'queue_enqueue',
      'worker_start',
      'repository_fetch',
      'diff_generation',
      'static_analysis',
      'llm_analysis',
      'finding_validation',
      'persistence',
      'review_completion',
    ];

    for (const stage of testStages) {
      metrics.recordStageExecution(stage, 45, 'success', 'none');
      metrics.recordStageExecution(stage, 85, 'success', 'none');
    }

    const snapshot = await metrics.getSnapshot();

    for (const stage of testStages) {
      assert.ok(snapshot.stage_latencies[stage], `Expected stage ${stage} in snapshot`);
      assert.ok(snapshot.stage_latencies[stage].count >= 2, `Expected count >= 2 for ${stage}`);
      assert.ok(snapshot.stage_latencies[stage].avg >= 45, `Expected valid avg for ${stage}`);
    }
  });

  it('classifies and records errors across error categories', async () => {
    assert.equal(classifyErrorCategory(new Error('GitHub bad credentials 401')), 'auth_error');
    assert.equal(classifyErrorCategory(new Error('Rate limit exceeded 429')), 'rate_limit');
    assert.equal(classifyErrorCategory(new Error('Command timed out after 15000ms')), 'timeout');
    assert.equal(classifyErrorCategory(new Error('OpenAI LLM provider 500 error')), 'llm_error');
    assert.equal(classifyErrorCategory(new Error('Head SHA changed during review')), 'stale_commit');
    assert.equal(classifyErrorCategory(new Error('PrismaClientKnownRequestError connection failed')), 'db_error');
    assert.equal(classifyErrorCategory(new Error('Invalid Zod schema validation')), 'validation_error');
    assert.equal(classifyErrorCategory(new Error('Unexpected SyntaxError parsing JSON')), 'syntax_error');
    assert.equal(classifyErrorCategory(new Error('Some weird generic error')), 'unknown');

    // Record error category counters
    metrics.recordErrorCategory('rate_limit');
    metrics.recordErrorCategory('timeout');
    metrics.recordErrorCategory('llm_error');

    const snapshot = await metrics.getSnapshot();
    assert.ok(snapshot.error_categories.rate_limit >= 1);
    assert.ok(snapshot.error_categories.timeout >= 1);
    assert.ok(snapshot.error_categories.llm_error >= 1);
  });

  it('tracks stale-job detection and reaper metrics', async () => {
    metrics.recordStaleJobDetected();
    metrics.recordStaleJobDetected();
    metrics.recordStaleJobReaped();

    const snapshot = await metrics.getSnapshot();
    assert.ok(snapshot.stale_jobs.detected_total >= 2);
    assert.ok(snapshot.stale_jobs.reaped_total >= 1);
    assert.ok(snapshot.stale_jobs.last_reap_timestamp !== null);
  });

  it('reports worker health telemetry (uptime, memory)', async () => {
    const snapshot = await metrics.getSnapshot();
    assert.ok(typeof snapshot.worker_health.uptime_seconds === 'number');
    assert.ok(snapshot.worker_health.memory.rss_mb > 0);
    assert.ok(snapshot.worker_health.memory.heap_used_mb > 0);
  });

  it('strictly redacts OAuth tokens, secrets, API keys, and authorization credentials', () => {
    const sensitiveStrings = [
      'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
      'gho_1234567890abcdefghijklmnopqrstuvwxyz',
      'github_pat_1234567890abcdefghijklmnopqrstuvwxyz',
      'Bearer gho_1234567890abcdefghijklmnopqrstuvwxyz',
      'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz',
      'AIzaSyB1234567890abcdefghijklmnopqrstuvwxyz',
    ];

    for (const secret of sensitiveStrings) {
      const redacted = redactSensitiveString(secret);
      assert.doesNotMatch(redacted, /ghp_/);
      assert.doesNotMatch(redacted, /gho_/);
      assert.doesNotMatch(redacted, /github_pat_/);
      assert.doesNotMatch(redacted, /sk-proj-/);
      assert.doesNotMatch(redacted, /AIzaSy/);
    }
  });

  it('sanitizes observability metadata and strips raw diffs, patches, and code snippets', () => {
    const rawMetadata = {
      files_count: 5,
      lines_count: 120,
      diff: 'diff --git a/src/auth.ts b/src/auth.ts\n+ const secret = "supersecret"',
      patch: '@@ -1,5 +1,5 @@\n- old code\n+ new code',
      codeSnippet: 'function execute() { return true; }',
      fileContent: 'import fs from "fs";',
      oauth_token: 'ghp_secretTokenHere',
      authorization: 'Bearer secret_jwt',
      safeMetric: 42,
    };

    const sanitized = sanitizeObservabilityMetadata(rawMetadata);

    assert.equal(sanitized.files_count, 5);
    assert.equal(sanitized.lines_count, 120);
    assert.equal(sanitized.safeMetric, 42);

    // Stripped/redacted raw code fields
    assert.equal(sanitized.diff, '[REDACTED_CODE_CONTENT]');
    assert.equal(sanitized.patch, '[REDACTED_CODE_CONTENT]');
    assert.equal(sanitized.codeSnippet, '[REDACTED_CODE_CONTENT]');
    assert.equal(sanitized.fileContent, '[REDACTED_CODE_CONTENT]');

    // Redacted sensitive keys
    assert.equal(sanitized.oauth_token, '[REDACTED]');
    assert.equal(sanitized.authorization, '[REDACTED]');
  });

  it('creates complete StageTimingRecord with all required lifecycle attributes', () => {
    const record = createStageTimingRecord({
      stage: 'diff_generation',
      durationMs: 1420,
      status: 'success',
      errorCategory: 'none',
      retryCount: 0,
      jobId: 'job-987',
      reviewId: 45,
      repositoryId: 12,
      commitSha: 'a1b2c3d4e5f6',
      correlationId: 'c-test-delivery-123',
      startedAt: Date.now() - 1420,
      completedAt: Date.now(),
      metadata: { files_count: 3 },
    });

    assert.equal(record.stage, 'diff_generation');
    assert.equal(record.durationMs, 1420);
    assert.equal(record.status, 'success');
    assert.equal(record.errorCategory, 'none');
    assert.equal(record.retryCount, 0);
    assert.equal(record.jobId, 'job-987');
    assert.equal(record.reviewId, 45);
    assert.equal(record.repositoryId, 12);
    assert.equal(record.commitSha, 'a1b2c3d4e5f6');
    assert.equal(record.correlationId, 'c-test-delivery-123');
    assert.ok(record.startedAt);
    assert.ok(record.completedAt);
    assert.equal((record.metadata as any)?.files_count, 3);
  });
});
