import { z } from 'zod';

export const SeveritySchema = z.enum(['critical', 'warning', 'suggestion']);

export const CategorySchema = z.enum([
  'bug',
  'security',
  'style',
  'performance',
  'maintainability',
]);

export const CertaintySchema = z.enum(['confirmed', 'probable', 'speculative']);

export const TraceablePathSchema = z.object({
  diff: z.object({
    filePath: z.string(),
    lineNumber: z.number().int().positive(),
    codeSnippet: z.string(),
  }),
  evidence: z.string(),
  reasoning: z.string(),
  classification: z.object({
    category: CategorySchema,
    cwe: z.string().nullable().optional(),
    owasp: z.string().nullable().optional(),
  }),
  severity: SeveritySchema,
  remediation: z.object({
    guidance: z.string(),
    suggestedFix: z.string().nullable().optional(),
  }),
});

export const ReviewIssueSchema = z.object({
  file_path: z
    .string()
    .min(1, 'file_path cannot be empty')
    .max(500, 'file_path exceeds maximum length')
    .refine((p) => !p.includes('\0'), 'file_path cannot contain null bytes')
    .refine((p) => !p.includes('..'), 'Path traversal detected in file_path')
    .refine(
      (p) => !p.startsWith('/') && !p.startsWith('\\') && !/^[a-zA-Z]:/.test(p),
      'file_path must be a relative path'
    ),
  line_number: z.number().int().positive('line_number must be a positive integer'),
  severity: SeveritySchema,
  category: CategorySchema,
  message: z.string().min(1, 'message is required').max(5000, 'message exceeds maximum length'),
  suggested_fix: z.string().max(5000, 'suggested_fix exceeds maximum length').nullable().optional(),
  current_code: z.string().max(5000).nullable().optional(),
  surrounding_code: z.string().max(10000).nullable().optional(),
  cwe: z.string().max(100).nullable().optional(),
  owasp: z.string().max(100).nullable().optional(),
  evidence: z.string().max(2000).nullable().optional(),
  source: z
    .enum(['llm', 'eslint', 'ruff', 'bandit', 'regex', 'static', 'static_analysis', 'dependency_scan', 'hybrid'])
    .optional()
    .default('llm'),
  confidence: z.number().min(0).max(1).optional().default(1.0),
  fingerprint: z.string().optional(),
  github_comment_id: z.union([z.number(), z.bigint()]).optional(),
  impact: z.string().max(5000).nullable().optional(),
  attack_scenario: z.string().max(5000).nullable().optional(),
  affected_code: z.string().max(5000).nullable().optional(),
  remediation: z.string().max(5000).nullable().optional(),
  reasoning: z.string().max(5000).nullable().optional(),
  certainty: CertaintySchema.optional().default('confirmed'),
  supporting_evidence: z.string().max(5000).nullable().optional(),
  calibrated_confidence: z.number().min(0).max(1).nullable().optional(),
  risk_score: z.number().min(0).max(100).nullable().optional(),
  escalation_status: z.enum(['NORMAL', 'REVIEW_REQUIRED', 'ESCALATED']).optional().default('NORMAL'),
  traceable_path: TraceablePathSchema.nullable().optional(),
});

export const ReviewResultSchema = z.object({
  issues: z.array(ReviewIssueSchema).max(100, 'Too many issues in single chunk response'),
  overall_assessment: z.string().min(1, 'overall_assessment cannot be empty').max(10000, 'overall_assessment exceeds maximum length'),
});

import { DEFAULT_IGNORED_GLOBS } from './diff.js';

export const RepoConfigSchema = z.object({
  ignored_globs: z.array(z.string()).optional().default(DEFAULT_IGNORED_GLOBS),
  severity_threshold: SeveritySchema.optional().default('suggestion'),
  disabled_categories: z.array(CategorySchema).optional().default([]),
  max_comments_per_pr: z.number().int().min(1).max(100).optional().default(25),
  auto_approve: z.boolean().optional().default(false),
  block_on_critical: z.boolean().optional().default(false),
  skip_drafts: z.boolean().optional().default(true),
  skip_bot_authors: z.boolean().optional().default(true),
  max_files_per_pr: z.number().int().min(1).max(500).optional().default(50),
  max_lines_per_pr: z.number().int().min(10).max(50000).optional().default(1000),
  confidence_threshold: z.number().min(0).max(1).optional().default(0.7),
  include_style_nitpicks: z.boolean().optional().default(false),
});

