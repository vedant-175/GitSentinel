import {
  ReviewLifecycleStage,
  StageExecutionStatus,
  ObservabilityErrorCategory,
  StageTimingRecord,
  ReviewLifecycleTrace,
} from './types.js';

export const REVIEW_LIFECYCLE_STAGES: readonly ReviewLifecycleStage[] = [
  'github_webhook',
  'webhook_validation',
  'queue_enqueue',
  'worker_start',
  'repository_fetch',
  'diff_generation',
  'static_analysis',
  'llm_analysis',
  'finding_validation',
  'persistence',
  'review_completion',
] as const;

export const SENSITIVE_KEY_REGEX = /(token|secret|password|key|auth|credential|cert|signature)/i;
export const RAW_CODE_KEYS = new Set([
  'diff',
  'rawdiff',
  'raw_diff',
  'patch',
  'filecontent',
  'file_content',
  'content',
  'codesnippet',
  'code_snippet',
]);

/**
 * Classifies runtime errors into well-defined error categories.
 */
export function classifyErrorCategory(err: unknown): ObservabilityErrorCategory {
  if (!err) return 'none';

  const message = typeof err === 'string' ? err : (err as any)?.message || String(err);
  const lowerMsg = message.toLowerCase();
  const status = (err as any)?.status || (err as any)?.statusCode;
  const name = (err as any)?.name || '';

  // Stale commit / superseded errors
  if (
    name === 'HeadShaChangedError' ||
    lowerMsg.includes('head sha changed') ||
    lowerMsg.includes('superseded by newer commit')
  ) {
    return 'stale_commit';
  }

  // Authentication & authorization errors
  if (
    status === 401 ||
    status === 403 ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('invalid signature') ||
    lowerMsg.includes('missing signature') ||
    lowerMsg.includes('bad credentials') ||
    lowerMsg.includes('forbidden')
  ) {
    return 'auth_error';
  }

  // Rate limiting errors
  if (
    status === 429 ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('secondary rate limit') ||
    lowerMsg.includes('too many requests')
  ) {
    return 'rate_limit';
  }

  // Timeout errors
  if (
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('timed out') ||
    lowerMsg.includes('etimedout') ||
    lowerMsg.includes('esockettimedout') ||
    lowerMsg.includes('deadline exceeded')
  ) {
    return 'timeout';
  }

  // Schema / validation errors
  if (
    name === 'ZodError' ||
    lowerMsg.includes('schema validation') ||
    lowerMsg.includes('invalid payload') ||
    lowerMsg.includes('validation failed')
  ) {
    return 'validation_error';
  }

  // LLM errors
  if (
    lowerMsg.includes('llm') ||
    lowerMsg.includes('openai') ||
    lowerMsg.includes('anthropic') ||
    lowerMsg.includes('gemini') ||
    lowerMsg.includes('token budget exceeded') ||
    lowerMsg.includes('prompt tokens') ||
    lowerMsg.includes('model returned invalid')
  ) {
    return 'llm_error';
  }

  // Database errors
  if (
    name.startsWith('Prisma') ||
    lowerMsg.includes('prisma') ||
    lowerMsg.includes('postgresql') ||
    lowerMsg.includes('database connection') ||
    lowerMsg.includes('deadlock')
  ) {
    return 'db_error';
  }

  // Syntax / parsing errors
  if (
    err instanceof SyntaxError ||
    lowerMsg.includes('syntaxerror') ||
    lowerMsg.includes('syntax error') ||
    lowerMsg.includes('unexpected token') ||
    lowerMsg.includes('json.parse') ||
    lowerMsg.includes('malformed json')
  ) {
    return 'syntax_error';
  }

  return 'unknown';
}

export interface CreateStageRecordParams {
  stage: ReviewLifecycleStage;
  durationMs: number;
  status: StageExecutionStatus;
  errorCategory?: ObservabilityErrorCategory;
  errorMessage?: string;
  retryCount?: number;
  jobId?: string | number;
  reviewId?: number | null;
  repositoryId?: number | null;
  commitSha?: string;
  correlationId?: string;
  startedAt?: number | string | Date;
  completedAt?: number | string | Date;
  metadata?: Record<string, unknown>;
}

/**
 * Normalizes and produces a StageTimingRecord.
 * Automatically strips sensitive tokens and raw code content from metadata.
 */
export function createStageTimingRecord(params: CreateStageRecordParams): StageTimingRecord {
  const startedAtIso = params.startedAt
    ? new Date(params.startedAt).toISOString()
    : new Date().toISOString();
  const completedAtIso = params.completedAt
    ? new Date(params.completedAt).toISOString()
    : new Date().toISOString();

  return {
    stage: params.stage,
    durationMs: Math.max(0, Math.round(params.durationMs)),
    status: params.status,
    errorCategory: params.errorCategory || (params.status === 'failed' ? 'unknown' : 'none'),
    errorMessage: params.errorMessage ? redactSensitiveString(params.errorMessage) : undefined,
    retryCount: params.retryCount ?? 0,
    jobId: String(params.jobId || 'unknown'),
    reviewId: params.reviewId ?? null,
    repositoryId: params.repositoryId ?? null,
    commitSha: params.commitSha || 'unknown',
    correlationId: params.correlationId || 'unknown',
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    metadata: params.metadata ? sanitizeObservabilityMetadata(params.metadata) : undefined,
  };
}

/**
 * Sanitizes arbitrary log/trace metadata objects to prevent leaking secrets or raw code diffs.
 */
export function sanitizeObservabilityMetadata(
  meta: Record<string, unknown>
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();

    // Never log secret tokens or auth credentials
    if (SENSITIVE_KEY_REGEX.test(lowerKey)) {
      clean[key] = '[REDACTED]';
      continue;
    }

    // Never log raw repository file contents or code diff snippets
    if (RAW_CODE_KEYS.has(lowerKey)) {
      clean[key] = '[REDACTED_CODE_CONTENT]';
      continue;
    }

    if (val && typeof val === 'object' && !Array.isArray(val)) {
      clean[key] = sanitizeObservabilityMetadata(val as Record<string, unknown>);
    } else if (typeof val === 'string') {
      clean[key] = redactSensitiveString(val);
    } else {
      clean[key] = val;
    }
  }

  return clean;
}

const TOKEN_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /Bearer\s+[A-Za-z0-9_.-]{16,}/gi,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,}/g,
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /AIza[0-9A-Za-z-_]{30,}/g,
];

/**
 * Redacts secrets from string messages while preserving readability.
 */
export function redactSensitiveString(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let out = text;
  for (const p of TOKEN_PATTERNS) {
    out = out.replace(p, '[REDACTED]');
  }
  return out;
}
