import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitiveText } from './logger.js';

test('Log Redaction: redactSensitiveText masks GitHub tokens, AWS keys, Stripe keys, and Bearer tokens', () => {
  const secretString =
    'Found token ghp_1234567890abcdef1234567890abcdef1234 and AWS key AKIAIOSFODNN7EXAMPLE and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M and stripe sk_test_mock-token-for-gitsentinel-logging-99';

  const sanitized = redactSensitiveText(secretString);

  assert.ok(!sanitized.includes('ghp_1234567890abcdef1234567890abcdef1234'), 'GitHub token must be redacted');
  assert.ok(!sanitized.includes('AKIAIOSFODNN7EXAMPLE'), 'AWS Access Key must be redacted');
  assert.ok(!sanitized.includes('sk_test_mock-token-for-gitsentinel-logging-99'), 'Stripe key must be redacted');
  assert.ok(!sanitized.includes('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Bearer token must be redacted');
  assert.ok(sanitized.includes('[REDACTED]'), 'Must replace with [REDACTED]');
});

test('Log Redaction: passes clean strings through untouched', () => {
  const clean = 'Normal review log message for PR #42';
  assert.equal(redactSensitiveText(clean), clean);
});
