import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import {
  assertInstallationAccess,
  assertPullRequestAccess,
  assertReviewAccess,
  assertRepoBelongsToInstallation,
  resolveUserInstallations,
  clearInstallationAccessCache,
  ForbiddenError,
} from './auth-helpers';

test('auth isolation: a user cannot read another installation repository, pull request, or review', async (t) => {
  if (!(await isDatabaseAvailable())) {
    t.skip('PostgreSQL database not available');
    return;
  }
  const timestamp = Date.now();

  // Create Installation A (Tenant A)
  const instA = await prisma.installation.create({
    data: {
      githubInstallationId: BigInt(8000000 + (timestamp % 10000)),
      accountLogin: `tenant-a-${timestamp}`,
      accountType: 'Organization',
    },
  });

  // Create Installation B (Tenant B)
  const instB = await prisma.installation.create({
    data: {
      githubInstallationId: BigInt(9000000 + (timestamp % 10000)),
      accountLogin: `tenant-b-${timestamp}`,
      accountType: 'Organization',
    },
  });

  // Create Repo B belonging to Tenant B
  const repoB = await prisma.repository.create({
    data: {
      installationId: instB.id,
      githubRepoId: BigInt(9500000 + (timestamp % 10000)),
      fullName: `tenant-b-${timestamp}/private-repo-b`,
      defaultBranch: 'main',
    },
  });

  // Create PR B belonging to Tenant B
  const prB = await prisma.pullRequest.create({
    data: {
      repositoryId: repoB.id,
      githubPrNumber: 1,
      title: 'Secret Tenant B Feature',
      author: 'bob-tenant-b',
      state: 'open',
      headSha: `sha-b-${timestamp}`,
    },
  });

  // Create Review B belonging to Tenant B
  const reviewB = await prisma.review.create({
    data: {
      pullRequestId: prB.id,
      commitSha: `sha-b-${timestamp}`,
      status: 'completed',
    },
  });

  // Tenant A's session has access ONLY to Installation A
  const tenantAInstallationIds = [instA.githubInstallationId];

  // 1. Tenant A tries to access Tenant B's Repository -> MUST FAIL with ForbiddenError
  await assert.rejects(
    async () => {
      await assertInstallationAccess(repoB.id, tenantAInstallationIds);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /Access denied to repository/);
      return true;
    }
  );

  // 2. Tenant A tries to access Tenant B's Pull Request -> MUST FAIL with ForbiddenError
  await assert.rejects(
    async () => {
      await assertPullRequestAccess(prB.id, tenantAInstallationIds);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /Access denied to pull request/);
      return true;
    }
  );

  // 3. Tenant A tries to access Tenant B's Review -> MUST FAIL with ForbiddenError
  await assert.rejects(
    async () => {
      await assertReviewAccess(reviewB.id, tenantAInstallationIds);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /Access denied to review/);
      return true;
    }
  );

  // 4. Session with empty installations -> MUST FAIL with ForbiddenError
  await assert.rejects(
    async () => {
      await assertInstallationAccess(repoB.id, []);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /No accessible installations/);
      return true;
    }
  );

  // 5. Tenant B accessing Tenant B's own data -> SUCCEEDS
  const tenantBInstallationIds = [instB.githubInstallationId];
  const fetchedRepo = await assertInstallationAccess(repoB.id, tenantBInstallationIds);
  assert.equal(fetchedRepo.id, repoB.id);

  const fetchedPR = await assertPullRequestAccess(prB.id, tenantBInstallationIds);
  assert.equal(fetchedPR.id, prB.id);

  const fetchedReview = await assertReviewAccess(reviewB.id, tenantBInstallationIds);
  assert.equal(fetchedReview.id, reviewB.id);
});

