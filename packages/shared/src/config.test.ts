import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeInRepoConfig } from './config.js';
import { isBot } from './utils.js';
import { RepoConfig } from './types.js';

test('Item 10: isBot strictly matches user.type === "Bot" or trailing "[bot]", never substring "bot"', () => {
  // Positive cases
  assert.equal(isBot({ type: 'Bot', login: 'custom-bot' }), true);
  assert.equal(isBot({ type: 'User', login: 'dependabot[bot]' }), true);
  assert.equal(isBot({ type: 'User', login: 'github-actions[bot]' }), true);
  assert.equal(isBot({ type: 'User', login: 'ai-reviewer[BOT]' }), true);

  // Negative cases - substring "bot" must NEVER match
  assert.equal(isBot({ type: 'User', login: 'bothwell' }), false);
  assert.equal(isBot({ type: 'User', login: 'robotics_club' }), false);
  assert.equal(isBot({ type: 'User', login: 'abbot' }), false);
  assert.equal(isBot({ type: 'User', login: 'bot' }), false);
  assert.equal(isBot({ type: 'User', login: 'bottom_line' }), false);
  assert.equal(isBot(null), false);
  assert.equal(isBot(undefined), false);
});

test('Item 7: mergeInRepoConfig merges only explicitly set keys and does not apply schema defaults over stored settings', () => {
  const storedConfig: RepoConfig = {
    ignored_globs: ['*.lock', 'dist/**'],
    severity_threshold: 'warning',
    disabled_categories: [],
    max_comments_per_pr: 50, // Custom dashboard setting
    auto_approve: false,
    block_on_critical: true, // Custom dashboard setting
    skip_drafts: true,
    skip_bot_authors: true,
    max_files_per_pr: 100, // Custom dashboard setting
    max_lines_per_pr: 2500, // Custom dashboard setting
    confidence_threshold: 0.85, // Custom dashboard setting
  };

  // In-repo file only sets ignored_globs
  const inRepoYaml = {
    ignored_globs: ['*.generated.ts', 'coverage/**'],
  };

  const merged = mergeInRepoConfig(storedConfig, inRepoYaml);

  // Check that stored custom settings were NOT overwritten by schema defaults (e.g. 25, 50, 1000, 0.7)
  assert.equal(merged.max_comments_per_pr, 50);
  assert.equal(merged.max_files_per_pr, 100);
  assert.equal(merged.max_lines_per_pr, 2500);
  assert.equal(merged.confidence_threshold, 0.85);
  assert.equal(merged.severity_threshold, 'warning');
  assert.equal(merged.block_on_critical, true);

  // Check that valid new globs were unioned
  assert.ok(merged.ignored_globs?.includes('*.generated.ts'));
  assert.ok(merged.ignored_globs?.includes('coverage/**'));
  assert.ok(merged.ignored_globs?.includes('dist/**'));
});

test('Item 7: malicious PR config cannot auto_approve, disable categories, lower thresholds, or ignore "**"', () => {
  const storedConfig: RepoConfig = {
    ignored_globs: ['*.lock'],
    severity_threshold: 'warning',
    disabled_categories: [],
    max_comments_per_pr: 30,
    auto_approve: false,
    block_on_critical: true,
    skip_drafts: true,
    skip_bot_authors: true,
    max_files_per_pr: 50,
    max_lines_per_pr: 1000,
    confidence_threshold: 0.75,
  };

  // Malicious in-repo config payload attempting to subvert review:
  const maliciousYaml = {
    auto_approve: true, // Attack: force auto-approve
    disabled_categories: ['security', 'bug'], // Attack: disable security checks
    confidence_threshold: 0.1, // Attack: lower confidence threshold
    severity_threshold: 'suggestion', // Attack: lower severity threshold from warning
    ignored_globs: ['**', '*', '**/*', './**', 'legit-generated/**'], // Attack: ignore all files
  };

  const merged = mergeInRepoConfig(storedConfig, maliciousYaml);

  // 1. auto_approve must REMAIN false
  assert.equal(merged.auto_approve, false);

  // 2. disabled_categories must REMAIN empty (cannot disable checks)
  assert.deepEqual(merged.disabled_categories, []);

  // 3. confidence_threshold must NOT be lowered (remains 0.75)
  assert.equal(merged.confidence_threshold, 0.75);

  // 4. severity_threshold must NOT be lowered (remains warning)
  assert.equal(merged.severity_threshold, 'warning');

  // 5. ignored_globs must NOT contain wildcard '**', '*', or '**/*'
  assert.equal(merged.ignored_globs?.includes('**'), false);
  assert.equal(merged.ignored_globs?.includes('*'), false);
  assert.equal(merged.ignored_globs?.includes('**/*'), false);
  assert.equal(merged.ignored_globs?.includes('./**'), false);
  assert.ok(merged.ignored_globs?.includes('legit-generated/**'));
});
