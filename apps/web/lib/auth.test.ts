import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAuthConfig, buildProviders, authOptions, getAuthSecret } from './auth';
import { getServerOAuthToken, setServerOAuthTokenOverride } from './auth-helpers';

test('auth config: ENABLE_DEV_LOGIN=true outside development throws fatal boot error', () => {
  const originalEnv = { ...process.env };

  try {
    // 1. In production, ENABLE_DEV_LOGIN=true must throw fatal boot error
    (process.env as any).NODE_ENV = 'production';
    delete process.env.VERCEL;
    delete process.env.NEXT_PHASE;
    process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
    process.env.ENABLE_DEV_LOGIN = 'true';
    assert.throws(
      () => validateAuthConfig(),
      /FATAL: ENABLE_DEV_LOGIN=true is strictly forbidden when NODE_ENV is not "development"/
    );

    // 2. In test, ENABLE_DEV_LOGIN=true must throw fatal boot error
    (process.env as any).NODE_ENV = 'test';
    process.env.ENABLE_DEV_LOGIN = 'true';
    assert.throws(
      () => validateAuthConfig(),
      /FATAL: ENABLE_DEV_LOGIN=true is strictly forbidden when NODE_ENV is not "development"/
    );

    // 3. In development, ENABLE_DEV_LOGIN=true is allowed
    (process.env as any).NODE_ENV = 'development';
    process.env.ENABLE_DEV_LOGIN = 'true';
    assert.doesNotThrow(() => validateAuthConfig());

    // 4. In any env, ENABLE_DEV_LOGIN not set or false is allowed
    (process.env as any).NODE_ENV = 'test';
    delete process.env.ENABLE_DEV_LOGIN;
    assert.doesNotThrow(() => validateAuthConfig());
  } finally {
    process.env = originalEnv;
  }
});

test('auth config: production startup fails safely if secret is missing or too short', () => {
  const originalEnv = { ...process.env };

  try {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.VERCEL;
    delete process.env.NEXT_PHASE;
    delete process.env.ENABLE_DEV_LOGIN;

    // Missing secret throws in validateAuthConfig
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    assert.throws(
      () => validateAuthConfig(),
      /FATAL: NEXTAUTH_SECRET is required in production and must be at least 32 characters long/
    );

    // Missing secret throws in getAuthSecret
    assert.throws(
      () => getAuthSecret(),
      /FATAL: NEXTAUTH_SECRET environment variable is missing or less than 32 characters in production/
    );

    // Weak secret (< 32 chars) throws in validateAuthConfig
    process.env.NEXTAUTH_SECRET = 'short-secret-16c';
    assert.throws(
      () => validateAuthConfig(),
      /FATAL: NEXTAUTH_SECRET is required in production and must be at least 32 characters long/
    );

    // Weak secret (< 32 chars) throws in getAuthSecret
    assert.throws(
      () => getAuthSecret(),
      /FATAL: NEXTAUTH_SECRET environment variable is missing or less than 32 characters in production/
    );

    // Valid secret (>= 32 chars) succeeds
    process.env.NEXTAUTH_SECRET = 'production-super-strong-secret-key-32chars!';
    assert.doesNotThrow(() => validateAuthConfig());
    assert.equal(getAuthSecret(), 'production-super-strong-secret-key-32chars!');
  } finally {
    process.env = originalEnv;
  }
});

test('auth config: no hardcoded production secret is used in production', () => {
  const originalEnv = { ...process.env };

  try {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.VERCEL;
    delete process.env.NEXT_PHASE;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;

    // Must fail closed rather than falling back to any hardcoded production string
    assert.throws(() => getAuthSecret());
  } finally {
    process.env = originalEnv;
  }
});

test('auth providers: GithubProvider is the primary authentication provider with read:user scope and state check', () => {
  const providers = buildProviders();
  assert.equal(providers.length, 1);
  assert.equal(providers[0].id, 'github');
  assert.equal(providers[0].authorization.params.scope, 'read:user');
  assert.deepEqual((providers[0] as any).checks, ['state']);
});

