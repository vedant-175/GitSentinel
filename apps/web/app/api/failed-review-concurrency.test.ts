import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { POST as retryFailedReview } from './failed-reviews/[id]/retry/route.js';
import { GET as inspectFailedReview, PATCH as resolveFailedReview } from './failed-reviews/[id]/route.js';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
} from '@/lib/auth-helpers';

describe('Dead Letter Queue & Retry Idempotency Test Suite (Phase 3 Requirement 6)', () => {
  const testInstId = BigInt(889900);
  let dbInst: any;
  let dbRepo: any;
  let dbPr: any;
  let failedReview: any;

  before(async () => {
    if (!(await isDatabaseAvailable())) return;
    dbInst = await prisma.installation.upsert({
      where: { githubInstallationId: testInstId },
      update: {},
      create: {
        githubInstallationId: testInstId,
        accountLogin: 'retry-race-org',
        accountType: 'Organization',
      },
    });

    dbRepo = await prisma.repository.upsert({
      where: { githubRepoId: BigInt(998811) },
      update: {},
      create: {
        installationId: dbInst.id,
        githubRepoId: BigInt(998811),
        fullName: 'retry-race-org/repo-race',
      },
    });

    await prisma.failedReview.deleteMany({
      where: { pullRequest: { repositoryId: dbRepo.id } },
    });
    await prisma.pullRequest.deleteMany({
      where: { repositoryId: dbRepo.id },
    });

    dbPr = await prisma.pullRequest.create({
      data: {
        repositoryId: dbRepo.id,
        githubPrNumber: 777,
        title: 'PR for Retry Race Condition Testing',
        author: 'race-tester',
        headSha: 'sha-race-condition-11111111',
      },
    });

    failedReview = await prisma.failedReview.create({
      data: {
        pullRequestId: dbPr.id,
        commitSha: 'sha-race-condition-11111111',
        errorMessage: 'Network ETIMEDOUT contacting LLM service',
        errorStack: 'Error: Network ETIMEDOUT\n  at fakeCall (worker.ts:42:1)',
        jobId: 'review-original-1234',
        jobData: {
          type: 'review-pr',
          installationId: Number(testInstId),
          repoId: dbRepo.id,
          githubRepoId: 998811,
          prNumber: 777,
          commitSha: 'sha-race-condition-11111111',
          repoFullName: 'retry-race-org/repo-race',
        },
      },
    });
  });

  after(async () => {
    if (await isDatabaseAvailable()) {
      if (failedReview) {
        await prisma.failedReview.deleteMany({ where: { id: failedReview.id } });
      }
      if (dbPr) {
        await prisma.pullRequest.deleteMany({ where: { id: dbPr.id } });
      }
      if (dbRepo) {
        await prisma.repository.deleteMany({ where: { id: dbRepo.id } });
      }
      if (dbInst) {
        await prisma.installation.deleteMany({ where: { id: dbInst.id } });
      }
    }
    setSessionOverride(null);
    setSessionInstallationIdsOverride(null);
  });

  it('allows failed review inspection via GET /api/failed-reviews/[id]', async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    setSessionOverride(async () => ({ user: { name: 'race-tester' } }));
    setSessionInstallationIdsOverride(async () => [testInstId]);

    const req = new NextRequest(`http://localhost:3000/api/failed-reviews/${failedReview.id}`);
    const res = await inspectFailedReview(req, { params: { id: String(failedReview.id) } });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, failedReview.id);
    assert.equal(body.errorMessage, 'Network ETIMEDOUT contacting LLM service');
    assert.ok(body.errorStack.includes('ETIMEDOUT'));
    assert.ok(body.jobData);
  });

  it('guarantees atomic concurrency: two simultaneous retry requests yield exactly 1 success and 1 conflict (409)', async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    setSessionOverride(async () => ({ user: { name: 'race-tester' } }));
    setSessionInstallationIdsOverride(async () => [testInstId]);

    const reqA = new NextRequest(`http://localhost:3000/api/failed-reviews/${failedReview.id}/retry`, {
      method: 'POST',
    });
    const reqB = new NextRequest(`http://localhost:3000/api/failed-reviews/${failedReview.id}/retry`, {
      method: 'POST',
    });

    // Fire both requests concurrently
    const [resA, resB] = await Promise.all([
      retryFailedReview(reqA, { params: { id: String(failedReview.id) } }),
      retryFailedReview(reqB, { params: { id: String(failedReview.id) } }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(
      statuses,
      [200, 409],
      `Expected exactly one 200 and one 409 Conflict, but got: [${resA.status}, ${resB.status}]`
    );

    const successRes = resA.status === 200 ? resA : resB;
    const conflictRes = resA.status === 409 ? resA : resB;

    const successBody = await successRes.json();
    assert.equal(successBody.success, true);
    assert.ok(successBody.newJobId.startsWith(`review-retry-${failedReview.id}-`));

    const conflictBody = await conflictRes.json();
    assert.ok(
      conflictBody.error.includes('already in progress') || conflictBody.error.includes('resolved')
    );
  });

  it('allows manual resolution via PATCH and subsequent retries are rejected', async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    setSessionOverride(async () => ({ user: { name: 'race-tester' } }));
    setSessionInstallationIdsOverride(async () => [testInstId]);

    // Manually mark resolved
    const patchReq = new NextRequest(`http://localhost:3000/api/failed-reviews/${failedReview.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ resolved: true }),
    });
    const patchRes = await resolveFailedReview(patchReq, { params: { id: String(failedReview.id) } });

    assert.equal(patchRes.status, 200);
    const patchedBody = await patchRes.json();
    assert.ok(patchedBody.resolvedAt !== null, 'resolvedAt must be populated');

    // Attempt retry on resolved review
    const retryReq = new NextRequest(`http://localhost:3000/api/failed-reviews/${failedReview.id}/retry`, {
      method: 'POST',
    });
    const retryRes = await retryFailedReview(retryReq, { params: { id: String(failedReview.id) } });

    assert.equal(retryRes.status, 409);
    const retryBody = await retryRes.json();
    assert.ok(retryBody.error.includes('already been resolved'));
  });
});
