import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { parsePaginationParams, paginateResults } from '@/lib/pagination';
import { GET as getPullRequests } from './pull-requests/route';
import { GET as getFailedReviews } from './failed-reviews/route';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
} from '@/lib/auth-helpers';

describe('Database Pagination Test Suite (Phase 3 Requirement 1)', () => {
  const testInstId = BigInt(77701);
  let dbInst: any;
  let dbRepo: any;
  const createdPrs: any[] = [];
  const createdFailedReviews: any[] = [];

  before(async () => {
    if (!(await isDatabaseAvailable())) return;
    // Seed test installation and repo
    dbInst = await prisma.installation.upsert({
      where: { githubInstallationId: testInstId },
      update: {},
      create: {
        githubInstallationId: testInstId,
        accountLogin: 'pagination-test-org',
        accountType: 'Organization',
      },
    });

    dbRepo = await prisma.repository.upsert({
      where: {
        githubRepoId: BigInt(88801),
      },
      update: {},
      create: {
        installationId: dbInst.id,
        githubRepoId: BigInt(88801),
        fullName: 'pagination-test-org/repo-1',
      },
    });

    // Seed 5 PRs
    for (let i = 1; i <= 5; i++) {
      const pr = await prisma.pullRequest.create({
        data: {
          repositoryId: dbRepo.id,
          githubPrNumber: 1000 + i,
          title: `Pagination Test PR #${i}`,
          author: 'test-dev',
          state: 'open',
          headSha: `sha-pagination-${i}`,
        },
      });
      createdPrs.push(pr);

      // Seed 5 Failed Reviews
      const fr = await prisma.failedReview.create({
        data: {
          pullRequestId: pr.id,
          commitSha: `sha-pagination-${i}`,
          errorMessage: `Simulated timeout error on PR #${i}`,
          failedAt: new Date(Date.now() - (6 - i) * 60000),
        },
      });
      createdFailedReviews.push(fr);
    }
  });

  after(async () => {
    // Cleanup
    if (await isDatabaseAvailable()) {
      for (const fr of createdFailedReviews) {
        await prisma.failedReview.deleteMany({ where: { id: fr.id } });
      }
      for (const pr of createdPrs) {
        await prisma.pullRequest.deleteMany({ where: { id: pr.id } });
      }
      if (dbRepo) {
        await prisma.repository.deleteMany({ where: { id: dbRepo.id } });
      }
      if (dbInst) {
        await prisma.installation.deleteMany({ where: { id: dbInst.id } });
      }
    }
    setSessionOverride(null);
    setSessionInstallationIdsOverride(null);
  });

  it('parsePaginationParams handles defaults, bounds, and clamping', () => {
    // Defaults
    const p1 = parsePaginationParams('http://localhost:3000/api/repositories');
    assert.equal(p1.limit, 25);
    assert.equal(p1.cursor, undefined);

    // Max limit clamping to 100
    const p2 = parsePaginationParams('http://localhost:3000/api/repositories?limit=500');
    assert.equal(p2.limit, 100);

    // Min limit clamping to 1
    const p3 = parsePaginationParams('http://localhost:3000/api/repositories?limit=-10');
    assert.equal(p3.limit, 1);

    // Explicit cursor and limit
    const p4 = parsePaginationParams('http://localhost:3000/api/repositories?limit=50&cursor=42');
    assert.equal(p4.limit, 50);
    assert.equal(p4.cursor, 42);
  });

  it('paginateResults slices items and sets nextCursor and hasMore correctly', () => {
    const items = [{ id: 10 }, { id: 9 }, { id: 8 }];
    const res = paginateResults(items, 2);

    assert.equal(res.hasMore, true);
    assert.equal(res.data.length, 2);
    assert.equal(res.data[0].id, 10);
    assert.equal(res.data[1].id, 9);
    assert.equal(res.nextCursor, 9);

    const noMore = paginateResults([{ id: 8 }], 2);
    assert.equal(noMore.hasMore, false);
    assert.equal(noMore.data.length, 1);
    assert.equal(noMore.nextCursor, null);
  });

  it('GET /api/pull-requests supports cursor pagination', async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    setSessionOverride(async () => ({
      user: { name: 'pagination-tester', email: 'test@example.com' },
    }));
    setSessionInstallationIdsOverride(async () => [testInstId]);

    // Page 1: limit = 2
    const req1 = new NextRequest(`http://localhost:3000/api/pull-requests?repo_id=${dbRepo.id}&limit=2`);
    const res1 = await getPullRequests(req1);
    assert.equal(res1.status, 200);

    const body1 = await res1.json();
    assert.equal(body1.data.length, 2);
    assert.equal(body1.hasMore, true);
    assert.ok(body1.nextCursor !== null);

    // Page 2: with cursor
    const req2 = new NextRequest(
      `http://localhost:3000/api/pull-requests?repo_id=${dbRepo.id}&limit=2&cursor=${body1.nextCursor}`
    );
    const res2 = await getPullRequests(req2);
    assert.equal(res2.status, 200);

    const body2 = await res2.json();
    assert.equal(body2.data.length, 2);
    assert.notEqual(body1.data[0].id, body2.data[0].id, 'Page 2 must not repeat page 1 items');
  });

  it('GET /api/failed-reviews supports cursor pagination and filtering', async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    setSessionOverride(async () => ({
      user: { name: 'pagination-tester', email: 'test@example.com' },
    }));
    setSessionInstallationIdsOverride(async () => [testInstId]);

    const req = new NextRequest('http://localhost:3000/api/failed-reviews?limit=3');
    const res = await getFailedReviews(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.data.length, 3);
    assert.equal(body.hasMore, true);
    assert.ok(body.nextCursor !== null);
  });
});
