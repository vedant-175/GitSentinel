import crypto from 'crypto';
import ts from 'typescript';
import * as yaml from 'js-yaml';
import { ReviewIssue } from '@ai-reviewer/shared';

export const SUMMARY_COMMENT_MARKER = '<!-- ai-reviewer-summary-comment -->';
export const FINGERPRINT_MARKER_REGEX = /<!-- ai-reviewer-issue-fingerprint:\s*([a-f0-9]+)\s*-->/;

const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u200E\u200F\u00AD]/;

/**
 * Checks if code contains balanced delimiters: (), [], {}.
 */
function hasBalancedDelimiters(code: string): boolean {
  const stack: string[] = [];
  const matching: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let escaped = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (ch === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (ch === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      continue;
    }

    if (inSingleQuote || inDoubleQuote || inBacktick) {
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.length === 0 || stack[stack.length - 1] !== matching[ch]) {
        return false;
      }
      stack.pop();
    }
  }

  return stack.length === 0 && !inSingleQuote && !inDoubleQuote && !inBacktick;
}

/**
 * Validates suggested_fix (Item 14):
 * - Must be non-empty code (not conversational text or markdown fence or diff)
 * - Must replace exactly the commented line range (not empty, bounded, not identical no-op)
 * - Must contain no zero-width characters
 * - Must parse for the file's language
 */
