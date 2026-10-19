import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { POST } from './route.js';
import { setSessionInstallationIdsOverride } from '@/lib/auth-helpers';

test('Retry endpoint: conditional update, idempotency guard, and resolvedAt semantics (Item 22)', async (t) => {
  if (!(await isDatabaseAvailable())) {
    t.skip('PostgreSQL database not available');
    return;
  }
  const installationId = BigInt(998877);
  let inst: any;
  let repo: any;
  let pr: any;
  let failedReview: any;

  before(async () => {
    setSessionInstallationIdsOverride(async () => [installationId]);
    // Set up test installation, repo, pr, and failed_review
    inst = await prisma.installation.upsert({
      where: { githubInstallationId: installationId },
      update: {},
      create: {
        githubInstallationId: installationId,
        accountLogin: 'retry-test-org',
        accountType: 'Organization',
      },
    });

    repo = await prisma.repository.upsert({
      where: { githubRepoId: BigInt(888123) },
      update: {},
      create: {
        githubRepoId: BigInt(888123),
        fullName: 'retry-test-org/retry-test-repo',
        installationId: inst.id,
      },
    });

    pr = await prisma.pullRequest.upsert({
      where: {
        repositoryId_githubPrNumber: {
          repositoryId: repo.id,
          githubPrNumber: 77,
        },
      },
      update: {},
      create: {
        repositoryId: repo.id,
        githubPrNumber: 77,
        title: 'Retry Test PR',
        author: 'developer',
        headSha: 'abc1234567890abcdef1234567890abcdef1234',
        state: 'open',
      },
    });

    // Create a failed review
    failedReview = await prisma.failedReview.create({
      data: {
        pullRequest: { connect: { id: pr.id } },
        commitSha: pr.headSha,
        errorMessage: 'Temporary LLM outage',
        jobData: {
          installationId: Number(installationId),
          repoFullName: repo.fullName,
          prNumber: pr.githubPrNumber,
          commitSha: pr.headSha,
          title: pr.title,
          author: pr.author,
        },
      },
    });
  });

  after(async () => {
    if (failedReview) {
      await prisma.failedReview.deleteMany({ where: { pullRequestId: pr.id } });
    }
    if (pr) {
      await prisma.pullRequest.deleteMany({ where: { id: pr.id } });
    }
    if (repo) {
      await prisma.repository.deleteMany({ where: { id: repo.id } });
    }
    if (inst) {
      await prisma.installation.deleteMany({ where: { id: inst.id } });
    }
    setSessionInstallationIdsOverride(null);
  });

  await t.test('enqueues exactly one retry, sets jobId, and leaves resolvedAt null until worker completes', async () => {
    const req = new NextRequest(`http://localhost:3000/api/failed-reviews/${failedReview.id}/retry`, {
      method: 'POST',
    });

    // Mock auth: next-auth session helper gets session installation IDs
    // In our test environment getSessionInstallationIds can be stubbed or env simulated
    // The route checks: failedReview.pullRequest?.repository?.installation?.githubInstallationId
    // Let's call the POST handler
    const res = await POST(req, { params: { id: String(failedReview.id) } });
    const json = await res.json();

    // Verify response
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(json)}`);
    assert.equal(json.success, true);
    assert.ok(json.newJobId, 'Response should contain newJobId');

    // Check DB state:
    const updated = await prisma.failedReview.findUnique({
      where: { id: failedReview.id },
    });

    assert.ok(updated, 'Failed review must exist');
    assert.equal(updated!.jobId, json.newJobId, 'jobId must be set to retry job ID');
    assert.equal(updated!.resolvedAt, null, 'resolvedAt MUST remain null at enqueue time (Item 22)');
  });

  await t.test('second concurrent retry is rejected with 409 Conflict', async () => {
    const req = new NextRequest(`http://localhost:3000/api/failed-reviews/${failedReview.id}/retry`, {
      method: 'POST',
    });

    const res = await POST(req, { params: { id: String(failedReview.id) } });
    assert.equal(res.status, 409, 'Second retry must be rejected with 409 Conflict');

    const json = await res.json();
    assert.ok(json.error.includes('already in progress') || json.error.includes('resolved'));
  });

  await t.test('already resolved failure cannot be retried (409 Conflict)', async () => {
    // Manually mark another failure as resolved
    const resolvedFailure = await prisma.failedReview.create({
      data: {
        pullRequest: { connect: { id: pr.id } },
        commitSha: pr.headSha,
        errorMessage: 'Old resolved error',
        jobData: {
          installationId: Number(installationId),
          repoFullName: repo.fullName,
          prNumber: pr.githubPrNumber,
          commitSha: pr.headSha,
        },
        resolvedAt: new Date(),
      },
    });

    const req = new NextRequest(`http://localhost:3000/api/failed-reviews/${resolvedFailure.id}/retry`, {
      method: 'POST',
    });

    const res = await POST(req, { params: { id: String(resolvedFailure.id) } });
    assert.equal(res.status, 409, 'Resolved failure must be rejected with 409 Conflict');

    await prisma.failedReview.delete({ where: { id: resolvedFailure.id } });
  });
});
