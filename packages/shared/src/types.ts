export type Severity = 'critical' | 'warning' | 'suggestion';

export type Category =
  | 'bug'
  | 'security'
  | 'style'
  | 'performance'
  | 'maintainability';

export interface ReviewIssue {
  file_path: string;
  line_number: number;
  severity: Severity;
  category: Category;
  message: string;
  suggested_fix?: string | null;
  source?: 'llm' | 'static_analysis';
}

export interface ReviewResult {
  issues: ReviewIssue[];
  overall_assessment: string;
}

export interface RepoConfig {
  ignored_globs?: string[];
  severity_threshold?: Severity;
  disabled_categories?: Category[];
  max_comments_per_pr?: number;
  auto_approve?: boolean;
}

export interface ReviewJobData {
  installationId: number;
  repoId: number;
  prNumber: number;
  commitSha: string;
  repoFullName?: string;
  headBranch?: string;
  baseBranch?: string;
  title?: string;
  author?: string;
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
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: DiffHunk[];
  rawDiff: string;
}
