import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { verifyNoTrackedEnvFiles } from './verify-no-env.js';
import { isLocalhostAddress, isMetricsAuthorized } from '../apps/worker/src/server.js';

test('Phase G: CI, Docker, repo hygiene verification tests', async (t) => {
  await t.test('Item 24: Test runner exits non-zero on test failures (never swallows errors)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-reviewer-test-'));
    const tmpTestFile = path.join(tmpDir, 'deliberate-failure.test.mjs');

    try {
      fs.writeFileSync(
        tmpTestFile,
        `import test from 'node:test';
import assert from 'node:assert/strict';
test('deliberate failure', () => {
  assert.equal(1, 2, 'Deliberate test failure');
});
`
      );

      const cleanEnv = { ...process.env };
      for (const key of Object.keys(cleanEnv)) {
        if (key.startsWith('NODE_TEST_')) {
          delete cleanEnv[key];
        }
      }

      const result = spawnSync(
        process.execPath,
        ['--test', 'deliberate-failure.test.mjs'],
        { cwd: tmpDir, env: cleanEnv, encoding: 'utf8' }
      );

      assert.notEqual(result.status, 0, 'Test runner must exit with non-zero exit code on failure');
      assert.equal(result.status, 1, 'Node test runner exits with code 1 on test failure');
      assert.ok(
        result.stdout.includes('deliberate failure') || result.stderr.includes('deliberate failure'),
        'Output should mention the failing test'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('Item 25: isLocalhostAddress identifies localhost IPv4, IPv6, and loopback aliases', () => {
    assert.equal(isLocalhostAddress('127.0.0.1'), true);
    assert.equal(isLocalhostAddress('::1'), true);
    assert.equal(isLocalhostAddress('::ffff:127.0.0.1'), true);
    assert.equal(isLocalhostAddress('localhost'), true);

    // Rejects external/remote IPs
    assert.equal(isLocalhostAddress('192.168.1.100'), false);
    assert.equal(isLocalhostAddress('10.0.0.1'), false);
    assert.equal(isLocalhostAddress('172.16.0.5'), false);
    assert.equal(isLocalhostAddress(''), false);
    assert.equal(isLocalhostAddress(undefined), false);
  });

  await t.test('Item 25: isMetricsAuthorized permits localhost without token, requires valid token when configured or remote', () => {
    // 1. Localhost caller, no token configured -> allowed
    const localReqNoToken = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
    } as any;
    assert.equal(isMetricsAuthorized(localReqNoToken), true);

    // 2. Remote caller, no token configured -> rejected
    const remoteReqNoToken = {
      socket: { remoteAddress: '192.168.1.50' },
      headers: {},
    } as any;
    assert.equal(isMetricsAuthorized(remoteReqNoToken), false);

    // 3. Token configured, caller has matching Bearer token -> allowed
    const token = 'my-secret-token-xyz';
    const authBearerReq = {
      socket: { remoteAddress: '192.168.1.50' },
      headers: { authorization: `Bearer ${token}` },
    } as any;
    assert.equal(isMetricsAuthorized(authBearerReq, token), true);

    // 4. Token configured, caller has matching x-metrics-token header -> allowed
    const authHeaderReq = {
      socket: { remoteAddress: '192.168.1.50' },
      headers: { 'x-metrics-token': token },
    } as any;
    assert.equal(isMetricsAuthorized(authHeaderReq, token), true);

    // 5. Token configured, caller provides wrong token -> rejected
    const badTokenReq = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { authorization: 'Bearer wrong-token' },
    } as any;
    assert.equal(isMetricsAuthorized(badTokenReq, token), false);
  });

  await t.test('Item 26: verifyNoTrackedEnvFiles proves zero .env files are tracked in git or archive (only .env.example)', () => {
    const check = verifyNoTrackedEnvFiles();

    assert.equal(check.isValid, true, 'Repository must be 100% free of tracked .env files');
    assert.equal(
      check.trackedEnvFiles.length,
      0,
      `Tracked .env files found: ${check.trackedEnvFiles.join(', ')}`
    );
    assert.equal(
      check.archivedEnvFiles.length,
      0,
      `Archived .env files found: ${check.archivedEnvFiles.join(', ')}`
    );
  });
});
