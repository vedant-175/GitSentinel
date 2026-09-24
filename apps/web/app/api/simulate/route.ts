import { NextResponse } from 'next/server';
import { prisma } from '@ai-reviewer/db';
import { enqueueReviewJob } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const SIMULATED_DIFF = `diff --git a/src/services/billing.ts b/src/services/billing.ts
index 98a12bc..45d78ef 100644
--- a/src/services/billing.ts
+++ b/src/services/billing.ts
@@ -20,6 +20,11 @@ export async function chargeCustomer(customerId: string, amount: number) {
   if (amount <= 0) throw new Error("Invalid charge amount");
+  // TODO: Fix this before production
+  const stripeKey = "AKIAIOSFODNN7EXAMPLE";
+  const rawSql = "UPDATE accounts SET balance = balance - " + amount + " WHERE customer_id = '" + customerId + "'";
+  await db.execute(rawSql);
+  console.log("Charged customer:", customerId);
   return { status: "success", transactionId: "tx_mock_123" };
 }
`;

export async function POST() {
  try {
    let repo = await prisma.repository.findFirst({
      include: { installation: true },
    });

    if (!repo) {
      const inst = await prisma.installation.create({
        data: {
          githubInstallationId: BigInt(888123999),
          accountLogin: 'acme-corp',
          accountType: 'Organization',
        },
      });

      repo = await prisma.repository.create({
        data: {
          installationId: inst.id,
          githubRepoId: BigInt(777123999),
          fullName: 'acme-corp/billing-service',
          defaultBranch: 'main',
          config: {
            ignored_globs: ['*.lock', 'dist/**'],
            severity_threshold: 'suggestion',
            disabled_categories: [],
            max_comments_per_pr: 25,
          },
        },
        include: { installation: true },
      });
    }

    const prNumber = Math.floor(Math.random() * 800) + 100;
    const commitSha = Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const pullRequest = await prisma.pullRequest.create({
      data: {
        repositoryId: repo.id,
        githubPrNumber: prNumber,
        title: `feat: Add one-click recurring payment and customer charge #${prNumber}`,
        author: 'developer-jane',
        state: 'open',
      },
    });

    const jobId = await enqueueReviewJob({
      installationId: Number(repo.installation?.githubInstallationId || 1),
      repoId: repo.id,
      prNumber: pullRequest.githubPrNumber,
      commitSha,
      repoFullName: repo.fullName,
      title: pullRequest.title || undefined,
      author: pullRequest.author || undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Simulated PR review enqueued to Redis Queue',
      jobId,
      prId: pullRequest.id,
      prNumber: pullRequest.githubPrNumber,
      commitSha,
    });
  } catch (error) {
    console.error('Failed to trigger simulation:', error);
    return NextResponse.json(
      { error: 'Failed to enqueue simulated PR review' },
      { status: 500 }
    );
  }
}
