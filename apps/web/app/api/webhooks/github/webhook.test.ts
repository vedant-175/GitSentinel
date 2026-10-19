import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from './route.js';
import { reviewQueue, redisProducerConnection } from '@/lib/queue';
import { isPortReachable } from '@ai-reviewer/shared';

const TEST_SECRET = 'test-webhook-secret-hardened-32-chars';

function signPayload(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payload).digest('hex');
}

const samplePRPayload = {
  action: 'opened',
  number: 101,
  pull_request: {
    id: 101,
    number: 101,
    title: 'Test PR for Webhook',
    state: 'open',
    draft: false,
    head: {
      sha: '1234567890abcdef1234567890abcdef12345678',
      ref: 'feature-branch',
    },
    base: {
      ref: 'main',
    },
    user: {
      login: 'alice-dev',
      type: 'User',
    },
  },
  repository: {
    id: 5555,
    name: 'test-repo',
    full_name: 'test-org/test-repo',
    private: true,
    owner: {
      login: 'test-org',
      type: 'Organization',
    },
    default_branch: 'main',
  },
  installation: {
    id: 999,
  },
};

after(async () => {
  if (await isPortReachable(6379)) {
    await reviewQueue.close().catch(() => {});
    await redisProducerConnection.quit().catch(() => {});
  }
});

beforeEach(() => {
  process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
});

test('webhook rejects bad signature with 401', async () => {
  const payloadStr = JSON.stringify(samplePRPayload);
  const deliveryId = `test-bad-sig-${Date.now()}`;

  const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-github-delivery': deliveryId,
      'x-hub-signature-256': 'sha256=invalid-signature-hex-code',
    },
    body: payloadStr,
  });

  const res = await POST(req);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, 'Invalid or missing signature');
});

test('webhook fails closed with 500 when GITHUB_WEBHOOK_SECRET is missing', async () => {
  delete process.env.GITHUB_WEBHOOK_SECRET;

  const payloadStr = JSON.stringify(samplePRPayload);
  const deliveryId = `test-no-secret-${Date.now()}`;

  const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-github-delivery': deliveryId,
      'x-hub-signature-256': signPayload(payloadStr, TEST_SECRET),
    },
    body: payloadStr,
  });

  const res = await POST(req);
  assert.equal(res.status, 500);
  const data = await res.json();
  assert.match(data.error, /missing webhook secret/i);
});

test('webhook ignores duplicate delivery with 202', async (t) => {
  if (!(await isPortReachable(6379))) {
    t.skip('Redis 6379 is offline; skipping live Redis webhook enqueue test');
    return;
  }
  const payloadStr = JSON.stringify(samplePRPayload);
  const deliveryId = `test-dup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const signature = signPayload(payloadStr, TEST_SECRET);

  const makeReq = () =>
    new NextRequest('http://localhost:3000/api/webhooks/github', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': deliveryId,
        'x-hub-signature-256': signature,
      },
      body: payloadStr,
    });

  // First delivery: enqueued
  const res1 = await POST(makeReq());
  assert.equal(res1.status, 202);
  const data1 = await res1.json();
  assert.equal(data1.ok, true);

  // Second delivery: duplicate ignored
  const res2 = await POST(makeReq());
  assert.equal(res2.status, 202);
  const data2 = await res2.json();
  assert.equal(data2.message, 'Delivery already processed');
});

test('webhook handles enqueue failure and returns 500', async (t) => {
  if (!(await isPortReachable(6379))) {
    t.skip('Redis 6379 is offline; skipping live Redis webhook enqueue test');
    return;
  }
  const payloadStr = JSON.stringify(samplePRPayload);
  const deliveryId = `test-enqueue-fail-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const signature = signPayload(payloadStr, TEST_SECRET);

  // Temporarily stub reviewQueue.add to fail
  const originalAdd = reviewQueue.add;
  reviewQueue.add = async () => {
    throw new Error('Simulated Redis Connection Loss during enqueue');
  };

  try {
    const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': deliveryId,
        'x-hub-signature-256': signature,
      },
      body: payloadStr,
    });

    const res = await POST(req);
    assert.equal(res.status, 500);
    const data = await res.json();
    assert.match(data.error, /Queue delivery or webhook processing failed/i);
  } finally {
    reviewQueue.add = originalAdd;
  }
});

