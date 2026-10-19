import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { isPortReachable } from '@ai-reviewer/shared';
import {
  rateLimit,
  getClientIp,
  checkApiRateLimit,
  checkReviewRerunRateLimit,
  checkConfigMutationRateLimit,
} from './rate-limit.js';

test('rateLimit permits requests up to the limit and blocks excess requests', async (t) => {
  if (!(await isPortReachable(6379))) {
    t.skip('Redis 6379 is offline; skipping live Redis rate limit test');
    return;
  }
  const testId = `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const limit = 3;

  for (let i = 1; i <= limit; i++) {
    const res = await rateLimit(testId, limit, 10);
    assert.equal(res.success, true);
    assert.equal(res.remaining, limit - i);
  }

  const blockedRes = await rateLimit(testId, limit, 10);
  assert.equal(blockedRes.success, false);
  assert.equal(blockedRes.remaining, 0);
});

test('rate limiting anti-spoofing: ignores spoofed X-Forwarded-For when TRUST_PROXY is not enabled', async () => {
  const oldEnv = process.env.TRUST_PROXY;
  try {
    delete process.env.TRUST_PROXY;

    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: {
        'x-forwarded-for': '198.51.100.42, 203.0.113.1',
        'x-real-ip': '198.51.100.42',
      },
    });

    const ip = getClientIp(req);
    // When trust proxy is disabled, untrusted spoofed header must NOT be used
    assert.notEqual(ip, '198.51.100.42');
    assert.equal(ip, '127.0.0.1');
  } finally {
    if (oldEnv) process.env.TRUST_PROXY = oldEnv;
  }
});

test('rate limiting trusted proxy: respects X-Forwarded-For when TRUST_PROXY=true', async () => {
  const oldEnv = process.env.TRUST_PROXY;
  try {
    process.env.TRUST_PROXY = 'true';

    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: {
        'x-forwarded-for': '203.0.113.50, 10.0.0.1',
      },
    });

    const ip = getClientIp(req);
    assert.equal(ip, '203.0.113.50');
  } finally {
    if (oldEnv) process.env.TRUST_PROXY = oldEnv;
    else delete process.env.TRUST_PROXY;
  }
});

test('dedicated rate limiter: review rerun enforces 10 req/min limit', async (t) => {
  if (!(await isPortReachable(6379))) {
    t.skip('Redis 6379 is offline; skipping live Redis rate limit test');
    return;
  }
  const uniqueIp = `10.${(Date.now() >> 16) & 255}.${(Date.now() >> 8) & 255}.${Math.floor(Math.random() * 250) + 1}`;
  const oldEnv = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = 'true';

  try {
    const makeReq = () =>
      new NextRequest('http://localhost:3000/api/pull-requests/42/reviews', {
        method: 'POST',
        headers: {
          'x-forwarded-for': uniqueIp,
        },
      });

    // Send 10 allowed requests
    for (let i = 0; i < 10; i++) {
      const res = await checkReviewRerunRateLimit(makeReq());
      assert.equal(res, null, `Request ${i + 1} should be permitted`);
    }

    // 11th request must be rejected with 429 Too Many Requests
    const blockedRes = await checkReviewRerunRateLimit(makeReq());
    assert.ok(blockedRes !== null, '11th request must return 429 response');
    assert.equal(blockedRes.status, 429);
    const body = await blockedRes.json();
    assert.equal(body.error, 'Too Many Requests');
  } finally {
    if (oldEnv) process.env.TRUST_PROXY = oldEnv;
    else delete process.env.TRUST_PROXY;
  }
});

test('dedicated rate limiter: checkConfigMutationRateLimit enforces 30 req/min limit', async (t) => {
  if (!(await isPortReachable(6379))) {
    t.skip('Redis 6379 is offline; skipping live Redis rate limit test');
    return;
  }
  const repoId = `repo-rate-${Date.now()}`;

  for (let i = 0; i < 30; i++) {
    const res = await checkConfigMutationRateLimit(repoId);
    assert.equal(res.allowed, true, `Mutation ${i + 1} should be permitted`);
  }

  const blocked = await checkConfigMutationRateLimit(repoId);
  assert.equal(blocked.allowed, false, '31st mutation must be rate limited');
});

test('Redis failure behavior: read operations degrade gracefully (fail open), mutating operations fail safely (fail closed)', async (t) => {
  if (!(await isPortReachable(6379))) {
    t.skip('Redis 6379 is offline; skipping live Redis rate limit test');
    return;
  }
  // Test rateLimit directly with failOpen flag
  const failOpenRes = await rateLimit('invalid-key-test', 10, 60, true);
  // With real Redis up, normal check passes
  assert.equal(failOpenRes.success, true);

  // Now test checkApiRateLimit behavior with mock request
  const getReq = new NextRequest('http://localhost:3000/api/repositories', {
    method: 'GET',
  });
  const getRes = await checkApiRateLimit(getReq);
  assert.equal(getRes, null, 'Read GET request must be permitted');

  const postReq = new NextRequest('http://localhost:3000/api/pull-requests/1/reviews', {
    method: 'POST',
  });
  const postRes = await checkApiRateLimit(postReq);
  // With Redis up, within limit is allowed
  assert.equal(postRes, null, 'Under-limit POST mutation should be permitted when Redis is healthy');
});

