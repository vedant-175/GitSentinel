import test from 'node:test';
import assert from 'node:assert/strict';
import { determineVerdict } from './verdict.js';
import { RepoConfig, ReviewIssue } from './types.js';

test('determineVerdict defaults to COMMENT when no special rules triggered', () => {
  const config: RepoConfig = {};
  const issues: ReviewIssue[] = [];
  const verdict = determineVerdict(config, issues, true);
  assert.equal(verdict, 'COMMENT');
});

test('determineVerdict returns APPROVE only when auto_approve=true AND allChunksSucceeded AND zero issues', () => {
  const config: RepoConfig = { auto_approve: true };
  const issues: ReviewIssue[] = [];

  // All conditions met -> APPROVE
  assert.equal(determineVerdict(config, issues, true), 'APPROVE');

  // Chunks failed -> fails closed, returns COMMENT
  assert.equal(determineVerdict(config, issues, false), 'COMMENT');

  // Issues exist -> cannot approve, returns COMMENT
  const issuesWithWarning: ReviewIssue[] = [
    {
      file_path: 'foo.ts',
      line_number: 10,
      severity: 'warning',
      category: 'bug',
      message: 'potential issue',
    },
  ];
  assert.equal(determineVerdict(config, issuesWithWarning, true), 'COMMENT');

  // auto_approve=false -> returns COMMENT
  assert.equal(determineVerdict({ auto_approve: false }, issues, true), 'COMMENT');
});

test('determineVerdict returns REQUEST_CHANGES only when block_on_critical=true AND critical issues exist', () => {
  const criticalIssue: ReviewIssue = {
    file_path: 'auth.ts',
    line_number: 42,
    severity: 'critical',
    category: 'security',
    message: 'SQL Injection detected',
  };

  const warningIssue: ReviewIssue = {
    file_path: 'style.ts',
    line_number: 1,
    severity: 'warning',
    category: 'style',
    message: 'Formatting problem',
  };

  // block_on_critical=true with critical issue -> REQUEST_CHANGES
  assert.equal(
    determineVerdict({ block_on_critical: true }, [criticalIssue], true),
    'REQUEST_CHANGES'
  );

  // block_on_critical=false with critical issue -> COMMENT (does not block)
  assert.equal(
    determineVerdict({ block_on_critical: false }, [criticalIssue], true),
    'COMMENT'
  );

  // block_on_critical=true with ONLY warning issue -> COMMENT
  assert.equal(
    determineVerdict({ block_on_critical: true }, [warningIssue], true),
    'COMMENT'
  );
});

test('determineVerdict never returns APPROVE for partially reviewed PR (fail-closed)', () => {
  const config: RepoConfig = { auto_approve: true, block_on_critical: true };
  const issues: ReviewIssue[] = [];

  // allChunksSucceeded is false
  const verdict1 = determineVerdict(config, issues, false);
  assert.notEqual(verdict1, 'APPROVE');
  assert.equal(verdict1, 'COMMENT');

  // isPartial is true even when allChunksSucceeded is true and 0 issues
  const verdict2 = determineVerdict(config, issues, true, true);
  assert.notEqual(verdict2, 'APPROVE');
  assert.equal(verdict2, 'COMMENT');

  // isPartial is true with critical issue -> REQUEST_CHANGES
  const criticalIssue: ReviewIssue = {
    file_path: 'src/main.ts',
    line_number: 1,
    severity: 'critical',
    category: 'security',
    message: 'SQL Injection',
  };
  const verdict3 = determineVerdict(config, [criticalIssue], true, true);
  assert.equal(verdict3, 'REQUEST_CHANGES');
});
