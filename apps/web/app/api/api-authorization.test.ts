process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
  setRoleOverride,
  clearInstallationAccessCache,
} from '../../lib/auth-helpers';

// API Handlers
import { GET as healthGet } from './health/route';
import { GET as exploreGet } from './explore/route';
import { GET as systemLogsGet } from './system-logs/route';
import { GET as systemLogsExportGet } from './system-logs/export/route';
import { GET as observabilityGet } from './observability/route';
import { POST as evalRunPost } from './eval/run/route';
import { GET as evalExportGet } from './eval/export/route';
import { POST as reviewFilePost } from './repositories/review-file/route';
import { POST as repoFilesPost } from './repositories/files/route';
import { POST as chatPost } from './chat/route';
import { GET as settingsGet, PATCH as settingsPatch } from './settings/route';
import { POST as validateCredsPost } from './settings/ai-engine/validate-credentials/route';
import { POST as testGithubConnPost } from './settings/github/test-connection/route';
import { POST as testNotificationsPost } from './settings/notifications/test/route';
import { POST as retryFailedReviewPost } from './failed-reviews/[id]/retry/route';

// Server Actions
import { analyseRepositoryAction, updateRepoConfig } from '../actions/repo-actions';

function dbTest(name: string, fn: () => Promise<void> | void) {
  test(name, async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available for this test');
      return;
    }
    await fn();
  });
}

function resetAuthOverrides() {
  setSessionOverride(null);
  setSessionInstallationIdsOverride(null);
  setRoleOverride(null);
  clearInstallationAccessCache();
}

// =============================================================================
// SUITE 1: Public Endpoints (Intentional Public Behavior)
// =============================================================================
test('1. Public health check: GET /api/health succeeds anonymously without auth', async () => {
  resetAuthOverrides();
  const res = await healthGet();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
});

test('2. Public repository exploration: GET /api/explore works anonymously with input validation', async () => {
  resetAuthOverrides();
  // Valid request
  const req = new NextRequest('http://localhost:3000/api/explore?username=octocat');
  const res = await exploreGet(req);
  // Should not be 401 or 403
  assert.notEqual(res.status, 401);
  assert.notEqual(res.status, 403);

  // Invalid username validation
  const badReq = new NextRequest('http://localhost:3000/api/explore?username=invalid_user@name!');
  const badRes = await exploreGet(badReq);
  assert.equal(badRes.status, 400);
});

// =============================================================================
// SUITE 2: System Logs & Export (Synthetic Demo vs Protected Operational Logs)
// =============================================================================
test('3. Anonymous system logs: GET /api/system-logs serves synthetic demo logs without real DB audit logs', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/system-logs?limit=5');
  const res = await systemLogsGet(req);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.isDemo, true);
  assert.ok(body.data?.logs);
  assert.ok(body.data.logs.length > 0);
});

test('4. System logs export: GET /api/system-logs/export returns 401 when unauthenticated and demo=true is absent', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/system-logs/export');
  const res = await systemLogsExportGet(req);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, 'Unauthorized');
});

test('5. Public demo logs export: GET /api/system-logs/export?demo=true permits synthetic demo CSV download', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/system-logs/export?demo=true');
  const res = await systemLogsExportGet(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
});

// =============================================================================
// SUITE 3: Anonymous Access Denied (401 Unauthorized)
// =============================================================================
test('6. Observability: GET /api/observability returns 401/403 when called anonymously', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/observability');
  const res = await observabilityGet(req);
  assert.ok(res.status === 401 || res.status === 403);
});

test('7. Observability trace: GET /api/observability?traceId=123 returns 401 when called anonymously', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/observability?traceId=123');
  const res = await observabilityGet(req);
  assert.equal(res.status, 401);
});

test('8. Evaluation export: GET /api/eval/export returns 401/403 when called anonymously', async () => {
  resetAuthOverrides();
  const res = await evalExportGet();
  assert.ok(res.status === 401 || res.status === 403);
});

test('9. Repositories review file: POST /api/repositories/review-file returns 401 when called anonymously', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/repositories/review-file', {
    method: 'POST',
    body: JSON.stringify({ filePath: 'test.ts', content: 'console.log("hello")' }),
  });
  const res = await reviewFilePost(req);
  assert.equal(res.status, 401);
});

test('10. Chat: POST /api/chat returns 401 when called anonymously', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Explain this vulnerability' }),
  });
  const res = await chatPost(req);
  assert.equal(res.status, 401);
});

