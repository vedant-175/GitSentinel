import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import {
  assertInstallationAccess,
  assertPullRequestAccess,
  assertReviewAccess,
  resolveUserInstallations,
  getUserRoleForInstallation,
  clearInstallationAccessCache,
  ForbiddenError,
} from './auth-helpers';
import { acquireDeliveryLock, markDeliveryDone, releaseDeliveryLock } from './queue';
import { POST as webhookHandler } from '../app/api/webhooks/github/route';
import { POST as filesHandler } from '../app/api/repositories/files/route';
import { processReviewJob } from '../../worker/src/review/pipeline';

function createHmacSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payload).digest('hex');
}

test('Phase 4: GitHub Integration & Tenant Isolation Suite', async (t) => {
  t.beforeEach(() => {
    clearInstallationAccessCache();
  });

  t.afterEach(() => {
    clearInstallationAccessCache();
  });

  // =========================================================================
  // 1. Identity & Installation Authorization Tests
  // =========================================================================

  await t.test('1. Insecure username fallback removal: matching username alone does NOT grant installation access', async () => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }

    const timestamp = Date.now();
    const victimLogin = `victim-${timestamp}`;

    // Create an installation belonging to victim
    const inst = await prisma.installation.create({
      data: {
        githubInstallationId: BigInt(8100000 + (timestamp % 10000)),
        accountLogin: victimLogin,
        accountType: 'User',
      },
    });

    try {
      // Attacker registers or crafts a session with victim's username, but has NO OAuth token or dev installationIds
      const attackerSession = {
        user: {
          id: `attacker-${timestamp}`,
          login: victimLogin, // Matching username string!
        },
      };

      const accessibleIds = await resolveUserInstallations(attackerSession);

      // Access MUST be empty: matching username alone cannot grant installation access!
      assert.equal(accessibleIds.length, 0, 'Matching username alone must never grant installation access');
    } finally {
      await prisma.installation.deleteMany({ where: { id: inst.id } });
    }
  });

  await t.test('2. Forged usernames cannot gain installation ownership in getUserRoleForInstallation', async () => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }

    const timestamp = Date.now();
    const orgLogin = `acme-corp-${timestamp}`;

    // Create Organization Installation
    const orgInst = await prisma.installation.create({
      data: {
        githubInstallationId: BigInt(8200000 + (timestamp % 10000)),
        accountLogin: orgLogin,
        accountType: 'Organization',
      },
    });

    try {
      // User with the same username as the organization
      const maliciousSession = {
        user: {
          id: `user-${timestamp}`,
          login: orgLogin,
        },
      };

      const role = await getUserRoleForInstallation(maliciousSession, orgInst.githubInstallationId);
      // Organization account login matching is strictly forbidden: must NOT return OWNER!
      assert.notEqual(role, 'OWNER', 'User with matching organization login must never be granted OWNER');
      assert.equal(role, 'REVIEWER', 'Authorized member defaults to REVIEWER without explicit membership');
    } finally {
      await prisma.installation.deleteMany({ where: { id: orgInst.id } });
    }
  });

  await t.test('3. Cache key isolation: distinct user IDs do not share cached installation access', async () => {
    clearInstallationAccessCache();

    let fetchCountUser1 = 0;
    const mockFetchUser1 = (async () => {
      fetchCountUser1++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total_count: 1,
          installations: [{ id: 1001 }],
        }),
      } as any;
    }) as typeof fetch;

    let fetchCountUser2 = 0;
    const mockFetchUser2 = (async () => {
      fetchCountUser2++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total_count: 1,
          installations: [{ id: 2002 }],
        }),
      } as any;
    }) as typeof fetch;

    const sessionUser1 = {
      accessToken: 'token-1',
      user: { id: 'user-id-1', login: 'alice' },
    };

    const sessionUser2 = {
      accessToken: 'token-2',
      user: { id: 'user-id-2', login: 'bob' },
    };

    // Populate user 1 cache
    await resolveUserInstallations(sessionUser1, 10000, mockFetchUser1);
    assert.equal(fetchCountUser1, 1);

    // Call user 2: must NOT use user 1's cache
    await resolveUserInstallations(sessionUser2, 10000, mockFetchUser2);
    assert.equal(fetchCountUser2, 1, 'User 2 must execute its own resolution and not hit User 1 cache');

    // Call user 1 again: must hit cache
    await resolveUserInstallations(sessionUser1, 10000, mockFetchUser1);
    assert.equal(fetchCountUser1, 1, 'User 1 must use its own cached resolution');
  });

  await t.test('4. Token revocation handling: 401 from GitHub immediately purges cache and returns empty list', async () => {
    clearInstallationAccessCache();

    let callCount = 0;
    const mockFetch = (async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            total_count: 1,
            installations: [{ id: 5001 }],
          }),
        } as any;
      }
      // Second call: GitHub token has been revoked by user!
      return {
        ok: false,
        status: 401,
        json: async () => ({ message: 'Bad credentials' }),
      } as any;
    }) as typeof fetch;

    const session = {
      accessToken: 'gho_revoked_token',
      user: { id: 'user-revoked-test', login: 'charlie' },
    };

    // First call (with 0ms TTL to force refresh on next call)
    await resolveUserInstallations(session, 0, mockFetch);
    assert.equal(callCount, 1);

    // Second call with revoked token (401)
    const resultAfterRevocation = await resolveUserInstallations(session, 0, mockFetch);
    assert.equal(callCount, 2);
    assert.deepEqual(resultAfterRevocation, [], 'Revoked token must fail closed and return empty array');
  });

  // =========================================================================
  // 2. Repository-Level Authorization & Tenancy
  // =========================================================================

  await t.test('5. Cross-tenant repository access rejection', async () => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }

    const timestamp = Date.now();

    const instA = await prisma.installation.create({
      data: {
        githubInstallationId: BigInt(8300000 + (timestamp % 10000)),
        accountLogin: `org-a-${timestamp}`,
        accountType: 'Organization',
      },
    });

    const instB = await prisma.installation.create({
      data: {
        githubInstallationId: BigInt(8400000 + (timestamp % 10000)),
        accountLogin: `org-b-${timestamp}`,
        accountType: 'Organization',
      },
    });

    const repoB = await prisma.repository.create({
      data: {
        installationId: instB.id,
        githubRepoId: BigInt(8500000 + (timestamp % 10000)),
        fullName: `org-b-${timestamp}/secret-repo`,
        defaultBranch: 'main',
      },
    });

    try {
      // User belongs to Installation A
      const userAInstallations = [instA.githubInstallationId];

      // User A tries to access Repo B
      await assert.rejects(
        async () => {
          await assertInstallationAccess(repoB.id, userAInstallations);
        },
        (err: any) => {
          assert.ok(err instanceof ForbiddenError);
          assert.match(err.message, /Access denied to repository/);
          return true;
        }
      );
    } finally {
      await prisma.repository.deleteMany({ where: { id: repoB.id } });
      await prisma.installation.deleteMany({ where: { id: { in: [instA.id, instB.id] } } });
    }
  });

  await t.test('6. Repository files route rejects path traversal and invalid repo names', async () => {
    // 1. Invalid repo name format (not owner/repo)
    const invalidNameReq = new NextRequest('http://localhost:3000/api/repositories/files', {
      method: 'POST',
      body: JSON.stringify({ repoFullName: 'invalid-repo-without-slash' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res1 = await filesHandler(invalidNameReq);
    assert.equal(res1.status, 400);

    // 2. Path traversal in path
    const pathTraversalReq = new NextRequest('http://localhost:3000/api/repositories/files', {
      method: 'POST',
      body: JSON.stringify({
        repoFullName: 'legit-org/legit-repo',
        path: '../../../etc/passwd',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res2 = await filesHandler(pathTraversalReq);
    assert.equal(res2.status, 400);
  });

  // =========================================================================
  // 3. Webhook Security: Signatures & Delivery Deduplication
  // =========================================================================

  await t.test('7. Webhook signature validation: invalid or missing HMAC is rejected with 401', async () => {
    process.env.GITHUB_WEBHOOK_SECRET = 'test-secret-key-12345678901234567890';

    const rawPayload = JSON.stringify({ action: 'ping' });

    // 1. Missing signature
    const reqMissing = new NextRequest('http://localhost:3000/api/webhooks/github', {
      method: 'POST',
      body: rawPayload,
      headers: {
        'x-github-event': 'ping',
        'x-github-delivery': `del-test-${Date.now()}-1`,
      },
    });
    const resMissing = await webhookHandler(reqMissing);
    assert.equal(resMissing.status, 401, 'Missing signature must return 401');

    // 2. Invalid signature
    const reqInvalid = new NextRequest('http://localhost:3000/api/webhooks/github', {
      method: 'POST',
      body: rawPayload,
      headers: {
        'x-github-event': 'ping',
        'x-github-delivery': `del-test-${Date.now()}-2`,
        'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      },
    });
    const resInvalid = await webhookHandler(reqInvalid);
    assert.equal(resInvalid.status, 401, 'Tampered signature must return 401');
  });

  await t.test('8. Duplicate webhook delivery deduplication: duplicate delivery skipped with 202', async () => {
    const testDeliveryId = `dedup-test-${Date.now()}`;

    // First acquisition: 'new'
    const lock1 = await acquireDeliveryLock(testDeliveryId);
    assert.equal(lock1, 'new');

    // Mark delivery done
    await markDeliveryDone(testDeliveryId);

    // Second acquisition: 'already_done'
    const lock2 = await acquireDeliveryLock(testDeliveryId);
    assert.equal(lock2, 'already_done', 'Duplicate delivery must be recognized as already_done');

    // Clean up
    await releaseDeliveryLock(testDeliveryId);
  });

  // =========================================================================
  // 4. Worker Queue & Tenant Isolation
  // =========================================================================

  await t.test('9. Worker tenant isolation: job with mismatched repo and installation ID is rejected', async () => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }

    const timestamp = Date.now();

    // Installation A
    const instA = await prisma.installation.create({
      data: {
        githubInstallationId: BigInt(8600000 + (timestamp % 10000)),
        accountLogin: `tenant-a-${timestamp}`,
        accountType: 'Organization',
      },
    });

    // Repo A belongs to Installation A
    const repoA = await prisma.repository.create({
      data: {
        installationId: instA.id,
        githubRepoId: BigInt(8700000 + (timestamp % 10000)),
        fullName: `tenant-a-${timestamp}/repo-a`,
        defaultBranch: 'main',
      },
    });

    try {
      // Job crafted with Repo A, but Installation B's ID (88888888)
      const forgedJobData: any = {
        type: 'review-pr',
        installationId: 88888888, // Mismatched installation ID!
        repoId: repoA.id,
        githubRepoId: Number(repoA.githubRepoId),
        prNumber: 1,
        commitSha: 'abcdef1234567890',
        repoFullName: repoA.fullName,
      };

      // Worker must reject the job due to tenant isolation invariant
      await assert.rejects(
        async () => {
          await processReviewJob(forgedJobData);
        },
        (err: any) => {
          assert.match(err.message, /Tenant isolation violation/);
          return true;
        }
      );
    } finally {
      await prisma.repository.deleteMany({ where: { id: repoA.id } });
      await prisma.installation.deleteMany({ where: { id: instA.id } });
    }
  });

  t.after(() => {
    setTimeout(() => process.exit(0), 100);
  });
});
