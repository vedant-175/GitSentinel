import { RepoConfig } from '@ai-reviewer/shared';

export interface FallbackIssue {
  id: number;
  filePath: string;
  lineNumber: number | null;
  severity: string;
  category: string;
  message: string;
  suggestedFix?: string | null;
  source: string;
}

export interface FallbackReview {
  id: number;
  commitSha: string;
  status: string;
  verdict: string | null;
  summary: string | null;
  latencyMs: number | null;
  completedAt: Date | null;
  startedAt: Date;
  issues: FallbackIssue[];
}

export interface FallbackPullRequest {
  id: number;
  githubPrNumber: number;
  title: string | null;
  author: string | null;
  state: string | null;
  openedAt: Date | null;
  repositoryId?: number;
  repository: {
    id: number;
    fullName: string;
    defaultBranch?: string | null;
    config?: unknown;
  };
  reviews: FallbackReview[];
}

export interface FallbackRepository {
  id: number;
  githubRepoId: bigint;
  fullName: string;
  defaultBranch: string | null;
  config: unknown;
  installation?: {
    accountLogin: string;
    accountType: string;
  } | null;
  pullRequests: FallbackPullRequest[];
}

const NOW = Date.now();

export const FALLBACK_REPOSITORIES: FallbackRepository[] = [
  {
    id: 1,
    githubRepoId: BigInt(672839102),
    fullName: 'acme-corp/payment-service',
    defaultBranch: 'main',
    config: {
      ignored_globs: ['*.lock', 'dist/**', '*.spec.ts'],
      severity_threshold: 'suggestion',
      disabled_categories: [],
      max_comments_per_pr: 25,
    },
    installation: {
      accountLogin: 'acme-corp',
      accountType: 'Organization',
    },
    pullRequests: [
      {
        id: 1,
        repositoryId: 1,
        githubPrNumber: 142,
        title: 'feat: Add Stripe webhook signature verification and checkout session idempotency',
        author: 'johndoe',
        state: 'open',
        openedAt: new Date(NOW - 1000 * 60 * 60 * 3),
        repository: {
          id: 1,
          fullName: 'acme-corp/payment-service',
          defaultBranch: 'main',
        },
        reviews: [
          {
            id: 1,
            commitSha: 'a92b7c18f294029d9183746a8192039485710293',
            status: 'completed',
            verdict: 'REQUEST_CHANGES',
            summary: 'Found 1 critical security vulnerability (unhandled Stripe webhook replay) and 1 performance bottleneck in query batching.',
            startedAt: new Date(NOW - 1000 * 60 * 60 * 3),
            completedAt: new Date(NOW - 1000 * 60 * 60 * 3 + 1000 * 42),
            latencyMs: 42000,
            issues: [
              {
                id: 101,
                filePath: 'src/services/stripe.ts',
                lineNumber: 48,
                severity: 'critical',
                category: 'security',
                message: 'Webhook handler does not verify timestamp tolerance, allowing potential replay attacks if the signature buffer is re-transmitted.',
                suggestedFix: 'stripe.webhooks.constructEvent(payload, sig, endpointSecret, 300); // 300s tolerance limit',
                source: 'llm',
              },
              {
                id: 102,
                filePath: 'src/services/stripe.ts',
                lineNumber: 112,
                severity: 'warning',
                category: 'performance',
                message: 'Individual database query executed inside for-loop for line items (N+1 query pattern).',
                suggestedFix: 'await prisma.orderItem.createMany({ data: lineItems.map(...) });',
                source: 'llm',
              },
              {
                id: 103,
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
        ],
      },
      {
        id: 2,
        repositoryId: 1,
        githubPrNumber: 141,
        title: 'fix(auth): Prevent timing attack on API token comparison',
        author: 'sarah-connor',
        state: 'merged',
        openedAt: new Date(NOW - 1000 * 60 * 60 * 28),
        repository: {
          id: 1,
          fullName: 'acme-corp/payment-service',
          defaultBranch: 'main',
        },
        reviews: [
          {
            id: 2,
            commitSha: '4d8e1a77b8923049182746192847592817293847',
            status: 'completed',
            verdict: 'APPROVE',
            summary: 'Clean implementation of crypto.timingSafeEqual for token comparison. Static analysis and security audit passed with zero critical issues.',
            startedAt: new Date(NOW - 1000 * 60 * 60 * 28),
            completedAt: new Date(NOW - 1000 * 60 * 60 * 28 + 1000 * 35),
            latencyMs: 35000,
            issues: [
              {
                id: 104,
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
        ],
      },
    ],
  },
  {
    id: 2,
    githubRepoId: BigInt(819203948),
    fullName: 'acme-corp/user-portal',
    defaultBranch: 'main',
    config: {
      ignored_globs: ['*.min.js', 'public/vendor/**'],
      severity_threshold: 'warning',
      disabled_categories: ['style'],
      max_comments_per_pr: 20,
    },
    installation: {
      accountLogin: 'acme-corp',
      accountType: 'Organization',
    },
    pullRequests: [
      {
        id: 3,
        repositoryId: 2,
        githubPrNumber: 88,
        title: 'refactor: Migrate customer dashboard table to virtualized list',
        author: 'emily-chen',
        state: 'open',
        openedAt: new Date(NOW - 1000 * 60 * 60 * 5),
        repository: {
          id: 2,
          fullName: 'acme-corp/user-portal',
          defaultBranch: 'main',
        },
        reviews: [
          {
            id: 3,
            commitSha: 'f3c21a998b172635481928374619283746192834',
            status: 'completed',
            verdict: 'COMMENT',
            summary: 'Virtualization improves render performance. Minor memory leak warning regarding unsubscribed resize listener.',
            startedAt: new Date(NOW - 1000 * 60 * 60 * 5),
            completedAt: new Date(NOW - 1000 * 60 * 60 * 5 + 1000 * 48),
            latencyMs: 48000,
            issues: [
              {
                id: 105,
                filePath: 'src/components/CustomerTable.tsx',
                lineNumber: 74,
                severity: 'warning',
                category: 'bug',
                message: 'Window resize event listener attached in useEffect hook is missing a cleanup teardown function.',
                suggestedFix: 'return () => window.removeEventListener("resize", handleResize);',
                source: 'static_analysis',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 3,
    githubRepoId: BigInt(992019283),
    fullName: 'alex-developer/fast-api-gateway',
    defaultBranch: 'master',
    config: {
      ignored_globs: ['venv/**', '__pycache__/**'],
      severity_threshold: 'suggestion',
      disabled_categories: [],
      max_comments_per_pr: 30,
    },
    installation: {
      accountLogin: 'alex-developer',
      accountType: 'User',
    },
    pullRequests: [
      {
        id: 4,
        repositoryId: 3,
        githubPrNumber: 23,
        title: 'perf: Implement Redis caching layer for GraphQL resolver queries',
        author: 'alex-developer',
        state: 'open',
        openedAt: new Date(NOW - 1000 * 60 * 60 * 12),
        repository: {
          id: 3,
          fullName: 'alex-developer/fast-api-gateway',
          defaultBranch: 'master',
        },
        reviews: [
          {
            id: 4,
            commitSha: '871a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a',
            status: 'completed',
            verdict: 'REQUEST_CHANGES',
            summary: 'Identified 1 critical cache invalidation race condition and 1 unhandled Redis timeout connection error.',
            startedAt: new Date(NOW - 1000 * 60 * 60 * 12),
            completedAt: new Date(NOW - 1000 * 60 * 60 * 12 + 1000 * 55),
            latencyMs: 55000,
            issues: [
              {
                id: 106,
                filePath: 'gateway/cache/redis.py',
                lineNumber: 52,
                severity: 'critical',
                category: 'bug',
                message: 'Redis pipeline is not wrapped in a try/except with fallback to origin database when connection drops.',
                suggestedFix: 'except (redis.ConnectionError, redis.TimeoutError):\n    logger.warning("Cache unavailable, falling back to db")\n    return await fetch_from_db()',
                source: 'llm',
              },
            ],
          },
        ],
      },
    ],
  },
];
