import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReviewIssueSchema,
  ReviewResultSchema,
} from '@ai-reviewer/shared';
import { validateSuggestedFix, sanitizeIssue } from './sanitize.js';

test('LLM Output Security: rejects path traversal in file_path', () => {
  const traversalPayload = {
    file_path: '../../etc/passwd',
    line_number: 10,
    severity: 'critical',
    category: 'security',
    message: 'Malicious path traversal',
  };

  const parsed = ReviewIssueSchema.safeParse(traversalPayload);
  assert.equal(parsed.success, false, 'Should reject path traversal containing ..');
});

test('LLM Output Security: rejects null byte injection in file_path', () => {
  const nullBytePayload = {
    file_path: 'src/index.ts\0.exe',
    line_number: 10,
    severity: 'critical',
    category: 'security',
    message: 'Null byte injection',
  };

  const parsed = ReviewIssueSchema.safeParse(nullBytePayload);
  assert.equal(parsed.success, false, 'Should reject null bytes in file_path');
});

test('LLM Output Security: rejects absolute paths in file_path', () => {
  const absolutePayloads = [
    { file_path: '/etc/shadow', line_number: 1 },
    { file_path: 'C:\\Windows\\System32\\cmd.exe', line_number: 1 },
    { file_path: '\\\\remote-server\\share', line_number: 1 },
  ];

  for (const item of absolutePayloads) {
    const parsed = ReviewIssueSchema.safeParse({
      ...item,
      severity: 'warning',
      category: 'bug',
      message: 'Absolute path attempt',
    });
    assert.equal(parsed.success, false, `Should reject absolute path: ${item.file_path}`);
  }
});

test('LLM Output Security: rejects impossible severity', () => {
  const invalidSeverity = {
    file_path: 'src/app.ts',
    line_number: 15,
    severity: 'apocalyptic', // impossible severity
    category: 'bug',
    message: 'Invalid severity value',
  };

  const parsed = ReviewIssueSchema.safeParse(invalidSeverity);
  assert.equal(parsed.success, false, 'Should reject invalid severity enum');
});

test('LLM Output Security: rejects unsupported category', () => {
  const invalidCategory = {
    file_path: 'src/app.ts',
    line_number: 15,
    severity: 'warning',
    category: 'philosophical', // unsupported category
    message: 'Invalid category value',
  };

  const parsed = ReviewIssueSchema.safeParse(invalidCategory);
  assert.equal(parsed.success, false, 'Should reject invalid category enum');
});

test('LLM Output Security: rejects non-positive line number', () => {
  const negativeLine = {
    file_path: 'src/app.ts',
    line_number: -42,
    severity: 'warning',
    category: 'bug',
    message: 'Negative line number',
  };

  const parsed = ReviewIssueSchema.safeParse(negativeLine);
  assert.equal(parsed.success, false, 'Should reject negative line number');
});

test('LLM Output Security: rejects excessive issue count in single chunk (> 100)', () => {
  const issues = Array.from({ length: 101 }, (_, i) => ({
    file_path: 'src/app.ts',
    line_number: i + 1,
    severity: 'suggestion' as const,
    category: 'style' as const,
    message: `Issue ${i + 1}`,
  }));

  const result = ReviewResultSchema.safeParse({
    issues,
    overall_assessment: 'Exceeded issue count test',
  });

  assert.equal(result.success, false, 'Should reject excessive number of issues (> 100)');
});

test('LLM Output Security: sanitizeIssue and validateSuggestedFix drop conversational commentary and zero-width chars', () => {
  // Conversational text instead of code
  const conversationalFix = 'Here is the fix: you should change this line to const x = 1;';
  assert.equal(
    validateSuggestedFix(conversationalFix, 'src/index.ts'),
    false,
    'Must reject conversational text in suggested_fix'
  );

  // Zero-width characters (invisible character injection)
  const zeroWidthFix = 'const\u200B x = 1;';
  assert.equal(
    validateSuggestedFix(zeroWidthFix, 'src/index.ts'),
    false,
    'Must reject zero-width characters in suggested_fix'
  );

  // Markdown code fence in fix
  const fencedFix = '```ts\nconst x = 1;\n```';
  assert.equal(
    validateSuggestedFix(fencedFix, 'src/index.ts'),
    false,
    'Must reject markdown code fences in suggested_fix'
  );

  // Valid TypeScript code fix
  const validFix = 'const x: number = 1;';
  assert.equal(
    validateSuggestedFix(validFix, 'src/index.ts', 'const x = 1;'),
    true,
    'Must accept valid drop-in code fix'
  );

  // Verify sanitizeIssue drops invalid fix to null while keeping message
  const issueWithBadFix = {
    file_path: 'src/index.ts',
    line_number: 10,
    severity: 'warning' as const,
    category: 'bug' as const,
    message: 'Bug found @everyone check https://evil.com',
    suggested_fix: conversationalFix,
  };

  const sanitized = sanitizeIssue(issueWithBadFix);
  assert.equal(sanitized.suggested_fix, null, 'Invalid suggested fix must be dropped to null');
  assert.ok(!sanitized.message.includes('@everyone'), '@mention must be defanged');
  assert.ok(!sanitized.message.includes('https://'), 'URL protocol must be defanged');
});