test('11. Settings: GET /api/settings returns 401 when called anonymously', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/settings');
  const res = await settingsGet(req);
  assert.equal(res.status, 401);
});

test('12. Settings AI Engine credentials validation: POST /api/settings/ai-engine/validate-credentials returns 401 when unauthenticated', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/settings/ai-engine/validate-credentials', {
    method: 'POST',
    body: JSON.stringify({ provider: 'groq' }),
  });
  const res = await validateCredsPost(req);
  assert.ok(res.status === 401 || res.status === 403);
});

test('13. Settings GitHub connection test: POST /api/settings/github/test-connection returns 401 when unauthenticated', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/settings/github/test-connection', {
    method: 'POST',
  });
  const res = await testGithubConnPost(req);
  assert.ok(res.status === 401 || res.status === 403);
});

test('14. Settings notifications test: POST /api/settings/notifications/test returns 401 when unauthenticated', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/settings/notifications/test', {
    method: 'POST',
  });
  const res = await testNotificationsPost(req);
  assert.equal(res.status, 401);
});

test('15. Failed review retry: POST /api/failed-reviews/1/retry returns 401 when unauthenticated', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/failed-reviews/1/retry', {
    method: 'POST',
  });
  const res = await retryFailedReviewPost(req, { params: Promise.resolve({ id: '1' }) });
  assert.equal(res.status, 401);
});

// =============================================================================
// SUITE 4: Role-Based Access Control (Non-Admin / VIEWER Blocked with 403)
// =============================================================================
test('16. Non-admin user receives 403 Forbidden on administrator-only endpoints', async () => {
  // Mock authenticated session as regular VIEWER user
  setSessionOverride(() =>
    Promise.resolve({
      user: { id: 'usr-viewer-1', login: 'viewer_user' },
      installationIds: ['1001'],
    })
  );
  setSessionInstallationIdsOverride(() => Promise.resolve([BigInt(1001)]));
  setRoleOverride(() => 'VIEWER');

  // Observability global metrics -> 403
  const obsRes = await observabilityGet(new NextRequest('http://localhost:3000/api/observability'));
  assert.equal(obsRes.status, 403);

  // Eval export -> 403
  const evalExpRes = await evalExportGet();
  assert.equal(evalExpRes.status, 403);

  // AI Engine credentials test -> 403
  const credsReq = new NextRequest('http://localhost:3000/api/settings/ai-engine/validate-credentials', {
    method: 'POST',
    body: JSON.stringify({ provider: 'groq' }),
  });
  const credsRes = await validateCredsPost(credsReq);
  assert.equal(credsRes.status, 403);

  // GitHub connection test -> 403
  const ghReq = new NextRequest('http://localhost:3000/api/settings/github/test-connection', {
    method: 'POST',
  });
  const ghRes = await testGithubConnPost(ghReq);
  assert.equal(ghRes.status, 403);

  // Notifications test (requires CONFIG_UPDATE) -> 403
  const notifReq = new NextRequest('http://localhost:3000/api/settings/notifications/test', {
    method: 'POST',
  });
  const notifRes = await testNotificationsPost(notifReq);
  assert.equal(notifRes.status, 403);

  resetAuthOverrides();
});

test('17. Administrator user receives 200 OK on administrator-only endpoints', async () => {
  // Mock authenticated session as ADMIN
  setSessionOverride(() =>
    Promise.resolve({
      user: { id: 'usr-admin-1', login: 'admin_user' },
      installationIds: ['1001'],
    })
  );
  setSessionInstallationIdsOverride(() => Promise.resolve([BigInt(1001)]));
  setRoleOverride(() => 'ADMIN');

  // Observability global metrics -> 200
  const obsRes = await observabilityGet(new NextRequest('http://localhost:3000/api/observability'));
  assert.equal(obsRes.status, 200);

  // GitHub connection test -> 200
  const ghReq = new NextRequest('http://localhost:3000/api/settings/github/test-connection', {
    method: 'POST',
  });
  const ghRes = await testGithubConnPost(ghReq);
  assert.equal(ghRes.status, 200);
  const ghData = await ghRes.json();
  assert.ok('checks' in ghData);

  resetAuthOverrides();
});

