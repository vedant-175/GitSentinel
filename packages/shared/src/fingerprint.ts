/**
 * Issue Fingerprinting & Provenance Module - GitSentinel Phase 7
 * Computes deterministic SHA-256 fingerprints to track findings across re-reviews.
 */

import crypto from 'crypto';

export interface FingerprintableIssue {
  filePath: string;
  lineNumber?: number | null;
  category: string;
  cwe?: string | null;
  message: string;
  ruleId?: string | null;
}

/**
 * Normalizes message by removing ephemeral tokens, memory addresses, or line numbers.
 */
function normalizeMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/0x[a-f0-9]+/gi, '')
    .slice(0, 200);
}

/**
 * Computes a deterministic SHA-256 fingerprint for a code finding.
 * Format: sha256(filePath + ":" + lineNumber + ":" + category + ":" + taxonomy + ":" + normalizedMessage)
 */
export function calculateIssueFingerprint(issue: FingerprintableIssue): string {
  const normFile = (issue.filePath || '').replace(/\\/g, '/').toLowerCase();
  const line = issue.lineNumber ?? 0;
  const category = (issue.category || 'bug').toLowerCase();
  const taxonomy = (issue.cwe || issue.ruleId || '').toUpperCase();
  const msg = normalizeMessage(issue.message || '');

  const payload = `${normFile}:${line}:${category}:${taxonomy}:${msg}`;
  if (crypto && typeof crypto.createHash === 'function') {
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
  return '';
}