export function validateSuggestedFix(
  fix: string | null | undefined,
  filePath: string,
  lineContent?: string
): boolean {
  if (!fix || typeof fix !== 'string') return false;
  const trimmed = fix.trim();
  if (trimmed.length === 0) return false;

  // 1. Must contain NO zero-width characters
  if (ZERO_WIDTH_REGEX.test(fix)) {
    return false;
  }

  // 2. Must be code (reject markdown code fences, diff markers, conversational commentary)
  if (/^```/m.test(trimmed) || /```$/.test(trimmed) || /^~~~+/m.test(trimmed)) {
    return false;
  }
  if (/^((\+\+\+|---|@@)\s|diff --git)/m.test(fix)) {
    return false;
  }
  const CONVERSATIONAL_PATTERNS = [
    /^(here is|you should|please|consider|i suggest|try changing|replace with|the fix is|note that)/i,
    /^(looks like|i think|this should be|make sure to|can you|we should)/i,
  ];
  if (CONVERSATIONAL_PATTERNS.some((pat) => pat.test(trimmed))) {
    return false;
  }
  if (/\/\/\s*\.\.\.|\.\.\.\s*(rest of code|existing code)/i.test(fix)) {
    return false;
  }

  // 3. Must replace exactly the commented line range
  if (lineContent !== undefined) {
    // If suggested fix is completely identical to existing line content, it's not a real fix
    if (trimmed === lineContent.trim()) {
      return false;
    }
  }
  const lines = fix.split('\n');
  if (lines.length > 50 || fix.length > 2000) {
    return false;
  }

  // 4. Must parse for the file's language
  const ext = (filePath.split('.').pop() || '').toLowerCase();

  // JavaScript / TypeScript files
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    try {
      const sf = ts.createSourceFile('fix_eval.tsx', fix, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      if ((sf as any).parseDiagnostics && (sf as any).parseDiagnostics.length === 0) {
        return true;
      }

      // Try expression wrapper
      const exprSf = ts.createSourceFile(
        'fix_eval.tsx',
        `const __expr = (${fix});`,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      if ((exprSf as any).parseDiagnostics && (exprSf as any).parseDiagnostics.length === 0) {
        return true;
      }

      // Try object literal member wrapper
      const objSf = ts.createSourceFile(
        'fix_eval.tsx',
        `const __obj = {\n${fix}\n};`,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      if ((objSf as any).parseDiagnostics && (objSf as any).parseDiagnostics.length === 0) {
        return true;
      }

      // Try class member wrapper
      const clsSf = ts.createSourceFile(
        'fix_eval.tsx',
        `class __Cls {\n${fix}\n}`,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      if ((clsSf as any).parseDiagnostics && (clsSf as any).parseDiagnostics.length === 0) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  // JSON files
  if (ext === 'json') {
    try {
      JSON.parse(fix);
      return true;
    } catch {
      try {
        JSON.parse(`{${fix}}`);
        return true;
      } catch {
        try {
          JSON.parse(`[${fix}]`);
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  // YAML files
  if (['yaml', 'yml'].includes(ext)) {
    try {
      const parsed = yaml.load(fix);
      return parsed !== undefined;
    } catch {
      return false;
    }
  }

  // General code parser check: verify balanced delimiters and valid quotes
  return hasBalancedDelimiters(fix);
}

/**
 * Strips @mentions, neutralizes markdown links/images and HTML tags, and enforces length caps.
 * Preserves code snippets (fenced blocks and inline code spans) so that generics (<T>),
 * decorators (@decorator), URLs, and index calls are untouched wherever code is shown.
 */
export function sanitizeText(text: string, maxLength: number = 1500): string {
  if (!text) return '';

  const codeBlocks: string[] = [];
  const placeholderPrefix = `__CODE_SPAN_PROTECTED_${crypto.randomBytes(6).toString('hex')}_`;

  // 1. Extract and protect fenced code blocks (```...``` or ~~~...~~~)
  let protectedText = text.replace(
    /(```[^\n]*\n[\s\S]*?\n```|~~~[^\n]*\n[\s\S]*?\n~~~|```[\s\S]*?```|~~~[\s\S]*?~~~)/g,
    (match) => {
      const idx = codeBlocks.length;
      codeBlocks.push(match);
      return `${placeholderPrefix}${idx}__`;
    }
  );

  // 2. Extract and protect inline code spans (`...`)
  protectedText = protectedText.replace(/(`+)([\s\S]*?)\1/g, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match);
    return `${placeholderPrefix}${idx}__`;
  });

  // 3. Strip @mentions in plain text outside code
  protectedText = protectedText.replace(/@([a-zA-Z0-9_.-]+)/g, '@\u200B$1');

  // 4. Neutralize HTML tags in plain text outside code
  protectedText = protectedText.replace(/<[^>]*>/g, '');

  // 5. Neutralize markdown images in plain text outside code: ![alt](url) -> [Image: alt]
  protectedText = protectedText.replace(/!\[([^[\u005D]*)\]\(([^()]*)\)/g, '[Image: $1]');

  // 6. Neutralize markdown links: [text](url) -> text (url) with defanged protocol
  protectedText = protectedText.replace(/\[([^[\u005D]*)\]\(([^()]*)\)/g, (_match, label, url) => {
    const defanged = String(url).replace(/https?:\/\//i, 'hxxps://');
    return `${label} (${defanged})`;
  });

  // 7. Defang any remaining standalone URLs outside code
  protectedText = protectedText.replace(/https?:\/\//gi, 'hxxps://');

  // 8. Restore protected code blocks untouched
  let sanitized = protectedText.replace(
    new RegExp(`${placeholderPrefix}(\\d+)__`, 'g'),
    (_match, idxStr) => {
      const idx = parseInt(idxStr, 10);
      return codeBlocks[idx] ?? '';
    }
  );

  // 9. Enforce maximum length cap
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '... [truncated]';
  }

  return sanitized;
}

/**
 * Normalizes source code line content for stable fingerprinting:
 * strips leading/trailing whitespace, collapses internal whitespace to a single space.
 */
export function normalizeLineContent(content: string): string {
  if (!content) return '';
  return content.trim().replace(/\s+/g, ' ');
}

/**
 * Sanitizes all user-facing fields of a ReviewIssue.
 * Item 14: Does NOT run text sanitizer on suggested_fix.
 * Validates suggested_fix instead (code, line range, no zero-width, language parser).
 * If invalid, drops suggested_fix to null while keeping message text.
 */
export function sanitizeIssue(issue: ReviewIssue, lineContent?: string): ReviewIssue {
  const sanitizedMessage = sanitizeText(issue.message, 1500);

  let validatedFix: string | null = null;
  if (issue.suggested_fix) {
    const isValid = validateSuggestedFix(
      issue.suggested_fix,
      issue.file_path,
      lineContent !== undefined ? lineContent : issue.line_content
    );
    if (isValid) {
      validatedFix = issue.suggested_fix; // Kept intact as code!
    } else {
      validatedFix = null; // Dropped invalid suggestion block
    }
  }

  const content = lineContent !== undefined ? lineContent : issue.line_content;

  const sanitized: ReviewIssue = {
    ...issue,
    message: sanitizedMessage,
    suggested_fix: validatedFix,
    line_content: content,
  };

  if (!sanitized.fingerprint) {
    sanitized.fingerprint = computeIssueFingerprint(sanitized, content);
  }

  return sanitized;
}

/**
 * Generates a deterministic summary line in code from counts and severities (Item 17).
 * Never uses assessments[0] or LLM wording.
 */
export function generateDeterministicSummaryLine(
  issues: ReviewIssue[],
  isPartial: boolean = false
): string {
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const suggestionCount = issues.filter((i) => i.severity === 'suggestion').length;
  const totalCount = issues.length;

  const prefix = isPartial ? 'Partial review completed' : 'Review completed';
  const suffix = isPartial ? ' (some files or chunks were skipped)' : '';

  if (totalCount === 0) {
    if (isPartial) {
      return `${prefix}: 0 issues identified in analyzed code${suffix}.`;
    }
    return `${prefix}: Clean diff with 0 issues identified across all files.`;
  }

  const parts: string[] = [];
  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical ${criticalCount === 1 ? 'issue' : 'issues'}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`);
  }
  if (suggestionCount > 0) {
    parts.push(`${suggestionCount} ${suggestionCount === 1 ? 'suggestion' : 'suggestions'}`);
  }

  const breakdown = parts.join(', ');
  return `${prefix}: Found ${totalCount} issue${totalCount === 1 ? '' : 's'} (${breakdown})${suffix}.`;
}

/**
 * Computes a stable SHA-256 fingerprint for an issue.
 * Item 12: hash of the normalized line content, the category and the file path,
 * NOT the line number and NOT LLM wording.
 */
export function computeIssueFingerprint(
  issue: {
    file_path: string;
    category: string;
    line_number?: number;
    message?: string;
    line_content?: string;
  },
  lineContent?: string
): string {
  const normPath = (issue.file_path || '').trim();
  const normCategory = (issue.category || '').trim().toLowerCase();
  const rawLine = lineContent !== undefined ? lineContent : (issue.line_content ?? '');
  const normalizedLine = normalizeLineContent(rawLine);
  const raw = `${normPath}:${normCategory}:${normalizedLine}`;
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

/**
 * Returns the hidden HTML marker to embed inside GitHub inline review comments.
 */
export function getIssueMarker(fingerprint: string): string {
  return `<!-- ai-reviewer-issue-fingerprint: ${fingerprint} -->`;
}

/**
 * Extracts issue fingerprint from comment body if present.
 */
export function extractFingerprintFromComment(body: string): string | null {
  if (!body) return null;
  const match = body.match(FINGERPRINT_MARKER_REGEX);
  return match ? match[1] : null;
}

