import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wilsonScoreInterval,
  scoreIssues,
  classifyDiff,
  computeEngineAggregate,
  computePartitionMetrics,
  evaluateDiffStatic,
  evaluateDiffLLM,
  evaluateDiffHybrid,
} from './run-eval.js';
import { LABELED_DIFFS, ExpectedIssue } from './dataset.js';
import { ReviewIssue } from '@ai-reviewer/shared';
import { MockProvider } from '../apps/worker/src/review/llm.js';

test('LABELED_DIFFS dataset satisfies Phase A expansion guarantees', () => {
  // Requirement: at least 100 labeled diffs
  assert.ok(
    LABELED_DIFFS.length >= 100,
    `Expected at least 100 labeled diffs, got ${LABELED_DIFFS.length}`
  );

  // Requirement: includes real historical PRs
  const historicalDiffs = LABELED_DIFFS.filter(d => d.isHistorical);
  assert.ok(
    historicalDiffs.length >= 10,
    `Expected at least 10 historical diffs, got ${historicalDiffs.length}`
  );

  // Requirement: keeps a held-out set
  const heldOutDiffs = LABELED_DIFFS.filter(d => d.isHeldOut);
  assert.ok(
    heldOutDiffs.length >= 20,
    `Expected at least 20 held-out diffs, got ${heldOutDiffs.length}`
  );

  // Requirement: injection diffs present
  const injectionDiffs = LABELED_DIFFS.filter(d => d.isInjection);
  assert.ok(
    injectionDiffs.length >= 5,
    `Expected at least 5 injection diffs, got ${injectionDiffs.length}`
  );

  // Every buggy diff has expected issues with line ranges
  for (const diff of LABELED_DIFFS) {
    if (diff.hasBug) {
      assert.ok(
        diff.expectedIssues.length > 0,
        `Buggy diff ${diff.id} must define at least one expected issue`
      );
      for (const exp of diff.expectedIssues) {
        assert.ok(exp.startLine > 0, `Expected startLine > 0 in ${diff.id}`);
        assert.ok(exp.endLine >= exp.startLine, `Expected endLine >= startLine in ${diff.id}`);
        assert.ok(exp.category, `Expected category in ${diff.id}`);
      }
    }
  }
});

test('wilsonScoreInterval computes mathematically sound 95% confidence intervals', () => {
  // Empty case
  const empty = wilsonScoreInterval(0, 0);
  assert.equal(empty.center, 0);
  assert.equal(empty.low, 0);
  assert.equal(empty.high, 0);

  // Perfect 10/10
  const perfect = wilsonScoreInterval(10, 10);
  assert.ok(perfect.center > 0.7);
  assert.ok(perfect.low > 0.6);
  assert.equal(perfect.high, 1.0);

  // 95/100
  const high = wilsonScoreInterval(95, 100);
  assert.ok(high.low >= 0.88);
  assert.ok(high.high <= 0.99);
  assert.ok(high.low < high.center && high.center < high.high);

  // 0/50
  const zero = wilsonScoreInterval(0, 50);
  assert.equal(zero.low, 0);
  assert.ok(zero.high < 0.1);
});

