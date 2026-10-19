export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Computes exponential backoff with full jitter to avoid the thundering herd problem.
 * Formula: random_between(0, min(maxDelayMs, initialDelayMs * (backoffFactor ^ attempt)))
 */
export function computeBackoffWithJitter(
  attempt: number,
  initialDelayMs = 300,
  maxDelayMs = 5000,
  backoffFactor = 2
): number {
  const exponentialDelay = Math.min(maxDelayMs, initialDelayMs * Math.pow(backoffFactor, attempt));
  // Full jitter: uniformly distributed in [0, exponentialDelay] with minimum floor of 20ms
  return Math.max(20, Math.floor(Math.random() * exponentialDelay));
}

/**
 * Classifies transient GitHub API errors (rate limits, 5xx server errors, network drops).
 * Rejects authentication (401), authorization (403 without rate limit), and client (400, 404, 422) errors.
 */
export function isTransientGitHubError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, any>;

  const status = err.status || err.statusCode || err.response?.status;
  const message = String(err.message || '').toLowerCase();

  // Network drops / connection resets are transient
  const code = err.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    return true;
  }

  // HTTP status checks
  if (status) {
    if (status === 429) return true; // Rate limit
    if (status >= 500 && status <= 504) return true; // Server errors (500, 502, 503, 504)

    // Rate limit 403 with x-ratelimit-remaining: 0
    if (status === 403 && (message.includes('rate limit') || err.response?.headers?.['x-ratelimit-remaining'] === '0')) {
      return true;
    }

    // Explicit non-retryable statuses
    if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
      return false;
    }
  }

  if (message.includes('timeout') || message.includes('network') || message.includes('econnreset')) {
    return true;
  }

  return false;
}

/**
 * Classifies transient LLM API errors (rate limits, capacity overloads, timeouts).
 * Rejects authentication (401), invalid request (400), context length exceeded.
 */
export function isTransientLLMError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, any>;

  const status = err.status || err.statusCode || err.response?.status;
  const message = String(err.message || '').toLowerCase();

  // Non-retryable LLM errors
  if (
    message.includes('invalid api key') ||
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('maximum context length') ||
    message.includes('context_length_exceeded')
  ) {
    return false;
  }

  if (status) {
    if (status === 429) return true; // Rate limit / quota
    if (status >= 500 && status <= 504) return true; // Server overload
    if (status === 400 || status === 401 || status === 403) return false;
  }

  if (
    message.includes('rate limit') ||
    message.includes('overloaded') ||
    message.includes('timeout') ||
    message.includes('service unavailable') ||
    message.includes('econnreset')
  ) {
    return true;
  }

  return false;
}

/**
 * Classifies transient PostgreSQL / Prisma errors (deadlock, serialization failure, pool timeout).
 * Rejects constraint violations (unique, foreign key) and schema errors.
 */
export function isTransientPostgresError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, any>;

  const code = err.code || err.meta?.code;
  const message = String(err.message || '').toLowerCase();

  // Deadlock detected (40P01) or serialization failure (40001)
  if (code === '40P01' || code === '40001') return true;

  // Prisma connection pool timeout
  if (code === 'P2024') return true;

  // Transient socket disconnect
  if (message.includes('connection terminated') || message.includes('connection closed') || message.includes('deadlock')) {
    return true;
  }

  // Non-retryable Prisma errors: unique constraint (P2002), FK constraint (P2003), record not found (P2025)
  if (code === 'P2002' || code === 'P2003' || code === 'P2025') {
    return false;
  }

  return false;
}

/**
 * Classifies transient Redis errors (connection reset, cluster failover).
 */
export function isTransientRedisError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, any>;

  const code = err.code;
  const message = String(err.message || '').toLowerCase();

  if (code === 'NR_CLOSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT') return true;
  if (message.includes('connection is closed') || message.includes('clusterdown') || message.includes('failover')) {
    return true;
  }

  return false;
}

/**
 * Executes a function with controlled exponential backoff + jitter retries.
 * Never retries deterministic, non-retryable errors.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const backoffFactor = options.backoffFactor ?? 2;
  const isRetryable = options.isRetryable ?? (() => true);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;

      // If we've reached max attempts or the error is not retryable, fail immediately
      if (attempt >= maxRetries || !isRetryable(err)) {
        throw err;
      }

      const delayMs = computeBackoffWithJitter(attempt, initialDelayMs, maxDelayMs, backoffFactor);
      if (options.onRetry) {
        options.onRetry(err, attempt + 1, delayMs);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