test('Item 9: enqueue fails, GitHub redelivers the same GUID, and job is enqueued exactly once', async (t) => {
  if (!(await isPortReachable(6379))) {
    t.skip('Redis 6379 is offline; skipping live Redis webhook enqueue test');
    return;
  }
  const payloadStr = JSON.stringify(samplePRPayload);
  const deliveryId = `test-redeliver-guid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const signature = signPayload(payloadStr, TEST_SECRET);

  let enqueueAttempts = 0;
  let successfulEnqueues = 0;
  const originalAdd = reviewQueue.add;

  const makeReq = () =>
    new NextRequest('http://localhost:3000/api/webhooks/github', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': deliveryId,
        'x-hub-signature-256': signature,
      },
      body: payloadStr,
    });

  try {
    // Delivery Attempt 1: Enqueue fails (transient network or Redis failure)
    reviewQueue.add = async (..._args: any[]) => {
      enqueueAttempts++;
      throw new Error('Simulated transient Redis failure during job enqueue');
    };

    const res1 = await POST(makeReq());
    assert.equal(res1.status, 500);
    assert.equal(enqueueAttempts, 1);
    assert.equal(successfulEnqueues, 0);

    // Delivery Attempt 2: GitHub redelivers with the SAME GUID; enqueue now succeeds
    reviewQueue.add = async (...args: any[]) => {
      enqueueAttempts++;
      successfulEnqueues++;
      return originalAdd.apply(reviewQueue, args as any);
    };

    const res2 = await POST(makeReq());
    assert.equal(res2.status, 202);
    const data2 = await res2.json();
    assert.equal(data2.ok, true);
    assert.equal(enqueueAttempts, 2);
    assert.equal(successfulEnqueues, 1);

    // Delivery Attempt 3: Duplicate redelivery with the SAME GUID -> ignored because already done
    const res3 = await POST(makeReq());
    assert.equal(res3.status, 202);
    const data3 = await res3.json();
    assert.equal(data3.message, 'Delivery already processed');
    // Crucial check: Queue.add was NOT called a 3rd time! Exactly once!
    assert.equal(enqueueAttempts, 2);
    assert.equal(successfulEnqueues, 1);
  } finally {
    reviewQueue.add = originalAdd;
  }
});

test('Item 10: webhook handles ready_for_review and converted_to_draft events', async (t) => {
  if (!(await isPortReachable(6379))) {
    t.skip('Redis 6379 is offline; skipping live Redis webhook enqueue test');
    return;
  }
  // 1. ready_for_review enqueues review
  const readyPayload = {
    ...samplePRPayload,
    action: 'ready_for_review',
  };
  const readyStr = JSON.stringify(readyPayload);
  const readyDelivery = `test-ready-${Date.now()}`;
  const readyReq = new NextRequest('http://localhost:3000/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-github-delivery': readyDelivery,
      'x-hub-signature-256': signPayload(readyStr, TEST_SECRET),
    },
    body: readyStr,
  });
  const readyRes = await POST(readyReq);
  assert.equal(readyRes.status, 202);
  const readyData = await readyRes.json();
  assert.equal(readyData.ok, true);
  assert.equal(readyData.event, 'pull_request.review');

  // 2. converted_to_draft skips review
  const draftPayload = {
    ...samplePRPayload,
    action: 'converted_to_draft',
  };
  const draftStr = JSON.stringify(draftPayload);
  const draftDelivery = `test-draft-${Date.now()}`;
  const draftReq = new NextRequest('http://localhost:3000/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-github-delivery': draftDelivery,
      'x-hub-signature-256': signPayload(draftStr, TEST_SECRET),
    },
    body: draftStr,
  });
  const draftRes = await POST(draftReq);
  assert.equal(draftRes.status, 202);
  const draftData = await draftRes.json();
  assert.equal(draftData.event, 'pull_request.converted_to_draft');
  assert.match(draftData.message, /converted to draft/i);
});

test('Item 10: webhook uses shared isBot: matches [bot] or Bot type, never substring bot', async (t) => {
  if (!(await isPortReachable(6379))) {
    t.skip('Redis 6379 is offline; skipping live Redis webhook enqueue test');
    return;
  }
  // Non-bot user whose name contains 'bot' (e.g. 'abbot' or 'robotics')
  const humanWithBotSubstring = {
    ...samplePRPayload,
    pull_request: {
      ...samplePRPayload.pull_request,
      user: {
        login: 'abbot-researcher',
        type: 'User',
      },
    },
  };
  const humanStr = JSON.stringify(humanWithBotSubstring);
  const humanDelivery = `test-human-bot-${Date.now()}`;
  const humanReq = new NextRequest('http://localhost:3000/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-github-delivery': humanDelivery,
      'x-hub-signature-256': signPayload(humanStr, TEST_SECRET),
    },
    body: humanStr,
  });
  const humanRes = await POST(humanReq);
  assert.equal(humanRes.status, 202);
  const humanData = await humanRes.json();
  // Must NOT be skipped as a bot! It should be enqueued for review!
  assert.equal(humanData.event, 'pull_request.review');
  assert.equal(humanData.ok, true);

  // Actual bot user with [bot] suffix
  const botPayload = {
    ...samplePRPayload,
    pull_request: {
      ...samplePRPayload.pull_request,
      user: {
        login: 'renovate[bot]',
        type: 'User',
      },
    },
  };
  const botStr = JSON.stringify(botPayload);
  const botDelivery = `test-real-bot-${Date.now()}`;
  const botReq = new NextRequest('http://localhost:3000/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-github-delivery': botDelivery,
      'x-hub-signature-256': signPayload(botStr, TEST_SECRET),
    },
    body: botStr,
  });
  const botRes = await POST(botReq);
  assert.equal(botRes.status, 202);
  const botData = await botRes.json();
  // Must be skipped as a bot author
  assert.match(botData.message, /Bot PR skipped/i);
});

test('webhook rejects oversized payload exceeding 10MB with 413', async () => {
  const deliveryId = `test-oversized-${Date.now()}`;
  // Simulate oversized payload via Content-Length header
  const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-github-delivery': deliveryId,
      'content-length': String(15 * 1024 * 1024), // 15MB
    },
    body: '{}',
  });

  const res = await POST(req);
  assert.equal(res.status, 413);
  const data = await res.json();
  assert.match(data.error, /Payload too large/i);
});

test('webhook rejects malformed X-GitHub-Delivery header with 400', async () => {
  const payloadStr = JSON.stringify(samplePRPayload);
  const signature = signPayload(payloadStr, TEST_SECRET);

  const maliciousDeliveryIds = [
    '../../../etc/passwd',
    'id with spaces',
    'invalid!@#$%',
    'a'.repeat(200),
  ];

  for (const badId of maliciousDeliveryIds) {
    const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': badId,
        'x-hub-signature-256': signature,
      },
      body: payloadStr,
    });

    const res = await POST(req);
    assert.equal(res.status, 400, `Expected 400 for delivery ID: ${badId}`);
    const data = await res.json();
    assert.match(data.error, /Invalid or missing X-GitHub-Delivery/i);
  }
});


