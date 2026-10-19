import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckAnnotations,
  buildCheckRunSummary,
  createCheckRun,
  updateCheckRunProgress,
  completeCheckRun,
  CheckRunSummaryData,
} from './checks.js';
import { ReviewIssue } from '@ai-reviewer/shared';

describe('GitHub Checks Integration (Phase 4 Requirement 1)', () => {
  it('correctly maps ReviewIssues to Check Run Annotations with priority sorting and CWE/OWASP metadata', () => {
    const issues: ReviewIssue[] = [
      {
        file_path: 'src/utils.ts',
        line_number: 12,
        severity: 'suggestion',
        category: 'style',
        message: 'Prefer arrow function syntax',
      },
      {
        file_path: 'src/auth.ts',
        line_number: 45,
        severity: 'critical',
        category: 'security',
        message: 'SQL Injection detected in raw query',
        cwe: 'CWE-89',
        owasp: 'A03:2021-Injection',
        suggested_fix: 'db.query("SELECT * FROM users WHERE id = $1", [id])',
      },
      {
        file_path: 'src/server.ts',
        line_number: 99,
        severity: 'warning',
        category: 'bug',
        message: 'Potential unhandled promise rejection',
      },
    ];

    const annotations = buildCheckAnnotations(issues);

    assert.equal(annotations.length, 3);
    // Critical must be first in the array
    assert.equal(annotations[0].annotation_level, 'failure');
    assert.equal(annotations[0].path, 'src/auth.ts');
    assert.ok(annotations[0].title?.includes('CWE-89'));
    assert.ok(annotations[0].message.includes('A03:2021-Injection'));
    assert.ok(annotations[0].raw_details?.includes('Suggested Fix:'));

    // Warning is second
    assert.equal(annotations[1].annotation_level, 'warning');
    assert.equal(annotations[1].path, 'src/server.ts');

    // Suggestion is third
    assert.equal(annotations[2].annotation_level, 'notice');
    assert.equal(annotations[2].path, 'src/utils.ts');
  });

  it('limits annotations to maximum 50 per GitHub API constraints', () => {
    const manyIssues: ReviewIssue[] = Array.from({ length: 65 }, (_, i) => ({
      file_path: `src/file_${i}.ts`,
      line_number: i + 1,
      severity: i < 5 ? 'critical' : i < 20 ? 'warning' : 'suggestion',
      category: 'bug',
      message: `Issue #${i}`,
    }));

    const annotations = buildCheckAnnotations(manyIssues);
    assert.equal(annotations.length, 50, 'Must cap annotations to 50 items');
    // Top 5 must be criticals
    for (let i = 0; i < 5; i++) {
      assert.equal(annotations[i].annotation_level, 'failure');
    }
  });

  it('buildCheckRunSummary formats comprehensive Markdown metrics and partial state', () => {
    const summaryData: CheckRunSummaryData = {
      filesAnalyzed: 14,
      linesAnalyzed: 340,
      criticalCount: 2,
      warningCount: 3,
      suggestionCount: 5,
      reviewDurationMs: 1420,
      model: 'gemini-1.5-flash',
      isPartial: true,
      partialReasons: ['File cap reached (14 files)'],
      verdict: 'REQUEST_CHANGES',
    };

    const { title, summary, text } = buildCheckRunSummary(summaryData);

    assert.ok(title.includes('Blocked (2 Critical Issues)'));
    assert.ok(summary.includes('Partial Review State'));
    assert.ok(summary.includes('Files Analyzed**: 14'));
    assert.ok(summary.includes('Lines Analyzed**: 340'));
    assert.ok(summary.includes('Critical Findings**: 2'));
    assert.ok(summary.includes('Model Engine**: `gemini-1.5-flash`'));
    assert.ok(summary.includes('1.4s (1420ms)'));
    assert.ok(text.includes('Fail-Closed Policy'));
  });

  it('interacts with Octokit Checks API to create, update progress, and complete check run', async () => {
    let createdPayload: any = null;
    let updatedProgressPayload: any = null;
    let completedPayload: any = null;

    const mockOctokit: any = {
      rest: {
        checks: {
          create: async (params: any) => {
            createdPayload = params;
            return { data: { id: 78901 } };
          },
          update: async (params: any) => {
            if (params.status === 'in_progress') {
              updatedProgressPayload = params;
            } else if (params.status === 'completed') {
              completedPayload = params;
            }
            return { data: { id: params.check_run_id } };
          },
        },
      },
    };

    // 1. Create check run
    const checkId = await createCheckRun(mockOctokit, 'org', 'repo', 'sha-123');
    assert.equal(checkId, 78901);
    assert.equal(createdPayload.status, 'queued');
    assert.equal(createdPayload.name, 'AI Code Review');

    // 2. Update progress
    await updateCheckRunProgress(mockOctokit, 'org', 'repo', checkId!, 'STATIC ANALYSIS');
    assert.equal(updatedProgressPayload.status, 'in_progress');
    assert.ok(updatedProgressPayload.output.title.includes('STATIC ANALYSIS'));

    // 3. Complete check run
    await completeCheckRun(
      mockOctokit,
      'org',
      'repo',
      checkId!,
      'failure',
      {
        filesAnalyzed: 5,
        linesAnalyzed: 120,
        criticalCount: 1,
        warningCount: 0,
        suggestionCount: 0,
        reviewDurationMs: 800,
        model: 'gemini-1.5-flash',
        isPartial: false,
        verdict: 'REQUEST_CHANGES',
      },
      [
        {
          file_path: 'src/index.ts',
          line_number: 10,
          severity: 'critical',
          category: 'security',
          message: 'Hardcoded secret',
        },
      ]
    );

    assert.equal(completedPayload.status, 'completed');
    assert.equal(completedPayload.conclusion, 'failure');
    assert.equal(completedPayload.output.annotations.length, 1);
    assert.equal(completedPayload.output.annotations[0].annotation_level, 'failure');
  });
});
