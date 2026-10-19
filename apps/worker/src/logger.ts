import pino from 'pino';

export const SENSITIVE_LOG_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{36,}/g, // GitHub tokens
  /Bearer\s+[A-Za-z0-9_.-]{16,}/gi, // Authorization Bearer tokens
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key
  /-----BEGIN (?:RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE KEY-----[\s\S]*?-----END (?:RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE KEY-----/g,
  /(?:sk|rk)_(?:live|test)_[0-9a-zA-Z_-]{20,}/g, // Stripe API Key
  /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g, // Slack token
];

/**
 * Sanitizes arbitrary string log messages to redact secret tokens and keys.
 */
export function redactSensitiveText(msg: string): string {
  if (!msg || typeof msg !== 'string') return msg;
  let redacted = msg;
  for (const pattern of SENSITIVE_LOG_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'token',
      '*.token',
      '*.*.token',
      'api_key',
      'apiKey',
      '*.api_key',
      '*.apiKey',
      '*.*.apiKey',
      'secret',
      '*.secret',
      '*.*.secret',
      'password',
      '*.password',
      'authorization',
      'headers.authorization',
      'private_key',
      'privateKey',
      '*.private_key',
      '*.privateKey',
      'github_token',
      'githubToken',
      'webhook_secret',
      'webhookSecret',
      'oauth_token',
      'oauthToken',
      'client_secret',
      'clientSecret',
      'installation_token',
      'installationToken',
      // Raw sensitive repository content redaction
      'diff',
      '*.diff',
      'rawDiff',
      '*.rawDiff',
      'raw_diff',
      '*.raw_diff',
      'patch',
      '*.patch',
      'fileContent',
      '*.fileContent',
      'file_content',
      '*.file_content',
      'codeSnippet',
      '*.codeSnippet',
      'code_snippet',
      '*.code_snippet',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label: string) => ({ level: label }),
    log: (obj: Record<string, unknown>) => {
      // Automatically redact sensitive strings in message or error strings
      if (typeof obj.msg === 'string') {
        obj.msg = redactSensitiveText(obj.msg);
      }
      if (typeof obj.err === 'string') {
        obj.err = redactSensitiveText(obj.err);
      }
      return obj;
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export interface LogContext {
  correlation_id?: string;
  delivery_id?: string;
  job_id?: string | number;
  review_id?: number | null;
  installation_id?: number | string;
  repository_id?: number | null;
  repo?: string;
  pr_number?: number;
  commit_sha?: string;
  stage?: string;
  status?: string;
  error_category?: string;
  duration_ms?: number;
  retry_count?: number;
  [key: string]: unknown;
}

/**
 * Creates a contextual child logger bound with correlation_id, delivery_id, job_id, and review_id.
 */
export function createChildLogger(context: LogContext) {
  return logger.child(context);
}