export const ReviewJobDataSchema = z.object({
  type: z.literal('review-pr').optional().default('review-pr'),
  installationId: z.number().int(),
  repoId: z.number().int().optional(),
  githubRepoId: z.number().int(),
  prNumber: z.number().int(),
  commitSha: z.string().min(1),
  repoFullName: z.string(),
  headBranch: z.string().optional(),
  baseBranch: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  authorType: z.string().optional(),
  draft: z.boolean().optional(),
  receivedAt: z.number().int().optional(),
  defaultBranch: z.string().optional(),
  ownerLogin: z.string().optional(),
  ownerType: z.string().optional(),
});

export const PRClosedJobDataSchema = z.object({
  type: z.literal('pr-closed'),
  githubRepoId: z.number().int(),
  prNumber: z.number().int(),
  merged: z.boolean(),
  mergedAt: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  receivedAt: z.number().int().optional(),
});

export const InstallationSyncJobDataSchema = z.object({
  type: z.literal('installation-sync'),
  action: z.string(),
  githubInstallationId: z.number().int(),
  accountLogin: z.string(),
  accountType: z.string(),
  repositories: z
    .array(
      z.object({
        id: z.number().int(),
        fullName: z.string(),
      })
    )
    .optional(),
  receivedAt: z.number().int().optional(),
});

export const InstallationReposSyncJobDataSchema = z.object({
  type: z.literal('installation-repositories-sync'),
  action: z.string(),
  githubInstallationId: z.number().int(),
  added: z.array(
    z.object({
      id: z.number().int(),
      fullName: z.string(),
    })
  ),
  removed: z.array(
    z.object({
      id: z.number().int(),
      fullName: z.string(),
    })
  ),
  receivedAt: z.number().int().optional(),
});

export const QueueJobDataSchema = z.union([
  ReviewJobDataSchema,
  PRClosedJobDataSchema,
  InstallationSyncJobDataSchema,
  InstallationReposSyncJobDataSchema,
]);

// Webhook payload schemas
export const GitHubPullRequestWebhookSchema = z.object({
  action: z.string(),
  number: z.number().int(),
  pull_request: z.object({
    number: z.number().int(),
    title: z.string().nullable().optional(),
    draft: z.boolean().optional().default(false),
    state: z.string().optional(),
    merged: z.boolean().optional().default(false),
    merged_at: z.string().nullable().optional(),
    closed_at: z.string().nullable().optional(),
    user: z.object({
      login: z.string(),
      type: z.string().optional(),
    }),
    head: z.object({
      sha: z.string(),
      ref: z.string().optional(),
    }),
    base: z.object({
      ref: z.string().optional(),
    }),
  }),
  repository: z.object({
    id: z.number().int(),
    name: z.string(),
    full_name: z.string(),
    default_branch: z.string().nullable().optional(),
    owner: z
      .object({
        login: z.string(),
        type: z.string().optional(),
      })
      .optional(),
  }),
  installation: z
    .object({
      id: z.number().int(),
    })
    .optional(),
  sender: z
    .object({
      login: z.string(),
      type: z.string().optional(),
    })
    .optional(),
});

export const GitHubInstallationWebhookSchema = z.object({
  action: z.enum(['created', 'deleted', 'suspend', 'unsuspend']),
  installation: z.object({
    id: z.number().int(),
    account: z.object({
      login: z.string(),
      type: z.string(),
    }),
  }),
  repositories: z
    .array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        full_name: z.string(),
      })
    )
    .optional(),
});

export const GitHubInstallationRepositoriesWebhookSchema = z.object({
  action: z.enum(['added', 'removed']),
  installation: z.object({
    id: z.number().int(),
    account: z.object({
      login: z.string(),
      type: z.string(),
    }),
  }),
  repositories_added: z
    .array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        full_name: z.string(),
      })
    )
    .optional()
    .default([]),
  repositories_removed: z
    .array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        full_name: z.string(),
      })
    )
    .optional()
    .default([]),
});

