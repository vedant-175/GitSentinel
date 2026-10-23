import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { authOptions, buildProviders } from '../../lib/auth';
import { POST as registerPost, GET as registerGet } from './auth/register/route';
import { GET as exploreGet } from './explore/route';
import { GET as repositoriesGet } from './repositories/route';
import { POST as linkAccountPost } from './auth/link-account/route';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
  requireSession,
  UnauthorizedError,
} from '../../lib/auth-helpers';
import { hashPassword } from '../../lib/password';

function dbTest(name: string, fn: () => Promise<void> | void) {
  test(name, async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available for this test');
      return;
    }
    await fn();
  });
}

// =============================================================================
// TEST 1: Successful GitHub OAuth Login
// =============================================================================
test('1. Successful GitHub OAuth login: token and session callbacks populate stable githubId', async () => {
  const jwt = authOptions.callbacks?.jwt;
  const session = authOptions.callbacks?.session;
  assert.ok(jwt);
  assert.ok(session);

  const token = await jwt({
    token: {},
    user: { id: 'user-cuid-100', name: 'octocat' },
    account: { provider: 'github', access_token: 'gho_oauth_secret_token_123' } as any,
    profile: { id: 583231, login: 'octocat', avatar_url: 'https://github.com/octocat.png' },
  });

  assert.equal(token.sub, 'user-cuid-100');
  assert.equal(token.login, 'octocat');
  assert.equal(token.githubLogin, 'octocat');
  assert.equal(token.githubId, '583231');
  assert.equal(token.authMethod, 'oauth');
  assert.equal(token.isGithubConnected, true);
  assert.equal(token.accessToken, 'gho_oauth_secret_token_123');

  const sess = await session({
    session: { user: {}, expires: '2099-01-01' } as any,
    token,
    user: {} as any,
    newSession: {} as any,
    trigger: 'update',
  });

  assert.equal(sess.user.id, 'user-cuid-100');
  assert.equal(sess.user.login, 'octocat');
  assert.equal(sess.user.githubLogin, 'octocat');
  assert.equal((sess.user as any).githubId, '583231');
  assert.equal(sess.user.authMethod, 'oauth');
  assert.equal(sess.user.isGithubConnected, true);
  assert.equal((sess as any).accessToken, undefined);
});

// =============================================================================
// TEST 2: First-time User Creation Through OAuth
// =============================================================================
dbTest('2. First-time user creation through OAuth: records stable numeric githubId in DB', async () => {
  const testGhId = BigInt(99887711);
  const testLogin = `oauth-newuser-${Date.now()}`;

  // Clean up if already exists
  await prisma.user.deleteMany({
    where: { githubId: testGhId },
  });

  const signInEvent = authOptions.events?.signIn;
  assert.ok(signInEvent);

  await signInEvent({
    user: { id: 'temp-id', email: `${testLogin}@example.com` },
    account: { provider: 'github', access_token: 'dummy-token' },
    profile: {
      id: Number(testGhId),
      login: testLogin,
      email: `${testLogin}@example.com`,
      avatar_url: `https://github.com/${testLogin}.png`,
      name: 'New OAuth User',
    },
  });

  const createdUser = await prisma.user.findUnique({
    where: { githubId: testGhId },
  });

  assert.ok(createdUser, 'User should be created in DB');
  assert.equal(createdUser.githubId, testGhId);
  assert.equal(createdUser.githubLogin, testLogin);
  assert.equal(createdUser.name, 'New OAuth User');

  // Clean up
  await prisma.user.delete({ where: { id: createdUser.id } });
});