test('auth jwt callback: populates stable githubId and preserves accessToken server-side only', async () => {
  const jwtCallback = authOptions.callbacks?.jwt;
  assert.ok(jwtCallback);

  const initialToken = { name: 'Initial Token' };
  const user = { id: 'usr-123', name: 'octocat', image: 'https://example.com/avatar.png' };
  const account = { provider: 'github', access_token: 'gho_dummy_token_12345' };
  const profile = { id: 583231, login: 'octocat' };

  // Invoking jwt callback performs immediate synchronous in-memory token enrichment
  const resultToken = await jwtCallback({
    token: initialToken,
    user,
    account: account as any,
    profile,
  });

  assert.equal(resultToken.sub, 'usr-123');
  assert.equal(resultToken.login, 'octocat');
  assert.equal(resultToken.githubLogin, 'octocat');
  assert.equal(resultToken.githubId, '583231');
  assert.equal(resultToken.accessToken, 'gho_dummy_token_12345');
  assert.equal(resultToken.authMethod, 'oauth');
  assert.equal(resultToken.isGithubConnected, true);
});

test('auth jwt callback: client update cannot spoof githubLogin, isGithubConnected, or installationIds', async () => {
  const jwtCallback = authOptions.callbacks?.jwt;
  assert.ok(jwtCallback);

  const existingToken = {
    sub: 'non-existent-user-id-for-spoof-test',
    login: 'real-user',
    githubLogin: 'real-user',
    githubId: '12345',
    authMethod: 'oauth',
    isGithubConnected: true,
  };

  // Malicious client session update attempting to hijack another user's identity and installations
  const maliciousClientUpdate = {
    user: {
      name: 'Legit Display Name',
      login: 'victim-user',
      githubLogin: 'victim-user',
      isGithubConnected: true,
      installationIds: [999999, 888888],
    },
  };

  const updatedToken = await jwtCallback({
    token: existingToken,
    trigger: 'update',
    session: maliciousClientUpdate as any,
  });

  // Client-supplied githubLogin and installationIds MUST NOT be adopted
  assert.equal(updatedToken.githubLogin, 'real-user');
  assert.equal(updatedToken.login, 'real-user');
  assert.equal(updatedToken.installationIds, undefined);
  // Allowed cosmetic name update only
  assert.equal(updatedToken.name, 'Legit Display Name');
});

test('auth session callback: browser-visible session never contains GitHub access token', async () => {
  const sessionCallback = authOptions.callbacks?.session;
  assert.ok(sessionCallback);

  const session = {
    user: { name: 'octocat', email: 'octocat@users.noreply.github.com' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  const token = {
    sub: 'usr-123',
    login: 'octocat',
    githubLogin: 'octocat',
    githubId: '583231',
    authMethod: 'oauth',
    isGithubConnected: true,
    picture: 'https://example.com/avatar.png',
    accessToken: 'gho_dummy_token_12345',
  };

  const resultSession = await sessionCallback({
    session: session as any,
    token: token as any,
    user: {} as any,
    newSession: {} as any,
    trigger: 'update',
  });

  assert.equal(resultSession.user.id, 'usr-123');
  assert.equal(resultSession.user.login, 'octocat');
  assert.equal(resultSession.user.githubLogin, 'octocat');
  assert.equal((resultSession.user as any).githubId, '583231');
  assert.equal(resultSession.user.authMethod, 'oauth');
  assert.equal(resultSession.user.isGithubConnected, true);
  // Security guarantee: session.accessToken must be undefined for browser safety
  assert.equal((resultSession as any).accessToken, undefined);
});

test('auth helpers: getServerOAuthToken returns server token without exposing it to browser session', async () => {
  setServerOAuthTokenOverride(async () => 'gho_secure_server_token_xyz');

  try {
    const token = await getServerOAuthToken();
    assert.equal(token, 'gho_secure_server_token_xyz');
  } finally {
    setServerOAuthTokenOverride(null);
  }
});
