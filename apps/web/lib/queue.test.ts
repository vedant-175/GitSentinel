import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateDelivery, redisProducerConnection, reviewQueue, enqueueReviewJob } from './queue.js';
import { isPortReachable } from '@ai-reviewer/shared';

test('deduplicateDelivery returns true for new delivery and false for duplicate delivery', async (t) => {
  if (!await isPortReachable(6379)) {
    t.skip('Redis (6379) not reachable');
    return;
  }
  const deliveryId = `test-delivery-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // First check should succeed (new delivery)
  const isFirst = await deduplicateDelivery(deliveryId, 60);
  assert.equal(isFirst, true);

  // Second check with same delivery ID should fail (duplicate)
  const isDuplicate = await deduplicateDelivery(deliveryId, 60);
  assert.equal(isDuplicate, false);
});

test('enqueueReviewJob creates job with deterministic ID', async (t) => {
  if (!await isPortReachable(6379)) {
    t.skip('Redis (6379) not reachable');
    return;
  }
  const mockData = {
    deliveryId: 'del-123',
    installationId: 101,
    githubRepoId: 9999,
    prNumber: 42,
    commitSha: 'abcdef1234567890abcdef',
    title: 'Test PR',
    repoFullName: 'owner/test-repo',
    receivedAt: Date.now(),
  };

  const expectedJobId = `review-9999-42-abcdef1234`;
  const jobId = await enqueueReviewJob(mockData);
  assert.equal(jobId, expectedJobId);

  // Clean up test job safely
  const job = await reviewQueue.getJob(expectedJobId);
  if (job) {
    await job.remove().catch(() => {});
  }
});

after(async () => {
  try {
    await redisProducerConnection.quit();
    await reviewQueue.close();
  } catch {
    // Ignore close errors
  }
});


