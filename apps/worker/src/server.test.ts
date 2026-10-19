import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { Redis } from 'ioredis';
import { isPortReachable } from '@ai-reviewer/shared';
import { startHealthServer } from './server.js';
import { metrics } from './metrics.js';

function itRedis(name: string, fn: () => Promise<void> | void) {
  it(name, async (t) => {
    if (!(await isPortReachable(6379))) {
      t.skip('Redis 6379 is offline');
      return;
    }
    await fn();
  });
}

describe('Worker Health and Metrics Server (Requirement 19)', () => {
  let redis: Redis;
  let server: http.Server;
  let serverPort: number;
  let isShuttingDown = false;

  before(async () => {
    if (!(await isPortReachable(6379))) return;
    redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    server = startHealthServer({
      port: 0, // OS assigns open port
      redis,
      isShuttingDown: () => isShuttingDown,
    });

    await new Promise<void>((resolve) => {
      server.on('listening', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (await isPortReachable(6379) && redis) {
      await redis.quit().catch(() => {});
    }
  });

  itRedis('serves 200 healthy on /health when running normally', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.ok(body.redis);
    assert.ok(typeof body.uptime === 'number');
  });

  itRedis('serves metrics on /metrics with queue depth, latency, tokens, and dropped issues', async () => {
    // Record sample metrics
    metrics.recordLlmCall(150);
    metrics.recordTokens(350);
    metrics.recordDroppedIssues(2);
    metrics.recordReviewCompletion(1200);

    const res = await fetch(`http://127.0.0.1:${serverPort}/metrics`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.ok(body.queue_depth, 'Should include queue_depth');
    assert.ok(body.llm_latency_ms, 'Should include llm_latency_ms');
    assert.ok(body.llm_latency_ms.count >= 1);
    assert.ok(body.tokens_consumed_total >= 350, 'Should include tokens_consumed_total');
    assert.ok(body.dropped_invalid_issues_total >= 2, 'Should include dropped_invalid_issues_total');
    assert.ok(body.review_latency_ms, 'Should include review_latency_ms');
    assert.ok(body.review_latency_ms.count >= 1);
  });

  itRedis('serves 503 draining on /health when worker is shutting down', async () => {
    isShuttingDown = true;
    const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, 'draining');
    isShuttingDown = false;
  });

  itRedis('Item 25: protects /metrics when metricsToken is configured', async () => {
    // Start protected test server
    const token = 'test-secret-metrics-token-12345';
    const protectedServer = startHealthServer({
      port: 0,
      host: '127.0.0.1',
      metricsToken: token,
      redis,
      isShuttingDown: () => false,
    });

    let protectedPort = 0;
    await new Promise<void>((resolve) => {
      protectedServer.on('listening', () => {
        const addr = protectedServer.address();
        if (addr && typeof addr === 'object') {
          protectedPort = addr.port;
        }
        resolve();
      });
    });

    try {
      // 1. Without token -> 403 Forbidden
      const unauthedRes = await fetch(`http://127.0.0.1:${protectedPort}/metrics`);
      assert.equal(unauthedRes.status, 403, 'Should reject unauthenticated metrics request');
      const unauthedBody = await unauthedRes.json();
      assert.ok(unauthedBody.error.includes('Forbidden'));

      // 2. With wrong Bearer token -> 403 Forbidden
      const badTokenRes = await fetch(`http://127.0.0.1:${protectedPort}/metrics`, {
        headers: { Authorization: 'Bearer wrong-token' },
      });
      assert.equal(badTokenRes.status, 403);

      // 3. With valid Bearer token -> 200 OK
      const validBearerRes = await fetch(`http://127.0.0.1:${protectedPort}/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(validBearerRes.status, 200);
      const validBearerBody = await validBearerRes.json();
      assert.ok(validBearerBody.queue_depth !== undefined);

      // 4. With valid x-metrics-token header -> 200 OK
      const validCustomHeaderRes = await fetch(`http://127.0.0.1:${protectedPort}/metrics`, {
        headers: { 'x-metrics-token': token },
      });
      assert.equal(validCustomHeaderRes.status, 200);
    } finally {
      await new Promise<void>((resolve) => protectedServer.close(() => resolve()));
    }
  });
});
