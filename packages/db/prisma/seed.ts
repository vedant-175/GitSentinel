import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data
  await prisma.reviewIssue.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.pullRequest.deleteMany({});
  await prisma.repository.deleteMany({});
  await prisma.installation.deleteMany({});

  // 1. Create Installations
  const inst1 = await prisma.installation.create({
    data: {
      githubInstallationId: BigInt(94827104),
      accountLogin: 'acme-corp',
      accountType: 'Organization',
    },
  });

  const inst2 = await prisma.installation.create({
    data: {
      githubInstallationId: BigInt(51928374),
      accountLogin: 'alex-developer',
      accountType: 'User',
    },
  });

  // 2. Create Repositories
  const repo1 = await prisma.repository.create({
    data: {
      installationId: inst1.id,
      githubRepoId: BigInt(672839102),
      fullName: 'acme-corp/payment-service',
      defaultBranch: 'main',
      config: {
        ignored_globs: ['*.lock', 'dist/**', '*.spec.ts'],
        severity_threshold: 'suggestion',
        disabled_categories: [],
        max_comments_per_pr: 25,
      },
    },
  });

  const repo2 = await prisma.repository.create({
    data: {
      installationId: inst1.id,
      githubRepoId: BigInt(819203948),
      fullName: 'acme-corp/user-portal',
      defaultBranch: 'main',
      config: {
        ignored_globs: ['*.min.js', 'public/vendor/**'],
        severity_threshold: 'warning',
        disabled_categories: ['style'],
        max_comments_per_pr: 20,
      },
    },
  });

  const repo3 = await prisma.repository.create({
    data: {
      installationId: inst2.id,
      githubRepoId: BigInt(992019283),
      fullName: 'alex-developer/fast-api-gateway',
      defaultBranch: 'master',
      config: {
        ignored_globs: ['venv/**', '__pycache__/**'],
        severity_threshold: 'suggestion',
        disabled_categories: [],
        max_comments_per_pr: 30,
      },
    },
  });

  // 3. Create Pull Requests
  const pr1 = await prisma.pullRequest.create({
    data: {
      repositoryId: repo1.id,
      githubPrNumber: 142,
      title: 'feat: Add Stripe webhook signature verification and checkout session idempotency',
      author: 'johndoe',
      state: 'open',
      openedAt: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3 hours ago
    },
  });

  const pr2 = await prisma.pullRequest.create({
    data: {
      repositoryId: repo1.id,
      githubPrNumber: 141,
      title: 'fix(auth): Prevent timing attack on API token comparison',
      author: 'sarah-connor',
      state: 'merged',
      openedAt: new Date(Date.now() - 1000 * 60 * 60 * 28),
    },
  });

  const pr3 = await prisma.pullRequest.create({
    data: {
      repositoryId: repo2.id,
      githubPrNumber: 88,
      title: 'refactor: Migrate customer dashboard table to virtualized list',
      author: 'emily-chen',
      state: 'open',
      openedAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
  });

  const pr4 = await prisma.pullRequest.create({
    data: {
      repositoryId: repo3.id,
      githubPrNumber: 23,
      title: 'perf: Implement Redis caching layer for GraphQL resolver queries',
      author: 'alex-developer',
      state: 'open',
      openedAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
    },
  });

  // 4. Create Reviews & Issues
  // Review 1 (for PR 1, commit a92b7c1)
  const rev1 = await prisma.review.create({
    data: {
      pullRequestId: pr1.id,
      commitSha: 'a92b7c18f294029d9183746a8192039485710293',
      status: 'completed',
      verdict: 'REQUEST_CHANGES',
      summary: 'Found 1 critical security vulnerability (unhandled Stripe webhook replay) and 1 performance bottleneck in query batching.',
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      completedAt: new Date(Date.now() - 1000 * 60 * 60 * 3 + 1000 * 42),
      latencyMs: 42000,
      issues: {
        create: [
          {
            filePath: 'src/services/stripe.ts',
            lineNumber: 48,
            severity: 'critical',
            category: 'security',
            message: 'Webhook handler does not verify timestamp tolerance, allowing potential replay attacks if the signature buffer is re-transmitted.',
            suggestedFix: 'stripe.webhooks.constructEvent(payload, sig, endpointSecret, 300); // 300s tolerance limit',
            source: 'llm',
          },
          {
            filePath: 'src/services/stripe.ts',
            lineNumber: 112,
            severity: 'warning',
            category: 'performance',
            message: 'Individual database query executed inside for-loop for line items (N+1 query pattern).',
            suggestedFix: 'await prisma.orderItem.createMany({ data: lineItems.map(...) });',
            source: 'llm',
          },
          {
            filePath: 'src/controllers/checkout.ts',
            lineNumber: 29,
            severity: 'suggestion',
            category: 'style',
            message: 'Prefer standard Error subclass or structured HTTP response instead of throwing raw string error.',
            suggestedFix: 'throw new BadRequestException("Invalid customer session token");',
            source: 'llm',
          },
        ],
      },
    },
  });

  // Review 2 (for PR 2, commit 4d8e1a7)
  await prisma.review.create({
    data: {
      pullRequestId: pr2.id,
      commitSha: '4d8e1a77b8923049182746192847592817293847',
      status: 'completed',
      verdict: 'APPROVE',
      summary: 'Clean implementation of crypto.timingSafeEqual for token comparison. Static analysis and security audit passed with zero critical issues.',
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 28),
      completedAt: new Date(Date.now() - 1000 * 60 * 60 * 28 + 1000 * 35),
      latencyMs: 35000,
      issues: {
        create: [
          {
            filePath: 'src/utils/security.ts',
            lineNumber: 34,
            severity: 'suggestion',
            category: 'maintainability',
            message: 'Add JSDoc annotation documenting that both buffers must have identical byte length before calling timingSafeEqual.',
            suggestedFix: '/** Compares two buffers with constant-time equality check */',
            source: 'llm',
          },
        ],
      },
    },
  });

  // Review 3 (for PR 3, commit f3c21a9)
  await prisma.review.create({
    data: {
      pullRequestId: pr3.id,
      commitSha: 'f3c21a998b172635481928374619283746192834',
      status: 'completed',
      verdict: 'COMMENT',
      summary: 'Virtualization improves render performance. Minor memory leak warning regarding unsubscribed resize listener.',
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
      completedAt: new Date(Date.now() - 1000 * 60 * 60 * 5 + 1000 * 48),
      latencyMs: 48000,
      issues: {
        create: [
          {
            filePath: 'src/components/CustomerTable.tsx',
            lineNumber: 74,
            severity: 'warning',
            category: 'bug',
            message: 'Window resize event listener attached in useEffect hook is missing a cleanup teardown function.',
            suggestedFix: 'return () => window.removeEventListener("resize", handleResize);',
            source: 'static_analysis',
          },
          {
            filePath: 'src/components/CustomerTable.tsx',
            lineNumber: 130,
            severity: 'suggestion',
            category: 'performance',
            message: 'useCallback missing dependencies [pageSize, sortColumn], causing potential stale closure when paging changes.',
            suggestedFix: '}, [pageSize, sortColumn]);',
            source: 'llm',
          },
        ],
      },
    },
  });

  // Review 4 (for PR 4, commit 871a2b3)
  await prisma.review.create({
    data: {
      pullRequestId: pr4.id,
      commitSha: '871a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a',
      status: 'completed',
      verdict: 'REQUEST_CHANGES',
      summary: 'Identified 1 critical cache invalidation race condition and 1 unhandled Redis timeout connection error.',
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
      completedAt: new Date(Date.now() - 1000 * 60 * 60 * 12 + 1000 * 55),
      latencyMs: 55000,
      issues: {
        create: [
          {
            filePath: 'gateway/cache/redis.py',
            lineNumber: 52,
            severity: 'critical',
            category: 'bug',
            message: 'Redis pipeline is not wrapped in a try/except with fallback to origin database when connection drops.',
            suggestedFix: 'except (redis.ConnectionError, redis.TimeoutError):\n    logger.warning("Cache unavailable, falling back to db")\n    return await fetch_from_db()',
            source: 'llm',
          },
          {
            filePath: 'gateway/resolvers/user.py',
            lineNumber: 89,
            severity: 'warning',
            category: 'security',
            message: 'Cache key incorporates raw user query parameter without sanitization, exposing cache poisoning risk.',
            suggestedFix: 'cache_key = f"user:{hashlib.sha256(user_id.encode()).hexdigest()}"',
            source: 'llm',
          },
        ],
      },
    },
  });

  console.log('✅ Database seeded successfully with 2 installations, 3 repos, 4 PRs, 4 reviews, and 7 issues!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