test('Item 5: unique (installation_id, repo_id) constraint and preventing reassignment on update', async (t) => {
  if (!(await isDatabaseAvailable())) {
    t.skip('PostgreSQL database not available');
    return;
  }
  const timestamp = Date.now();

  const inst1 = await prisma.installation.create({
    data: {
      githubInstallationId: BigInt(7100000 + (timestamp % 10000)),
      accountLogin: `tenant-orig-${timestamp}`,
      accountType: 'User',
    },
  });

  const inst2 = await prisma.installation.create({
    data: {
      githubInstallationId: BigInt(7200000 + (timestamp % 10000)),
      accountLogin: `tenant-other-${timestamp}`,
      accountType: 'User',
    },
  });

  const repo = await prisma.repository.create({
    data: {
      installationId: inst1.id,
      githubRepoId: BigInt(7300000 + (timestamp % 10000)),
      fullName: `tenant-orig-${timestamp}/locked-repo`,
      defaultBranch: 'main',
    },
  });

  // 1. assertRepoBelongsToInstallation passes for original installation
  await assert.doesNotReject(async () => {
    await assertRepoBelongsToInstallation(inst1.id, repo.id);
    await assertRepoBelongsToInstallation(inst1.githubInstallationId, repo.id);
  });

  // 2. assertRepoBelongsToInstallation fails for another installation
  await assert.rejects(
    async () => {
      await assertRepoBelongsToInstallation(inst2.id, repo.id);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /does not belong to installation/);
      return true;
    }
  );

  // 3. Attempting to insert duplicate (installationId, githubRepoId) violates unique constraint
  await assert.rejects(
    async () => {
      await prisma.repository.create({
        data: {
          installationId: inst1.id,
          githubRepoId: repo.githubRepoId,
          fullName: 'duplicate-attempt',
          defaultBranch: 'main',
        },
      });
    },
    (err: any) => {
      // Prisma P2002 is Unique constraint failed
      assert.equal(err.code, 'P2002');
      return true;
    }
  );

  // 4. Updating repository never reassigns installationId
  const updatedRepo = await prisma.repository.update({
    where: { id: repo.id },
    data: {
      fullName: `tenant-orig-${timestamp}/locked-repo-renamed`,
      defaultBranch: 'develop',
    },
  });

  assert.equal(updatedRepo.installationId, inst1.id);
  assert.notEqual(updatedRepo.installationId, inst2.id);
});

test('Item 5: two users with colliding numeric IDs cannot see each other data', async (t) => {
  if (!(await isDatabaseAvailable())) {
    t.skip('PostgreSQL database not available');
    return;
  }
  const timestamp = Date.now();

  // Both User A and User B have the EXACT SAME colliding numeric ID (e.g., 4200042)
  const collidingNumericUserId = 4200042;

  // Tenant 1 Installation & Data
  const inst1 = await prisma.installation.create({
    data: {
      githubInstallationId: BigInt(timestamp) * 1000n + 1n,
      accountLogin: `user1-${timestamp}`,
      accountType: 'User',
    },
  });

  const repo1 = await prisma.repository.create({
    data: {
      installationId: inst1.id,
      githubRepoId: BigInt(timestamp) * 1000n + 2n,
      fullName: `user1-${timestamp}/repo-1`,
      defaultBranch: 'main',
    },
  });

  const pr1 = await prisma.pullRequest.create({
    data: {
      repositoryId: repo1.id,
      githubPrNumber: 101,
      title: 'User 1 Confidential Work',
      author: `user1-${timestamp}`,
      state: 'open',
    },
  });

  const review1 = await prisma.review.create({
    data: {
      pullRequestId: pr1.id,
      commitSha: `sha1-${timestamp}`,
      status: 'completed',
    },
  });

  // Tenant 2 Installation & Data
  const inst2 = await prisma.installation.create({
    data: {
      githubInstallationId: BigInt(timestamp) * 1000n + 3n,
      accountLogin: `user2-${timestamp}`,
      accountType: 'User',
    },
  });

  const repo2 = await prisma.repository.create({
    data: {
      installationId: inst2.id,
      githubRepoId: BigInt(timestamp) * 1000n + 4n,
      fullName: `user2-${timestamp}/repo-2`,
      defaultBranch: 'main',
    },
  });

  const pr2 = await prisma.pullRequest.create({
    data: {
      repositoryId: repo2.id,
      githubPrNumber: 202,
      title: 'User 2 Confidential Work',
      author: `user2-${timestamp}`,
      state: 'open',
    },
  });

  const review2 = await prisma.review.create({
    data: {
      pullRequestId: pr2.id,
      commitSha: `sha2-${timestamp}`,
      status: 'completed',
    },
  });

  // User 1 session: numeric ID is collidingNumericUserId, but accessible installations resolved via GitHub App webhooks is [inst1]
  const user1Session = {
    userId: collidingNumericUserId,
    installationIds: [inst1.githubInstallationId],
  };

  // User 2 session: SAME numeric ID collidingNumericUserId, but accessible installations resolved via GitHub App webhooks is [inst2]
  const user2Session = {
    userId: collidingNumericUserId,
    installationIds: [inst2.githubInstallationId],
  };

  // 1. User 1 cannot access User 2's repository
  await assert.rejects(
    async () => {
      await assertInstallationAccess(repo2.id, user1Session.installationIds);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /Access denied to repository/);
      return true;
    }
  );

  // 2. User 1 cannot access User 2's pull request
  await assert.rejects(
    async () => {
      await assertPullRequestAccess(pr2.id, user1Session.installationIds);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /Access denied to pull request/);
      return true;
    }
  );

  // 3. User 1 cannot access User 2's review
  await assert.rejects(
    async () => {
      await assertReviewAccess(review2.id, user1Session.installationIds);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /Access denied to review/);
      return true;
    }
  );

  // 4. User 2 cannot access User 1's repository
  await assert.rejects(
    async () => {
      await assertInstallationAccess(repo1.id, user2Session.installationIds);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /Access denied to repository/);
      return true;
    }
  );

  // 5. User 2 cannot access User 1's pull request
  await assert.rejects(
    async () => {
      await assertPullRequestAccess(pr1.id, user2Session.installationIds);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /Access denied to pull request/);
      return true;
    }
  );

  // 6. User 2 cannot access User 1's review
  await assert.rejects(
    async () => {
      await assertReviewAccess(review1.id, user2Session.installationIds);
    },
    (err: any) => {
      assert.ok(err instanceof ForbiddenError);
      assert.match(err.message, /Access denied to review/);
      return true;
    }
  );

  // 7. Each user can successfully access their own data
  const okRepo1 = await assertInstallationAccess(repo1.id, user1Session.installationIds);
  assert.equal(okRepo1.id, repo1.id);
  const okPr1 = await assertPullRequestAccess(pr1.id, user1Session.installationIds);
  assert.equal(okPr1.id, pr1.id);
  const okReview1 = await assertReviewAccess(review1.id, user1Session.installationIds);
  assert.equal(okReview1.id, review1.id);

  const okRepo2 = await assertInstallationAccess(repo2.id, user2Session.installationIds);
  assert.equal(okRepo2.id, repo2.id);
  const okPr2 = await assertPullRequestAccess(pr2.id, user2Session.installationIds);
  assert.equal(okPr2.id, pr2.id);
  const okReview2 = await assertReviewAccess(review2.id, user2Session.installationIds);
  assert.equal(okReview2.id, review2.id);
});

