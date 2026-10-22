import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAuthConfig, buildProviders, authOptions } from './auth';

test('auth config: ENABLE_DEV_LOGIN=true outside development throws fatal boot error', () => {
  const originalEnv = { ...process.env };

  try {
    // 1. In production, ENABLE_DEV_LOGIN=true must throw fatal boot error
    (process.env as any).NODE_ENV = 'production';
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

test('auth providers: GithubProvider is the primary authentication provider with read:user scope', () => {
  const providers = buildProviders();
  assert.equal(providers.length, 1);
  assert.equal(providers[0].id, 'github');
  assert.equal(providers[0].authorization.params.scope, 'read:user');
});

test('auth jwt callback: populates stable githubId and is purely synchronous', async () => {
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

test('auth session callback: exposes stable githubId and authenticated properties', async () => {
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
  assert.equal(resultSession.accessToken, 'gho_dummy_token_12345');
});
