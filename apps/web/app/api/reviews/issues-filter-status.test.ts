import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { GET, PATCH } from './[id]/issues/route';
import { NextRequest } from 'next/server';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
} from '@/lib/auth-helpers';

describe('Review Issues API: Multi-Dimensional Filtering & Status Lifecycle (Phase 4 Requirement 7)', () => {
  it('supports filtering issues by severity, category, file, status, source and confidence', async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    const timestamp = Date.now();
    const instId = BigInt(timestamp) * 1000n + 11n;

    // Setup DB records
    const inst = await prisma.installation.create({
      data: {
        githubInstallationId: instId,
        accountLogin: `filter-user-${timestamp}`,
        accountType: 'User',
      },
    });

    const repo = await prisma.repository.create({
      data: {
        installationId: inst.id,
        githubRepoId: BigInt(timestamp) * 1000n + 12n,
        fullName: `filter-user-${timestamp}/filter-repo`,
        defaultBranch: 'main',
      },
    });

    const pr = await prisma.pullRequest.create({
      data: {
        repositoryId: repo.id,
        githubPrNumber: 501,
        title: 'Filter Test PR',
        author: 'contributor',
        state: 'open',
      },
    });

    const review = await prisma.review.create({
      data: {
        pullRequestId: pr.id,
        commitSha: `commit-${timestamp}`,
        status: 'completed',
        stage: 'COMPLETED',
      },
    });

    // Seed 4 issues with distinct dimensions
    const issue1 = await prisma.reviewIssue.create({
      data: {
        reviewId: review.id,
        filePath: 'src/auth/jwt.ts',
        lineNumber: 10,
        severity: 'critical',
        category: 'security',
        message: 'Hardcoded secret detected',
        source: 'regex',
        confidence: 1.0,
        status: 'open',
        cwe: 'CWE-798',
        owasp: 'A07:2021',
      },
    });

    const issue2 = await prisma.reviewIssue.create({
      data: {
        reviewId: review.id,
        filePath: 'src/utils/math.ts',
        lineNumber: 25,
        severity: 'warning',
        category: 'bug',
        message: 'Divide by zero vulnerability',
        source: 'llm',
        confidence: 0.95,
        status: 'open',
      },
    });

    await prisma.reviewIssue.create({
      data: {
        reviewId: review.id,
        filePath: 'src/components/Header.tsx',
        lineNumber: 40,
        severity: 'suggestion',
        category: 'style',
        message: 'Inconsistent prop typing',
        source: 'eslint',
        confidence: 0.8,
        status: 'dismissed',
      },
    });

    await prisma.reviewIssue.create({
      data: {
        reviewId: review.id,
        filePath: 'src/auth/session.ts',
        lineNumber: 100,
        severity: 'critical',
        category: 'security',
        message: 'Missing CSRF validation',
        source: 'llm',
        confidence: 0.65,
        status: 'fixed',
      },
    });

    // Setup session override
    setSessionOverride(async () => ({
      user: { name: `filter-user-${timestamp}`, email: 'filter@example.com' },
    }));
    setSessionInstallationIdsOverride(async () => [instId]);

    try {
      // 1. Filter by severity=critical
      const reqCrit = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/issues?severity=critical`);
      const resCrit = await GET(reqCrit, { params: { id: String(review.id) } });
      assert.equal(resCrit.status, 200);
      const dataCrit = await resCrit.json();
      assert.equal(dataCrit.data.length, 2);
      assert.ok(dataCrit.data.every((i: any) => i.severity === 'critical'));

      // 2. Filter by status=open
      const reqOpen = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/issues?status=open`);
      const resOpen = await GET(reqOpen, { params: { id: String(review.id) } });
      assert.equal(resOpen.status, 200);
      const dataOpen = await resOpen.json();
      assert.equal(dataOpen.data.length, 2);
      assert.ok(dataOpen.data.every((i: any) => i.status === 'open'));

      // 3. Filter by file='math'
      const reqFile = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/issues?file=math`);
      const resFile = await GET(reqFile, { params: { id: String(review.id) } });
      assert.equal(resFile.status, 200);
      const dataFile = await resFile.json();
      assert.equal(dataFile.data.length, 1);
      assert.equal(dataFile.data[0].filePath, 'src/utils/math.ts');

      // 4. Filter by source='regex'
      const reqSource = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/issues?source=regex`);
      const resSource = await GET(reqSource, { params: { id: String(review.id) } });
      assert.equal(resSource.status, 200);
      const dataSource = await resSource.json();
      assert.equal(dataSource.data.length, 1);
      assert.equal(dataSource.data[0].source, 'regex');

      // 5. Filter by confidence >= 0.9
      const reqConf = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/issues?confidence=0.9`);
      const resConf = await GET(reqConf, { params: { id: String(review.id) } });
      assert.equal(resConf.status, 200);
      const dataConf = await resConf.json();
      assert.equal(dataConf.data.length, 2);
      assert.ok(dataConf.data.every((i: any) => i.confidence >= 0.9));

      // 6. PATCH status transition: Dismiss issue1
      const patchDismiss = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/issues`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue1.id, status: 'dismissed' }),
      });
      const resDismiss = await PATCH(patchDismiss, { params: { id: String(review.id) } });
      assert.equal(resDismiss.status, 200);
      const dataDismiss = await resDismiss.json();
      assert.equal(dataDismiss.status, 'dismissed');

      // 7. PATCH status transition: Mark issue2 as fixed
      const patchFix = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/issues`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue2.id, status: 'fixed' }),
      });
      const resFix = await PATCH(patchFix, { params: { id: String(review.id) } });
      assert.equal(resFix.status, 200);
      const dataFix = await resFix.json();
      assert.equal(dataFix.status, 'fixed');

      // 8. Reopen issue1
      const patchReopen = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/issues`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue1.id, status: 'open' }),
      });
      const resReopen = await PATCH(patchReopen, { params: { id: String(review.id) } });
      assert.equal(resReopen.status, 200);
      const dataReopen = await resReopen.json();
      assert.equal(dataReopen.status, 'open');

      // 9. Invalid status rejected
      const patchBad = new NextRequest(`http://localhost:3000/api/reviews/${review.id}/issues`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue1.id, status: 'invalid_status' }),
      });
      const resBad = await PATCH(patchBad, { params: { id: String(review.id) } });
      assert.equal(resBad.status, 400);
    } finally {
      setSessionOverride(null);
      setSessionInstallationIdsOverride(null);
    }
  });
});