// =============================================================================
// SUITE 5: Cross-Tenant Isolation & Path Traversal Prevention
// =============================================================================
test('18. Path traversal guard: POST /api/repositories/files returns 400 when path contains traversal sequences', async () => {
  resetAuthOverrides();
  const req = new NextRequest('http://localhost:3000/api/repositories/files', {
    method: 'POST',
    body: JSON.stringify({
      repoFullName: 'octocat/Hello-World',
      path: '../../etc/passwd',
    }),
  });
  const res = await repoFilesPost(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error.includes('traversal'));
});

dbTest('19. Cross-tenant repository settings isolation: User from Installation A cannot read or mutate Repo in Installation B', async () => {
  // Find or create test repositories in database across two different installations
  let instA = await prisma.installation.findFirst({ where: { githubInstallationId: BigInt(888111) } });
  if (!instA) {
    instA = await prisma.installation.create({
      data: {
        githubInstallationId: BigInt(888111),
        accountLogin: 'tenant-a-org',
        accountType: 'Organization',
      },
    });
  }

  let instB = await prisma.installation.findFirst({ where: { githubInstallationId: BigInt(888222) } });
  if (!instB) {
    instB = await prisma.installation.create({
      data: {
        githubInstallationId: BigInt(888222),
        accountLogin: 'tenant-b-org',
        accountType: 'Organization',
      },
    });
  }

  let repoB = await prisma.repository.findFirst({ where: { fullName: 'tenant-b-org/private-secrets' } });
  if (!repoB) {
    repoB = await prisma.repository.create({
      data: {
        installationId: instB.id,
        githubRepoId: BigInt(999222),
        fullName: 'tenant-b-org/private-secrets',
        defaultBranch: 'main',
      },
    });
  }

  // Set session to Tenant A member
  setSessionOverride(() =>
    Promise.resolve({
      user: { id: 'usr-tenant-a', login: 'alice_tenant_a' },
      installationIds: [String(instA.githubInstallationId)],
    })
  );
  setSessionInstallationIdsOverride(() => Promise.resolve([instA.githubInstallationId]));
  setRoleOverride(() => 'ADMIN'); // Admin on Tenant A, but has NO access to Tenant B!

  // 1. Attempt to read Tenant B's repository via settings GET
  const readReq = new NextRequest(`http://localhost:3000/api/settings?repoId=${repoB.id}`);
  const readRes = await settingsGet(readReq);
  assert.equal(readRes.status, 403);

  // 2. Attempt to modify Tenant B's repository via settings PATCH
  const patchReq = new NextRequest('http://localhost:3000/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      repositoryId: repoB.id,
      repoConfig: { auto_approve: true },
    }),
  });
  const patchRes = await settingsPatch(patchReq);
  assert.equal(patchRes.status, 403);

  // 3. Attempt to trigger autonomous analysis on Tenant B's repo via Server Action
  const actionRes = await analyseRepositoryAction(repoB.id);
  assert.equal(actionRes.success, false);
  assert.ok(actionRes.error?.includes('Forbidden') || actionRes.error?.includes('denied'));

  // 4. Attempt to mutate Tenant B's repo config via updateRepoConfig Server Action
  const configActionRes = await updateRepoConfig(repoB.id, { auto_approve: true });
  assert.equal(configActionRes.success, false);
  assert.ok(configActionRes.error?.includes('Forbidden') || configActionRes.error?.includes('denied'));

  // 5. Attempt to access Tenant B's files via POST /api/repositories/files
  const filesReq = new NextRequest('http://localhost:3000/api/repositories/files', {
    method: 'POST',
    body: JSON.stringify({
      repoFullName: 'tenant-b-org/private-secrets',
      path: '',
    }),
  });
  const filesRes = await repoFilesPost(filesReq);
  assert.equal(filesRes.status, 403);

  // 6. Attempt to trigger file review on Tenant B's private repo
  const reviewFileReq = new NextRequest('http://localhost:3000/api/repositories/review-file', {
    method: 'POST',
    body: JSON.stringify({
      repoFullName: 'tenant-b-org/private-secrets',
      filePath: 'secret.py',
      content: 'API_KEY = "123"',
    }),
  });
  const reviewFileRes = await reviewFilePost(reviewFileReq);
  assert.equal(reviewFileRes.status, 403);

  // 7. Attempt to query Chat on Tenant B's repo
  const chatReq = new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      repoId: repoB.id,
      message: 'Show me repo security summary',
    }),
  });
  const chatRes = await chatPost(chatReq);
  assert.equal(chatRes.status, 403);

  resetAuthOverrides();
});

test.after(async () => {
  await prisma.$disconnect();
});