test('Item 6: installation access is refreshed at a fixed interval and cross-references DB installations', async (t) => {
  if (!(await isDatabaseAvailable())) {
    t.skip('PostgreSQL database not available');
    return;
  }
  const timestamp = Date.now();
  clearInstallationAccessCache();

  // Create real installation in DB (from GitHub App webhook)
  const webhookInst = await prisma.installation.create({
    data: {
      githubInstallationId: BigInt(9100000 + (timestamp % 10000)),
      accountLogin: `webhook-user-${timestamp}`,
      accountType: 'User',
    },
  });

  const session = {
    accessToken: 'gho_valid_oauth_token',
    user: {
      id: `user-${timestamp}`,
      login: `webhook-user-${timestamp}`,
    },
  };

  let fetchCallCount = 0;
  // Mock fetch simulating GitHub /user/installations returning 2 installations:
  // - webhookInst.githubInstallationId (which exists in DB)
  // - 9999999 (which does NOT exist in DB, e.g. installed on another app or not yet synced)
  const mockFetch = (async () => {
    fetchCallCount++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        total_count: 2,
        installations: [
          { id: Number(webhookInst.githubInstallationId) },
          { id: 9999999 }, // Fabricated / external ID not in DB
        ],
      }),
    } as any;
  }) as typeof fetch;

  // 1. Initial resolution: calls GitHub API, filters out 9999999, only returns webhookInst
  const ids1 = await resolveUserInstallations(session, 100, mockFetch);
  assert.equal(fetchCallCount, 1);
  assert.equal(ids1.length, 1);
  assert.equal(ids1[0], webhookInst.githubInstallationId);

  // 2. Second call within refreshIntervalMs (100ms) -> uses cached result, DOES NOT call fetch
  const ids2 = await resolveUserInstallations(session, 100, mockFetch);
  assert.equal(fetchCallCount, 1);
  assert.deepEqual(ids2, ids1);

  // 3. Wait for refresh interval to expire (wait 110ms)
  await new Promise((resolve) => setTimeout(resolve, 110));

  // 4. Third call after expiration -> refreshes against GitHub API and DB
  const ids3 = await resolveUserInstallations(session, 100, mockFetch);
  assert.equal(fetchCallCount, 2);
  assert.deepEqual(ids3, ids1);
});


