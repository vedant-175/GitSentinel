/**
 * Audit Logging Module - GitSentinel Phase 7
 * Safe, auditable provenance tracking with strict secret redaction.
 */

export const AuditAction = {
  REPOSITORY_CONNECTED: 'repository.connected',
  REPOSITORY_DISCONNECTED: 'repository.disconnected',
  CONFIGURATION_UPDATED: 'configuration.updated',
  REVIEW_STARTED: 'review.started',
  REVIEW_RERUN: 'review.rerun',
  REVIEW_RETRIED: 'review.retried',
  REVIEW_FAILED: 'review.failed',
  ISSUE_DISMISSED: 'issue.dismissed',
  ISSUE_REOPENED: 'issue.reopened',
  ISSUE_FIXED: 'issue.fixed',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditLogEntry {
  id?: number;
  installationId?: number | null;
  actor: string;
  actorRole?: string | null;
  action: AuditActionType | string;
  resourceType: 'repository' | 'review' | 'issue' | 'configuration' | string;
  resourceId: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt?: Date | string;
}

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /api[_-]?key/i,
  /auth/i,
  /bearer/i,
  /cookie/i,
  /credential/i,
  /private[_-]?key/i,
  /jwt/i,
  /signature/i,
];

const SENSITIVE_VALUE_PATTERNS = [
  /^gh[pousr]_[A-Za-z0-9_]{20,}/, // GitHub tokens
  /^sk-[A-Za-z0-9_-]{20,}/,       // OpenAI keys
  /^AIza[0-9A-Za-z-_]{35}/,       // Google API keys
  /bearer\s+[A-Za-z0-9._-]+/i,    // Bearer tokens
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/, // RSA / SSH private keys
];

/**
 * Recursively scrubs all sensitive secrets, tokens, passwords, and private keys
 * from metadata before it can be persisted to the database.
 */
export function sanitizeAuditMetadata(obj: unknown, depth = 0): unknown {
  if (depth > 6 || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    for (const valPattern of SENSITIVE_VALUE_PATTERNS) {
      if (valPattern.test(obj)) {
        return '[REDACTED_SECRET]';
      }
    }
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeAuditMetadata(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Check if key name is sensitive
    const isKeySensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isKeySensitive) {
      result[key] = '[REDACTED_SECRET]';
      continue;
    }

    result[key] = sanitizeAuditMetadata(value, depth + 1);
  }

  return result;
}
