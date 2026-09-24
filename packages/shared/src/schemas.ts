import { z } from 'zod';

export const SeveritySchema = z.enum(['critical', 'warning', 'suggestion']);

export const CategorySchema = z.enum([
  'bug',
  'security',
  'style',
  'performance',
  'maintainability',
]);

export const ReviewIssueSchema = z.object({
  file_path: z.string().min(1, 'file_path cannot be empty'),
  line_number: z.number().int().positive('line_number must be a positive integer'),
  severity: SeveritySchema,
  category: CategorySchema,
  message: z.string().min(1, 'message is required'),
  suggested_fix: z.string().nullable().optional(),
  source: z.enum(['llm', 'static_analysis']).optional().default('llm'),
});

export const ReviewResultSchema = z.object({
  issues: z.array(ReviewIssueSchema),
  overall_assessment: z.string().min(1, 'overall_assessment cannot be empty'),
});

export const RepoConfigSchema = z.object({
  ignored_globs: z.array(z.string()).optional().default([
    '*.lock',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'dist/**',
    'build/**',
    'node_modules/**',
    '*.min.js',
    '*.min.css',
  ]),
  severity_threshold: SeveritySchema.optional().default('suggestion'),
  disabled_categories: z.array(CategorySchema).optional().default([]),
  max_comments_per_pr: z.number().int().min(1).max(100).optional().default(25),
  auto_approve: z.boolean().optional().default(false),
});

export const ReviewJobDataSchema = z.object({
  installationId: z.number().int(),
  repoId: z.number().int(),
  prNumber: z.number().int(),
  commitSha: z.string().min(1),
  repoFullName: z.string().optional(),
  headBranch: z.string().optional(),
  baseBranch: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
});