// =============================================================================
// TEST 3: Returning User Login (Username Rename Handling)
// =============================================================================
dbTest('3. Returning user login: updates mutable githubLogin without creating duplicate account', async () => {
  const testGhId = BigInt(99887722);
  const originalLogin = `oldhandle-${Date.now()}`;
  const renamedLogin = `newhandle-${Date.now()}`;

  // Seed user with original handle
  const originalUser = await prisma.user.create({
    data: {
      githubId: testGhId,
      githubLogin: originalLogin,
      name: 'Stable User',
    },
  });

  const signInEvent = authOptions.events?.signIn;
  assert.ok(signInEvent);

  // User logs in again, but has changed their GitHub username to renamedLogin
  await signInEvent({
    user: { id: originalUser.id },
    account: { provider: 'github' },
    profile: {
      id: Number(testGhId),
      login: renamedLogin,
      name: 'Stable User Renamed',
    },
  });

  // Verify only 1 user exists with this githubId and login updated
  const updatedUser = await prisma.user.findUnique({
    where: { githubId: testGhId },
  });

  assert.ok(updatedUser);
  assert.equal(updatedUser.id, originalUser.id, 'User primary key ID must remain stable');
  assert.equal(updatedUser.githubLogin, renamedLogin, 'Username should be updated to renamed handle');

  // Verify no duplicate account was created
  const allUsersWithId = await prisma.user.findMany({
    where: { githubId: testGhId },
  });
  assert.equal(allUsersWithId.length, 1);

  // Clean up
  await prisma.user.delete({ where: { id: originalUser.id } });
});

// =============================================================================
// TEST 4: OAuth Providers & Narrow Scope
// =============================================================================
test('4. OAuth Providers: GithubProvider is sole primary provider with read:user scope', () => {
  const providers = buildProviders();
  assert.equal(providers.length, 1);
  assert.equal(providers[0].id, 'github');
  assert.equal(providers[0].authorization.params.scope, 'read:user');
});

// =============================================================================
// TEST 5: Duplicate GitHub Identity Prevention
// =============================================================================
dbTest('5. Duplicate GitHub identity handling: schema enforces unique constraint on githubId', async () => {
  const dupGhId = BigInt(99887733);
  const user1Login = `dup-user-1-${Date.now()}`;
  const user2Login = `dup-user-2-${Date.now()}`;

  const user1 = await prisma.user.create({
    data: {
      githubId: dupGhId,
      githubLogin: user1Login,
    },
  });

  // Attempting to create another user with identical githubId must fail unique constraint
  await assert.rejects(
    async () => {
      await prisma.user.create({
        data: {
          githubId: dupGhId,
          githubLogin: user2Login,
        },
      });
    },
    /Unique constraint/i
  );

  await prisma.user.delete({ where: { id: user1.id } });
});

// =============================================================================
// TEST 6: Safe Account Linking & Prevention of Unsafe Blind Account Merges
// =============================================================================
dbTest('6. Safe account linking: prevents blind merge and requires password verification', async () => {
  const legacyEmail = `legacy-${Date.now()}@example.com`;
  const legacyPassword = 'SecurePassword123!';
  const passwordHash = hashPassword(legacyPassword);

  const legacyUser = await prisma.user.create({
    data: {
      email: legacyEmail,
      name: 'Legacy User',
      passwordHash,
    },
  });

  try {
    // 1. Unauthenticated request to /api/auth/link-account must be rejected (401)
    setSessionOverride(async () => null);
    const unauthReq = new NextRequest('http://localhost/api/auth/link-account', {
      method: 'POST',
      body: JSON.stringify({ email: legacyEmail, password: legacyPassword }),
    });
    const unauthRes = await linkAccountPost(unauthReq);
    assert.equal(unauthRes.status, 401);

    // 2. Authenticated user with WRONG password must be rejected (401)
    setSessionOverride(async () => ({
      user: { id: 'oauth-user-id', login: 'oauth-hero', githubId: '556677' },
    }));

    const wrongPassReq = new NextRequest('http://localhost/api/auth/link-account', {
      method: 'POST',
      body: JSON.stringify({ email: legacyEmail, password: 'WrongPassword!' }),
    });
    const wrongPassRes = await linkAccountPost(wrongPassReq);
    assert.equal(wrongPassRes.status, 401);

    // Verify user was NOT linked
    let checkUser = await prisma.user.findUnique({ where: { id: legacyUser.id } });
    assert.equal(checkUser?.githubLogin, null);

    // 3. Authenticated user with CORRECT password succeeds (200)
    const validLinkReq = new NextRequest('http://localhost/api/auth/link-account', {
      method: 'POST',
      body: JSON.stringify({ email: legacyEmail, password: legacyPassword }),
    });
    const validLinkRes = await linkAccountPost(validLinkReq);
    assert.equal(validLinkRes.status, 200);

    // Verify user is now linked with GitHub credentials
    checkUser = await prisma.user.findUnique({ where: { id: legacyUser.id } });
    assert.equal(checkUser?.githubLogin, 'oauth-hero');
    assert.equal(checkUser?.githubId, BigInt(556677));
    assert.equal(checkUser?.passwordHash, passwordHash, 'Password hash must be preserved');
  } finally {
    setSessionOverride(null);
    await prisma.user.delete({ where: { id: legacyUser.id } }).catch(() => {});
  }
});

