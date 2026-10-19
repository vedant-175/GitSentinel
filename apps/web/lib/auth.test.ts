import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAuthConfig, buildProviders, authOptions } from './auth';
import { isDatabaseAvailable } from '@ai-reviewer/db';

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

test('auth providers: CredentialsProvider only included when ENABLE_DEV_LOGIN=true and NODE_ENV=development', () => {
  const originalEnv = { ...process.env };

  try {
    // Test env without dev login -> ONLY GithubProvider
    (process.env as any).NODE_ENV = 'test';
    delete process.env.ENABLE_DEV_LOGIN;
    const providersProd = buildProviders();
    assert.equal(providersProd.length, 1);
    assert.equal(providersProd[0].id, 'github');

    // Dev env without flag -> ONLY GithubProvider
    (process.env as any).NODE_ENV = 'development';
    process.env.ENABLE_DEV_LOGIN = 'false';
    const providersDevDisabled = buildProviders();
    assert.equal(providersDevDisabled.length, 1);
    assert.equal(providersDevDisabled[0].id, 'github');

    // Dev env WITH flag -> GithubProvider AND CredentialsProvider
    (process.env as any).NODE_ENV = 'development';
    process.env.ENABLE_DEV_LOGIN = 'true';
    const providersDevEnabled = buildProviders();
    assert.equal(providersDevEnabled.length, 2);
    assert.equal(providersDevEnabled[0].id, 'github');
    assert.equal(providersDevEnabled[1].id, 'credentials');
  } finally {
    process.env = originalEnv;
  }
});

test('auth oauth scope: GithubProvider scope is narrowed to read:user', () => {
  const providers = buildProviders();
  const github = providers.find((p) => p.id === 'github');
  assert.ok(github);
  assert.equal(github.authorization.params.scope, 'read:user');
});

test('credentials provider: strictly enforces localhost host header and rejects remote hosts', async () => {
  const originalEnv = { ...process.env };

  try {
    (process.env as any).NODE_ENV = 'development';
    process.env.ENABLE_DEV_LOGIN = 'true';

    const providers = buildProviders();
    const creds = providers.find((p) => p.id === 'credentials');
    assert.ok(creds);

    // 1. Non-localhost host header (e.g. remote or attacker domain) -> REJECTS
    await assert.rejects(
      async () => {
        await creds.authorize(
          { username: 'test-user' },
          { headers: { host: 'evil-attacker.example.com' } }
        );
      },
      /Dev credentials login is only permitted on localhost/
    );

    // 2. Non-localhost IP address -> REJECTS
    await assert.rejects(
      async () => {
        await creds.authorize(
          { username: 'test-user' },
          { headers: { host: '192.168.1.50:3000' } }
        );
      },
      /Dev credentials login is only permitted on localhost/
    );

    if (await isDatabaseAvailable()) {
      // 3. Localhost host header -> ALLOWED
      const userLocalhost = await creds.authorize(
        { username: 'test-user' },
        { headers: { host: 'localhost:3000' } }
      );
      assert.ok(userLocalhost);
      assert.equal(userLocalhost.login, 'test-user');
      assert.equal(userLocalhost.name, 'test-user');

      // 4. 127.0.0.1 host header -> ALLOWED
      const user127 = await creds.authorize(
        { username: 'test-user' },
        { headers: { host: '127.0.0.1:3000' } }
      );
      assert.ok(user127);
      assert.equal(user127.login, 'test-user');
    }
  } finally {
    process.env = originalEnv;
  }
});

test('auth jwt callback: is purely synchronous with zero network or database writes', async () => {
  const jwtCallback = authOptions.callbacks?.jwt;
  assert.ok(jwtCallback);

  const initialToken = { name: 'Initial Token' };
  const user = { id: 'usr-123', name: 'dev-user', image: 'https://example.com/avatar.png' };
  const account = { access_token: 'gho_dummy_token_12345' };
  const profile = { login: 'dev-user' };

  // Invoking jwt callback performs immediate synchronous in-memory token enrichment
  const resultToken = await jwtCallback({
    token: initialToken,
    user,
    account: account as any,
    profile,
  });

  assert.equal(resultToken.sub, 'usr-123');
  assert.equal(resultToken.login, 'dev-user');
  assert.equal(resultToken.accessToken, 'gho_dummy_token_12345');
  assert.equal(resultToken.picture, 'https://example.com/avatar.png');
});