test('scoreIssues matches true positives at file, line range, and category level', () => {
  const expected: ExpectedIssue[] = [
    {
      filePath: 'src/users.ts',
      startLine: 10,
      endLine: 12,
      category: 'security',
      severity: 'critical',
      description: 'SQL Injection',
    },
  ];

  // 1. Exact match within line range & matching category
  const matchingDetected: ReviewIssue[] = [
    {
      file_path: 'src/users.ts',
      line_number: 10,
      category: 'security',
      severity: 'critical',
      message: 'Unsanitized user input in query',
      confidence: 0.95,
    },
  ];

  const res1 = scoreIssues(matchingDetected, expected);
  assert.equal(res1.tp, 1);
  assert.equal(res1.fp, 0);
  assert.equal(res1.fn, 0);
  assert.equal(res1.matchedExpected.length, 1);

  // 2. Line number out of range (missed expected issue, spurious detection)
  const outOfRangeDetected: ReviewIssue[] = [
    {
      file_path: 'src/users.ts',
      line_number: 99,
      category: 'security',
      severity: 'critical',
      message: 'Unsanitized user input in query',
      confidence: 0.95,
    },
  ];

  const res2 = scoreIssues(outOfRangeDetected, expected);
  assert.equal(res2.tp, 0);
  assert.equal(res2.fp, 1);
  assert.equal(res2.fn, 1);

  // 3. Category mismatch (bug vs security)
  const catMismatchDetected: ReviewIssue[] = [
    {
      file_path: 'src/users.ts',
      line_number: 10,
      category: 'style',
      severity: 'suggestion',
      message: 'Indentation warning',
      confidence: 0.95,
    },
  ];

  const res3 = scoreIssues(catMismatchDetected, expected);
  assert.equal(res3.tp, 0);
  assert.equal(res3.fp, 1);
  assert.equal(res3.fn, 1);

  // 4. Clean file with 0 expected issues
  const cleanExpected: ExpectedIssue[] = [];
  const cleanRes = scoreIssues(matchingDetected, cleanExpected);
  assert.equal(cleanRes.tp, 0);
  assert.equal(cleanRes.fp, 1);
  assert.equal(cleanRes.fn, 0);
});

test('classifyDiff correctly assigns diff-level confusion matrix labels', () => {
  // Buggy diff with 1 TP
  assert.equal(classifyDiff(true, { tp: 1, fp: 0, fn: 0 } as any), 'TP');
  // Buggy diff with 0 TP
  assert.equal(classifyDiff(true, { tp: 0, fp: 1, fn: 1 } as any), 'FN');
  // Clean diff with 0 FP
  assert.equal(classifyDiff(false, { tp: 0, fp: 0, fn: 0 } as any), 'TN');
  // Clean diff with 1 FP
  assert.equal(classifyDiff(false, { tp: 0, fp: 1, fn: 0 } as any), 'FP');
});

test('computeEngineAggregate aggregates issue-level and diff-level metrics with CIs', () => {
  const dummyDiff = LABELED_DIFFS[0];
  const aggregate = computeEngineAggregate([
    {
      diff: dummyDiff,
      engine: {
        detectedIssues: [],
        issueScoring: {
          tp: 1,
          fp: 0,
          fn: 0,
          matchedExpected: [],
          unmatchedDetected: [],
          unmatchedExpected: [],
        },
        diffClassification: 'TP',
        latencyMs: 10,
        tokens: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        promptHashes: ['hash1'],
      },
    },
  ]);

  assert.equal(aggregate.issueLevel.tp, 1);
  assert.equal(aggregate.issueLevel.fp, 0);
  assert.equal(aggregate.issueLevel.precision, 1);
  assert.equal(aggregate.diffLevel.tp, 1);
  assert.equal(aggregate.diffLevel.accuracy, 1);
  assert.ok(aggregate.issueLevel.precisionCi.high >= aggregate.issueLevel.precisionCi.low);
});