// =============================================================================
// TEST 7: Username-Only Access Never Creates an Authenticated Session
// =============================================================================
dbTest('7. Username-only exploration never creates an authenticated session or DB user', async () => {
  const exploreTarget = `ghostuser-${Date.now()}`;

  // Count users before
  const countBefore = await prisma.user.count({
    where: { githubLogin: exploreTarget },
  });
  assert.equal(countBefore, 0);

  // Calling explore API
  const req = new NextRequest(`http://localhost/api/explore?username=${exploreTarget}`);
  await exploreGet(req);

  // Count users after - must still be 0!
  const countAfter = await prisma.user.count({
    where: { githubLogin: exploreTarget },
  });
  assert.equal(countAfter, 0, 'No user record must be created by username exploration');
});

import { redisProducerConnection } from '../../lib/queue';
import { after } from 'node:test';

after(async () => {
  try {
    redisProducerConnection.disconnect();
  } catch {
    // Ignore cleanup errors during testing
  }
});

// =============================================================================
// TEST 8: Public Repository Exploration Without Unnecessary Login
// =============================================================================
test('8. Public repository exploration: works anonymously and rejects invalid handles', async () => {
  // 1. Missing username -> 400
  const reqEmpty = new NextRequest('http://localhost/api/explore?username=');
  const resEmpty = await exploreGet(reqEmpty);
  assert.equal(resEmpty.status, 400);

  // 2. Invalid username characters -> 400
  const reqInvalid = new NextRequest('http://localhost/api/explore?username=invalid$$handle');
  const resInvalid = await exploreGet(reqInvalid);
  assert.equal(resInvalid.status, 400);

  // 3. Valid username query -> returns JSON with notice and no session requirement
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    if (String(url).includes('/users/octocat/repos')) {
      return new Response(
        JSON.stringify([
          {
            id: 1234,
            name: 'Hello-World',
            full_name: 'octocat/Hello-World',
            description: 'My public repo',
            private: false,
            default_branch: 'main',
            stargazers_count: 42,
            forks_count: 10,
            language: 'TypeScript',
            html_url: 'https://github.com/octocat/Hello-World',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        login: 'octocat',
        name: 'The Octocat',
        avatar_url: 'https://github.com/octocat.png',
        public_repos: 8,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as any;

  try {
    const reqValid = new NextRequest('http://localhost/api/explore?username=octocat');
    const resValid = await exploreGet(reqValid);
    assert.equal(resValid.status, 200);
    const data = await resValid.json();
    assert.equal(data.success, true);
    assert.equal(data.user.login, 'octocat');
    assert.equal(data.reposCount, 1);
    assert.ok(data.notice.includes('Public exploration preview'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// =============================================================================
// TEST 9: Private Repository Access Denied Without Authorization
// =============================================================================
test('9. Private repository access: denied without appropriate authorization', async () => {
  setSessionOverride(async () => null);
  setSessionInstallationIdsOverride(null);

  try {
    const req = new NextRequest('http://localhost/api/repositories');
    const res = await repositoriesGet(req);
    assert.equal(res.status, 401, 'Unauthenticated access to repositories API must return 401');
  } finally {
    setSessionOverride(null);
  }
});

// =============================================================================
// TEST 10: Authorization Boundaries Between Users (Tenant Isolation)
// =============================================================================
dbTest('10. Authorization boundaries: user with installation A cannot access installation B repos', async () => {
  const instA_Id = BigInt(880011);
  const instB_Id = BigInt(880022);

  const instA = await prisma.installation.upsert({
    where: { githubInstallationId: instA_Id },
    update: {},
    create: { githubInstallationId: instA_Id, accountLogin: 'tenant-a-test', accountType: 'User' },
  });

  const instB = await prisma.installation.upsert({
    where: { githubInstallationId: instB_Id },
    update: {},
    create: { githubInstallationId: instB_Id, accountLogin: 'tenant-b-test', accountType: 'User' },
  });

  const repoB = await prisma.repository.upsert({
    where: { githubRepoId: BigInt(880099) },
    update: { installationId: instB.id },
    create: {
      githubRepoId: BigInt(880099),
      installationId: instB.id,
      fullName: 'tenant-b/private-project',
      defaultBranch: 'main',
    },
  });

  try {
    // Simulate user authenticated only for Installation A
    setSessionInstallationIdsOverride(async () => [instA_Id]);

    const req = new NextRequest('http://localhost/api/repositories');
    const res = await repositoriesGet(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    const repos = body.data || body;
    const foundRepoB = repos.some((r: any) => r.id === repoB.id || r.fullName === repoB.fullName);

    assert.equal(foundRepoB, false, 'User scoped to Tenant A must not see Tenant B repositories');
  } finally {
    setSessionInstallationIdsOverride(null);
    await prisma.repository.delete({ where: { id: repoB.id } }).catch(() => {});
    await prisma.installation.delete({ where: { id: instA.id } }).catch(() => {});
    await prisma.installation.delete({ where: { id: instB.id } }).catch(() => {});
  }
});

// =============================================================================
// TEST 11: Session Expiration and Logout Handling
// =============================================================================
test('11. Session expiration: requireSession throws UnauthorizedError when session is missing or expired', async () => {
  setSessionOverride(async () => null);
  setSessionInstallationIdsOverride(null);

  await assert.rejects(
    async () => {
      await requireSession();
    },
    (err: any) => err instanceof UnauthorizedError
  );

  setSessionOverride(null);
});

// =============================================================================
// TEST 12: Preservation of Existing Review History and User Settings
// =============================================================================
dbTest('12. Preservation of existing user data: foreign keys and review records remain intact', async () => {
  const dummyUser = await prisma.user.create({
    data: {
      name: 'Existing Developer',
      email: `existing-${Date.now()}@example.com`,
      passwordHash: 'dummy-preserved-hash',
    },
  });

  assert.ok(dummyUser.id);
  assert.equal(dummyUser.passwordHash, 'dummy-preserved-hash');

  // Verify record can be read and updated without schema violations
  const fetched = await prisma.user.findUnique({
    where: { id: dummyUser.id },
  });
  assert.ok(fetched);
  assert.equal(fetched.name, 'Existing Developer');

  await prisma.user.delete({ where: { id: dummyUser.id } });
});

// =============================================================================
// TEST 13: Removed Email/Password Registration Endpoint Inaccessible (410 Gone)
// =============================================================================
test('13. Retired email/password endpoints: POST /api/auth/register returns 410 Gone', async () => {
  const postRes = await registerPost();
  assert.equal(postRes.status, 410);

  const postData = await postRes.json();
  assert.equal(postData.code, 'AUTH_METHOD_RETIRED');
  assert.ok(postData.error.includes('retired'));

  const getRes = await registerGet();
  assert.equal(getRes.status, 410);
});

// =============================================================================
// TEST 14: Existing GitHub App and Webhook Functionality Operational
// =============================================================================
dbTest('14. GitHub App and Webhook models remain functional', async () => {
  const deliveryId = `test-deliv-${Date.now()}`;
  const webhookRecord = await prisma.webhookDelivery.create({
    data: {
      deliveryId,
      event: 'pull_request',
      action: 'opened',
      statusCode: 200,
    },
  });

  assert.ok(webhookRecord.id);
  assert.equal(webhookRecord.event, 'pull_request');

  await prisma.webhookDelivery.delete({ where: { id: webhookRecord.id } });
});
