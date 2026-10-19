import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { GET } from './[id]/sarif/route.js';
import { NextRequest } from 'next/server';
import { validateSarifLog } from '@ai-reviewer/shared';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
} from '@/lib/auth-helpers';

function itDb(name: string, fn: () => Promise<void> | void) {
  it(name, async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    await fn();
  });
}

describe('SARIF 2.1.0 Export API (Phase 6 Requirement 10 & Security Audit Fix)', () => {
  const timestamp = Date.now();
  const instId = BigInt(timestamp) * 1000n + 31n;
  const otherInstId = BigInt(timestamp) * 1000n + 99n;

  let inst: any;
  let otherInst: any;
  let repo: any;
  let pr: any;
  let review: any;

  before(async () => {
    if (!(await isDatabaseAvailable())) return;
    inst = await prisma.installation.create({
      data: {
        githubInstallationId: instId,
        accountLogin: `sarif-user-${timestamp}`,
        accountType: 'User',
      },
    });

    otherInst = await prisma.installation.create({
      data: {
        githubInstallationId: otherInstId,
        accountLogin: `other-user-${timestamp}`,
        accountType: 'User',
      },
    });

    repo = await prisma.repository.create({
      data: {
        installationId: inst.id,
        githubRepoId: BigInt(timestamp) * 1000n + 32n,
        fullName: `sarif-user-${timestamp}/sarif-repo`,
        defaultBranch: 'main',
      },
    });

    pr = await prisma.pullRequest.create({
      data: {
        repositoryId: repo.id,
        githubPrNumber: 601,
        title: 'SARIF Test PR',
        author: 'developer',
        state: 'open',
      },
    });

    review = await prisma.review.create({
      data: {
        pullRequestId: pr.id,
        commitSha: `commit-sarif-${timestamp}`,
        status: 'completed',
        stage: 'COMPLETED',
      },
    });

    await prisma.reviewIssue.createMany({
      data: [
        {
          reviewId: review.id,
          filePath: 'src/controllers/user.ts',
          lineNumber: 42,
          severity: 'critical',
          category: 'security',
          message: 'Direct concatenation of query parameters into SQL string creates SQL Injection',
          cwe: 'CWE-89',
          owasp: 'A03:2021-Injection',
          impact: 'Full unauthorized database read/write access',
          remediation: 'Use parameterized queries ($1, [id])',
          confidence: 0.99,
          calibratedConfidence: 0.98,
          riskScore: 92,
        },
        {
          reviewId: review.id,
          filePath: 'src/utils/calc.ts',
          lineNumber: 18,
          severity: 'warning',
          category: 'bug',
          message: 'Array boundary check missing leading to possible undefined indexing',
          confidence: 0.85,
          calibratedConfidence: 0.82,
          riskScore: 50,
        },
      ],
    });
  });

  after(async () => {
    setSessionOverride(null);
    setSessionInstallationIdsOverride(null);
    if (await isDatabaseAvailable()) {
      if (inst) {
        await prisma.installation.delete({ where: { id: inst.id } }).catch(() => {});
      }
      if (otherInst) {
        await prisma.installation.delete({ where: { id: otherInst.id } }).catch(() => {});
      }
    }
  });

  itDb('rejects unauthenticated request with 401 Unauthorized', async () => {
    setSessionOverride(null);
    setSessionInstallationIdsOverride(null);

    const req = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/sarif`);
    const res = await GET(req, { params: { id: String(review.id) } });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  itDb('rejects cross-tenant request with 403 Forbidden', async () => {
    // Authenticate as other tenant
    setSessionOverride(async () => ({
      user: { id: 'other-user', login: `other-user-${timestamp}` },
    }));
    setSessionInstallationIdsOverride(async () => [otherInstId]);

    const req = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/sarif`);
    const res = await GET(req, { params: { id: String(review.id) } });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'Forbidden');
  });

  itDb('exports valid OASIS SARIF 2.1.0 report for authorized tenant user', async () => {
    // Authenticate as legitimate tenant
    setSessionOverride(async () => ({
      user: { id: 'sarif-user', login: `sarif-user-${timestamp}` },
    }));
    setSessionInstallationIdsOverride(async () => [instId]);

    const req = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/sarif`);
    const res = await GET(req, { params: { id: String(review.id) } });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('application/sarif+json'));
    assert.ok(res.headers.get('content-disposition')?.includes('.sarif'));

    const sarifBody = await res.json();
    assert.equal(sarifBody.version, '2.1.0');
    assert.equal(
      sarifBody.$schema,
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json'
    );

    const validation = validateSarifLog(sarifBody);
    assert.equal(validation.isValid, true, `SARIF validation failed: ${validation.errors.join('; ')}`);

    const run = sarifBody.runs[0];
    assert.equal(run.tool.driver.name, 'GitSentinel');
    assert.equal(run.results.length, 2);

    const sqlResult = run.results.find((r: any) => r.ruleId === 'GS-CWE-89');
    assert.ok(sqlResult);
    assert.equal(sqlResult.level, 'error');
    assert.equal(sqlResult.locations[0].physicalLocation.artifactLocation.uri, 'src/controllers/user.ts');
    assert.equal(sqlResult.locations[0].physicalLocation.region.startLine, 42);
  });

  itDb('handles invalid and non-existent review IDs gracefully', async () => {
    setSessionOverride(async () => ({
      user: { id: 'sarif-user', login: `sarif-user-${timestamp}` },
    }));
    setSessionInstallationIdsOverride(async () => [instId]);

    const invalidReq = new NextRequest('http://localhost:3000/api/reviews/invalid/sarif');
    const invalidRes = await GET(invalidReq, { params: { id: 'invalid' } });
    assert.equal(invalidRes.status, 400);

    const notFoundReq = new NextRequest('http://localhost:3000/api/reviews/99999999/sarif');
    const notFoundRes = await GET(notFoundReq, { params: { id: '99999999' } });
    assert.equal(notFoundRes.status, 404);
  });
});
