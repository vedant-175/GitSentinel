export type Severity = 'critical' | 'warning' | 'suggestion';

export type Category =
  | 'bug'
  | 'security'
  | 'style'
  | 'performance'
  | 'maintainability';

export type CertaintyLevel = 'confirmed' | 'probable' | 'speculative';

export interface TraceablePath {
  diff: {
    filePath: string;
    lineNumber: number;
    codeSnippet: string;
  };
  evidence: string;
  reasoning: string;
  classification: {
    category: Category;
    cwe?: string | null;
    owasp?: string | null;
  };
  severity: Severity;
  remediation: {
    guidance: string;
    suggestedFix?: string | null;
  };
}

export interface ReviewIssue {
  file_path: string;
  line_number: number;
  severity: Severity;
  category: Category;
  message: string;
  suggested_fix?: string | null;
  current_code?: string | null;
  surrounding_code?: string | null;
  cwe?: string | null;
  owasp?: string | null;
  evidence?: string | null;
  source?: 'llm' | 'eslint' | 'ruff' | 'bandit' | 'regex' | 'static' | 'static_analysis' | 'dependency_scan' | 'hybrid';
  confidence?: number;
  fingerprint?: string;
  github_comment_id?: number | bigint;
  line_content?: string;
  status?: string;
  impact?: string | null;
  attack_scenario?: string | null;
  affected_code?: string | null;
  remediation?: string | null;
  reasoning?: string | null;
  certainty?: CertaintyLevel | null;
  supporting_evidence?: string | null;
  calibrated_confidence?: number | null;
  risk_score?: number | null;
  escalation_status?: 'NORMAL' | 'REVIEW_REQUIRED' | 'ESCALATED' | null;
  traceable_path?: TraceablePath | null;
}

export interface StructuredSummary {
  whatChanged: string;
  riskLevel: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW';
  criticalIssues: string[];
  warnings: string[];
  suggestions: string[];
  securityImpact: string;
  testingImpact: string;
  deterministicFindingsCount: number;
  aiFindingsCount: number;
}

export interface ReviewResult {
  issues: ReviewIssue[];
  overall_assessment: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string;
  promptHash?: string;
  latencyMs?: number;
}

export interface RepoConfig {
  ignored_globs?: string[];
  severity_threshold?: Severity;
  disabled_categories?: Category[];
  max_comments_per_pr?: number;
  auto_approve?: boolean;
  block_on_critical?: boolean;
  skip_drafts?: boolean;
  skip_bot_authors?: boolean;
  max_files_per_pr?: number;
  max_lines_per_pr?: number;
  confidence_threshold?: number;
  include_style_nitpicks?: boolean;
}

export interface ReviewJobData {
  type?: 'review-pr';
  installationId: number;
  repoId?: number;
  githubRepoId: number;
  prNumber: number;
  commitSha: string;
  repoFullName: string;
  headBranch?: string;
  baseBranch?: string;
  title?: string;
  author?: string;
  authorType?: string;
  draft?: boolean;
  receivedAt?: number;
  defaultBranch?: string;
  ownerLogin?: string;
  ownerType?: string;
  correlationId?: string;
  deliveryId?: string;
  retryCount?: number;
  stageTimings?: Record<string, StageTimingRecord>;
}

export interface PRClosedJobData {
  type: 'pr-closed';
  githubRepoId: number;
  prNumber: number;
  merged: boolean;
  mergedAt?: string | null;
  closedAt?: string | null;
  receivedAt?: number;
}

export interface InstallationSyncJobData {
  type: 'installation-sync';
  action: string;
  githubInstallationId: number;
  accountLogin: string;
  accountType: string;
  repositories?: Array<{
    id: number;
    fullName: string;
  }>;
  receivedAt?: number;
}

export interface InstallationReposSyncJobData {
  type: 'installation-repositories-sync';
  action: string;
  githubInstallationId: number;
  added: Array<{
    id: number;
    fullName: string;
  }>;
  removed: Array<{
    id: number;
    fullName: string;
  }>;
  receivedAt?: number;
}

export type QueueJobData =
  | ReviewJobData
  | PRClosedJobData
  | InstallationSyncJobData
  | InstallationReposSyncJobData;

export interface StructuredDiffLine {
  type: 'header' | 'add' | 'delete' | 'context' | 'eof';
  text: string;
  raw: string;
  newLineNumber?: number;
  oldLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
  /** Line numbers in the new file corresponding to added (+) lines */
  addedLineNumbers: number[];
  /** Valid target lines in the new file within this hunk (both context and added lines) */
  validNewLines: number[];
  structuredLines?: StructuredDiffLine[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: DiffHunk[];
  rawDiff: string;
  isBinary?: boolean;
}

export interface AddedCodeLine {
  lineNumber: number;
  content: string;
}

export type ReviewLifecycleStage =
  | 'github_webhook'
  | 'webhook_validation'
  | 'queue_enqueue'
  | 'worker_start'
  | 'repository_fetch'
  | 'diff_generation'
  | 'static_analysis'
  | 'llm_analysis'
  | 'finding_validation'
  | 'persistence'
  | 'review_completion';

export type StageExecutionStatus = 'success' | 'failed' | 'skipped' | 'in_progress';

export type ObservabilityErrorCategory =
  | 'none'
  | 'validation_error'
  | 'auth_error'
  | 'rate_limit'
  | 'timeout'
  | 'llm_error'
  | 'stale_commit'
  | 'db_error'
  | 'syntax_error'
  | 'unknown';

export interface StageTimingRecord {
  stage: ReviewLifecycleStage;
  durationMs: number;
  status: StageExecutionStatus;
  errorCategory?: ObservabilityErrorCategory;
  errorMessage?: string;
  retryCount: number;
  jobId: string;
  reviewId: number | null;
  repositoryId: number | null;
  commitSha: string;
  correlationId: string;
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ReviewLifecycleTrace {
  correlationId: string;
  jobId: string;
  reviewId: number | null;
  repositoryId: number | null;
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  totalDurationMs: number;
  status: 'completed' | 'failed' | 'partial' | 'in_progress';
  stages: Record<ReviewLifecycleStage, StageTimingRecord>;
  createdAt: string;
  completedAt?: string;
}

