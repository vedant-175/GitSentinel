import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { processReviewJob } from './pipeline.js';
import { HeadShaChangedError } from '../queue/idempotency.js';
import { ReviewJobData } from '@ai-reviewer/shared';

describe('Stale Commit Protection Test Suite (Phase 3 Requirement 4)', () => {
  const installationId = 77801;
  const githubRepoId = 88901;
  const prNumber = 404;
  const commitA = 'commit-aaa-1111111111111111111111111111';
  const commitB = 'commit-bbb-2222222222222222222222222222';

  let dbInst: any;
  let dbRepo: any;
  let dbPr: any;

  before(async () => {
    if (!(await isDatabaseAvailable())) return;

    dbInst = await prisma.installation.upsert({
      where: { githubInstallationId: BigInt(installationId) },
      update: {},
      create: {
        githubInstallationId: BigInt(installationId),
        accountLogin: 'stale-test-org',
        accountType: 'Organization',
      },
    });

    dbRepo = await prisma.repository.upsert({
      where: { githubRepoId: BigInt(githubRepoId) },
      update: {},
      create: {
        installationId: dbInst.id,
        githubRepoId: BigInt(githubRepoId),
        fullName: 'stale-test-org/stale-test-repo',
        defaultBranch: 'main',
      },
    });

    dbPr = await prisma.pullRequest.upsert({
      where: {
        repositoryId_githubPrNumber: {
          repositoryId: dbRepo.id,
          githubPrNumber: prNumber,
        },
      },
      update: { headSha: commitA },
      create: {
        repositoryId: dbRepo.id,
        githubPrNumber: prNumber,
        title: 'Test PR for Stale Commit Protection',
        author: 'developer-1',
        state: 'open',
        headSha: commitA,
      },
    });
  });

  after(async () => {
    if (await isDatabaseAvailable() && dbPr) {
      try {
        await prisma.reviewIssue.deleteMany({
          where: { review: { pullRequestId: dbPr.id } },
        });
        await prisma.review.deleteMany({
          where: { pullRequestId: dbPr.id },
        });
        await prisma.pullRequest.deleteMany({
          where: { id: dbPr.id },
        });
        if (dbRepo) {
          await prisma.repository.deleteMany({
            where: { id: dbRepo.id },
          });
        }
        if (dbInst) {
          await prisma.installation.deleteMany({
            where: { id: dbInst.id },
          });
        }
      } catch {
        // ignore
      }
    }
  });

  it('aborts posting and marks review superseded when GitHub PR HEAD changes mid-flight', async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('Database is offline');
      return;
    }
    let pullsGetCallCount = 0;
    let createReviewCalled = false;

    // Custom mock Octokit:
    // First call (initial check at step 4): returns commit A
    // Second call (pre-posting check at step 15): returns commit B (stale commit scenario)
    const mockOctokit = {
      rest: {
        pulls: {
          get: async () => {
            pullsGetCallCount++;
            if (pullsGetCallCount === 1) {
              return { data: { head: { sha: commitA } } };
            } else {
              return { data: { head: { sha: commitB } } };
            }
          },
          getReview: async () => ({ data: [] }),
          listReviews: async () => ({ data: [] }),
          listReviewComments: async () => ({ data: [] }),
          createReview: async () => {
            createReviewCalled = true;
            return { data: { id: 9999 } };
          },
          createReviewComment: async () => {
            createReviewCalled = true;
            return { data: { id: 8888 } };
          },
        },
        issues: {
          listComments: async () => ({ data: [] }),
          createComment: async () => {
            createReviewCalled = true;
            return { data: { id: 7777 } };
          },
        },
        repos: {
          getContent: async () => {
            throw new Error('Not found');
          },
        },
        users: {
          getAuthenticated: async () => ({ data: { id: 12345 } }),
        },
      },
    };

    const mockDiff = `diff --git a/src/app.ts b/src/app.ts
index 0000000..1111111 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -0,0 +1,5 @@
+export function add(a: number, b: number): number {
+  return a + b;
+}
`;

    const jobData: ReviewJobData = {
      type: 'review-pr',
      installationId,
      repoId: dbRepo.id,
      githubRepoId,
      prNumber,
      commitSha: commitA,
      repoFullName: 'stale-test-org/stale-test-repo',
      title: 'PR update',
      author: 'dev',
      receivedAt: Date.now(),
    };

    const mockLlm = {
      reviewChunk: async () => ({
        issues: [],
        overall_assessment: 'Looks good',
      }),
    };

    // Assert that HeadShaChangedError is thrown
    await assert.rejects(
      async () => {
        await processReviewJob(jobData, mockDiff, undefined, 'stale-test-job-1', {
          octokitOverride: mockOctokit,
          llmProviderOverride: mockLlm,
        });
      },
      (err: any) => {
        assert.ok(err instanceof HeadShaChangedError, 'Must throw HeadShaChangedError');
        assert.equal(err.jobSha, commitA);
        assert.equal(err.currentSha, commitB);
        return true;
      }
    );

    // Assert that NO review was posted to GitHub
    assert.equal(
      createReviewCalled,
      false,
      'Must NEVER post review comments or summary to GitHub when PR HEAD has changed'
    );

    // Assert database review state is marked superseded
    const reviewInDb = await prisma.review.findUnique({
      where: {
        pullRequestId_commitSha: {
          pullRequestId: dbPr.id,
          commitSha: commitA,
        },
      },
    });

    assert.ok(reviewInDb, 'Review record must exist');
    assert.equal(
      reviewInDb.status,
      'superseded',
      `Review status must be 'superseded', got '${reviewInDb.status}'`
    );
    assert.ok(
      reviewInDb.summary?.includes('Superseded by newer commit'),
      `Summary must mention superseded commit, got: ${reviewInDb.summary}`
    );
  });
});