test('computePartitionMetrics computes all required metrics across precision, recall, F1, severities, and cost', () => {
  const dummyDiff = LABELED_DIFFS[0]; // diff-01 (SQL Injection, security, critical)
  const cleanDiff = LABELED_DIFFS.find(d => !d.hasBug)!;

  const mockItems = [
    {
      diff: dummyDiff,
      detectedIssues: [
        {
          file_path: 'src/users.ts',
          line_number: 10,
          category: 'security' as const,
          severity: 'critical' as const,
          message: 'SQL injection detected',
          confidence: 0.95,
        },
      ],
      rawCount: 2, // 2 raw before deduplicating to 1 -> 50% duplicate rate
      scoring: {
        tp: 1,
        fp: 0,
        fn: 0,
        matchedExpected: [{ expected: dummyDiff.expectedIssues[0], detected: {} as any }],
        unmatchedDetected: [],
        unmatchedExpected: [],
      },
      diffClassification: 'TP' as const,
      latencyMs: 12.5,
      tokens: { inputTokens: 500, outputTokens: 100, totalTokens: 600 },
    },
    {
      diff: cleanDiff,
      detectedIssues: [],
      rawCount: 0,
      scoring: {
        tp: 0,
        fp: 0,
        fn: 0,
        matchedExpected: [],
        unmatchedDetected: [],
        unmatchedExpected: [],
      },
      diffClassification: 'TN' as const,
      latencyMs: 5.0,
      tokens: { inputTokens: 200, outputTokens: 50, totalTokens: 250 },
    },
  ];

  const metrics = computePartitionMetrics('overall', mockItems, { inputCostPer1M: 0.10, outputCostPer1M: 0.40 });

  assert.equal(metrics.diffCount, 2);
  assert.equal(metrics.buggyDiffCount, 1);
  assert.equal(metrics.cleanDiffCount, 1);
  assert.equal(metrics.tp, 1);
  assert.equal(metrics.fp, 0);
  assert.equal(metrics.fn, 0);
  assert.equal(metrics.precision, 1.0);
  assert.equal(metrics.recall, 1.0);
  assert.equal(metrics.f1, 1.0);
  assert.equal(metrics.securityRecall, 1.0);
  assert.equal(metrics.criticalSeverityRecall, 1.0);
  assert.equal(metrics.falsePositiveRate, 0.0);
  assert.equal(metrics.falseNegativeRate, 0.0);
  assert.equal(metrics.duplicateFindingRate, 0.5); // (2 - 1) / 2 = 0.5
  assert.equal(metrics.diffLevel.tp, 1);
  assert.equal(metrics.diffLevel.tn, 1);
  assert.equal(metrics.diffLevel.fp, 0);
  assert.equal(metrics.diffLevel.fn, 0);
  assert.equal(metrics.totalTokens.totalTokens, 850);
  assert.ok(metrics.estimatedCostPerReview > 0);
  assert.ok(metrics.avgLatencyMs > 0);
});

test('Independent evaluation engines (Static-only, LLM-only, Hybrid) run successfully', async () => {
  const diff02 = LABELED_DIFFS.find(d => d.id === 'diff-02')!; // Hardcoded AWS key
  const mockProvider = new MockProvider();

  // 1. Static
  const staticRes = await evaluateDiffStatic(diff02);
  assert.ok(staticRes.staticOnly.detectedIssues.length > 0, 'Static must detect hardcoded AWS key');
  assert.equal(staticRes.staticOnly.diffClassification, 'TP');

  // 2. LLM
  const llmRes = await evaluateDiffLLM(diff02, mockProvider);
  assert.ok(llmRes.latencyMs >= 0);
  assert.ok(llmRes.tokens.totalTokens >= 0);

  // 3. Hybrid
  const hybridRes = await evaluateDiffHybrid(diff02, mockProvider);
  assert.ok(hybridRes.detectedIssues.length > 0, 'Hybrid must detect AWS key');
  assert.equal(hybridRes.diffClassification, 'TP');
});

test('Partition slice isolation guarantees: Dev, Held-Out, Historical, and Adversarial sets', () => {
  const devDiffs = LABELED_DIFFS.filter(d => !d.isHeldOut && !d.isHistorical && !d.isInjection);
  const heldOutDiffs = LABELED_DIFFS.filter(d => d.isHeldOut);
  const historicalDiffs = LABELED_DIFFS.filter(d => d.isHistorical);
  const injectionDiffs = LABELED_DIFFS.filter(d => d.isInjection);

  assert.equal(devDiffs.length, 76, 'Dev partition must contain exactly 76 diffs');
  assert.equal(heldOutDiffs.length, 25, 'Held-out partition must contain exactly 25 diffs');
  assert.equal(historicalDiffs.length, 15, 'Historical partition must contain exactly 15 diffs');
  assert.equal(injectionDiffs.length, 9, 'Adversarial partition must contain exactly 9 diffs');

  // Strict isolation: no held-out diff is in the development partition
  for (const h of heldOutDiffs) {
    assert.ok(!devDiffs.some(d => d.id === h.id), `Held-out diff ${h.id} must not exist in dev set`);
  }
});

