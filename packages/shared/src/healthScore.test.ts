import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRepositoryHealthScore,
  generateStructuredPRSummary,
} from './healthScore.js';
import { ReviewIssue } from './types.js';

describe('Repository Health & Structured Summary Suite (Phase 4 Requirement 5 & 6)', () => {
  it('calculates an explainable 100-point score with exact dimensional breakdowns and penalties', () => {
    // Clean repo
    const cleanReport = calculateRepositoryHealthScore({
      issues: [],
      totalPrs: 10,
      prsWithTests: 9,
    });

    assert.equal(cleanReport.overallScore, 100);
    assert.equal(cleanReport.grade, 'A');
    assert.equal(cleanReport.dimensions.security.score, 30);
    assert.equal(cleanReport.dimensions.reliability.score, 25);
    assert.equal(cleanReport.dimensions.maintainability.score, 20);
    assert.equal(cleanReport.dimensions.testing.score, 15);
    assert.equal(cleanReport.dimensions.performance.score, 10);

    // Repo with 1 critical security issue (-15 pts) and 1 warning bug (-4 pts)
    const degradedReport = calculateRepositoryHealthScore({
      issues: [
        { severity: 'critical', category: 'security' },
        { severity: 'warning', category: 'bug' },
        { severity: 'suggestion', category: 'style' }, // -2 pts
      ],
      totalPrs: 10,
      prsWithTests: 10,
    });

    // 30 - 15 = 15
    assert.equal(degradedReport.dimensions.security.score, 15);
    assert.ok(degradedReport.dimensions.security.deductions[0].includes('critical security'));

    // 25 - 4 = 21
    assert.equal(degradedReport.dimensions.reliability.score, 21);

    // 20 - 2 = 18
    assert.equal(degradedReport.dimensions.maintainability.score, 18);

    // Total: 15 + 21 + 18 + 15 + 10 = 79 (Grade: C)
    assert.equal(degradedReport.overallScore, 79);
    assert.equal(degradedReport.grade, 'C');
    assert.ok(degradedReport.explanation.includes('79/100'));
  });

  it('ignores dismissed and fixed issues when scoring active repository health', () => {
    const report = calculateRepositoryHealthScore({
      issues: [
        { severity: 'critical', category: 'security', status: 'fixed' },
        { severity: 'critical', category: 'security', status: 'dismissed' },
        { severity: 'warning', category: 'bug', status: 'open' }, // only open issue penalizes
      ],
      totalPrs: 5,
      prsWithTests: 5,
    });

    // Fixed & dismissed security issues do NOT penalize security score
    assert.equal(report.dimensions.security.score, 30);
    // Open warning bug penalizes reliability by 4
    assert.equal(report.dimensions.reliability.score, 21);
    assert.equal(report.overallScore, 96);
    assert.equal(report.grade, 'A');
  });

  it('generateStructuredPRSummary segregates deterministic from AI findings and computes risk level', () => {
    const mockIssues: ReviewIssue[] = [
      {
        file_path: 'src/config.ts',
        line_number: 14,
        severity: 'critical',
        category: 'security',
        message: 'Hardcoded API secret',
        source: 'static_analysis',
        cwe: 'CWE-798',
      },
      {
        file_path: 'src/api.ts',
        line_number: 82,
        severity: 'warning',
        category: 'bug',
        message: 'Missing error handler in async catch',
        source: 'llm',
      },
    ];

    const summary = generateStructuredPRSummary({
      filesCount: 2,
      linesCount: 45,
      issues: mockIssues,
      aiAssessment: 'Attention required on credentials and unhandled async rejections.',
    });

    assert.equal(summary.riskLevel, 'CRITICAL');
    assert.equal(summary.deterministicFindings.length, 1);
    assert.equal(summary.deterministicFindings[0].message, 'Hardcoded API secret');

    assert.equal(summary.aiFindings.length, 1);
    assert.equal(summary.aiFindings[0].message, 'Missing error handler in async catch');

    assert.ok(summary.markdown.includes('Deterministic Static Analysis Findings (1)'));
    assert.ok(summary.markdown.includes('Semantic AI Model Findings (1)'));
    assert.ok(summary.markdown.includes('CWE-798'));
  });
});
