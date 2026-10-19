import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GitHubPullRequestWebhookSchema,
  GitHubInstallationWebhookSchema,
  GitHubInstallationRepositoriesWebhookSchema,
  RepoConfigSchema,
  ReviewJobDataSchema,
} from './schemas.js';

test('GitHubPullRequestWebhookSchema validates valid PR webhook payload', () => {
  const payload = {
    action: 'opened',
    number: 142,
    pull_request: {
      number: 142,
      title: 'feat: add authentication',
      draft: false,
      state: 'open',
      merged: false,
      merged_at: null,
      closed_at: null,
      user: {
        login: 'developer-alice',
        type: 'User',
      },
      head: {
        sha: 'abc1234567890123456789012345678901234567',
        ref: 'feature-auth',
      },
      base: {
        ref: 'main',
      },
    },
    repository: {
      id: 991234,
      name: 'core-api',
      full_name: 'acme-corp/core-api',
      default_branch: 'main',
      owner: {
        login: 'acme-corp',
        type: 'Organization',
      },
    },
    installation: {
      id: 554433,
    },
    sender: {
      login: 'developer-alice',
      type: 'User',
    },
  };

  const parsed = GitHubPullRequestWebhookSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.action, 'opened');
    assert.equal(parsed.data.pull_request.number, 142);
    assert.equal(parsed.data.pull_request.draft, false);
    assert.equal(parsed.data.pull_request.user.login, 'developer-alice');
  }
});

test('GitHubPullRequestWebhookSchema fails closed on invalid payload missing required fields', () => {
  const invalidPayload = {
    action: 'opened',
    // Missing number, pull_request, repository
  };

  const parsed = GitHubPullRequestWebhookSchema.safeParse(invalidPayload);
  assert.equal(parsed.success, false);
});

test('GitHubInstallationWebhookSchema validates created and deleted actions', () => {
  const createdPayload = {
    action: 'created',
    installation: {
      id: 12345,
      account: {
        login: 'test-org',
        type: 'Organization',
      },
    },
    repositories: [
      { id: 101, name: 'repo-one', full_name: 'test-org/repo-one' },
    ],
  };

  const parsed = GitHubInstallationWebhookSchema.safeParse(createdPayload);
  assert.equal(parsed.success, true);

  const invalidAction = {
    action: 'unsupported_action',
    installation: { id: 123, account: { login: 'u', type: 'User' } },
  };
  assert.equal(GitHubInstallationWebhookSchema.safeParse(invalidAction).success, false);
});

test('GitHubInstallationRepositoriesWebhookSchema validates added and removed repos', () => {
  const payload = {
    action: 'added',
    installation: {
      id: 12345,
      account: {
        login: 'test-org',
        type: 'Organization',
      },
    },
    repositories_added: [
      { id: 201, name: 'repo-two', full_name: 'test-org/repo-two' },
    ],
    repositories_removed: [],
  };

  const parsed = GitHubInstallationRepositoriesWebhookSchema.safeParse(payload);
  assert.equal(parsed.success, true);
});

test('RepoConfigSchema defaults and validation', () => {
  const parsed = RepoConfigSchema.parse({});
  assert.equal(parsed.auto_approve, false);
  assert.equal(parsed.block_on_critical, false);
  assert.equal(parsed.skip_drafts, true);
  assert.equal(parsed.skip_bot_authors, true);

  const custom = RepoConfigSchema.parse({
    auto_approve: true,
    block_on_critical: true,
    skip_drafts: false,
    skip_bot_authors: false,
  });
  assert.equal(custom.auto_approve, true);
  assert.equal(custom.block_on_critical, true);
  assert.equal(custom.skip_drafts, false);
  assert.equal(custom.skip_bot_authors, false);
});

test('ReviewJobDataSchema includes latency measurement fields and repo IDs', () => {
  const job = {
    installationId: 100,
    githubRepoId: 200,
    prNumber: 5,
    commitSha: 'fedcba9876543210fedcba9876543210fedcba98',
    repoFullName: 'org/repo',
    receivedAt: 1700000000000,
    draft: true,
    authorType: 'Bot',
  };

  const parsed = ReviewJobDataSchema.safeParse(job);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.receivedAt, 1700000000000);
    assert.equal(parsed.data.draft, true);
    assert.equal(parsed.data.authorType, 'Bot');
  }
});
