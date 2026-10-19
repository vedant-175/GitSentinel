import { ReviewIssue } from '@ai-reviewer/shared';
import { LabeledDiff, ExpectedIssue } from './dataset.js';
export interface ConfidenceInterval {
    center: number;
    low: number;
    high: number;
}
export interface IssueMatchResult {
    tp: number;
    fp: number;
    fn: number;
    matchedExpected: Array<{
        expected: ExpectedIssue;
        detected: ReviewIssue;
    }>;
    unmatchedDetected: ReviewIssue[];
    unmatchedExpected: ExpectedIssue[];
}
export interface EngineResult {
    detectedIssues: ReviewIssue[];
    issueScoring: IssueMatchResult;
    diffClassification: 'TP' | 'FP' | 'TN' | 'FN';
    latencyMs: number;
    tokens: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    };
    model?: string;
    promptHashes: string[];
}
export interface EvalDiffRunResult {
    id: string;
    name: string;
    filePath: string;
    hasBug: boolean;
    isInjection: boolean;
    isHistorical: boolean;
    isHeldOut: boolean;
    language: string;
    staticOnly: EngineResult;
    llmOnly: EngineResult;
    combined: EngineResult;
    injectionBlocked: boolean;
}
export interface EngineAggregateMetrics {
    issueLevel: {
        tp: number;
        fp: number;
        fn: number;
        precision: number;
        precisionCi: ConfidenceInterval;
        recall: number;
        recallCi: ConfidenceInterval;
        f1: number;
    };
    diffLevel: {
        tp: number;
        fp: number;
        tn: number;
        fn: number;
        accuracy: number;
        precision: number;
        recall: number;
        falsePositiveRate: number;
    };
}
export interface SingleRunSummary {
    runIndex: number;
    date: string;
    commit: string;
    provider: string;
    model: string;
    totalDiffs: number;
    heldOutDiffsCount: number;
    allDiffs: {
        staticOnly: EngineAggregateMetrics;
        llmOnly: EngineAggregateMetrics;
        combined: EngineAggregateMetrics;
    };
    heldOutSet: {
        staticOnly: EngineAggregateMetrics;
        llmOnly: EngineAggregateMetrics;
        combined: EngineAggregateMetrics;
    };
    injections: {
        total: number;
        blocked: number;
        bypassed: number;
        blockRate: number;
    };
    performance: {
        meanLatencyMs: number;
        p50LatencyMs: number;
        p95LatencyMs: number;
        minLatencyMs: number;
        maxLatencyMs: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        totalTokens: number;
    };
    results: EvalDiffRunResult[];
}
export interface MultiRunEvaluationSummary {
    date: string;
    commit: string;
    provider: string;
    model: string;
    totalRuns: number;
    totalDiffs: number;
    heldOutDiffsCount: number;
    runs: SingleRunSummary[];
    nondeterminism: {
        deterministicDiffsCount: number;
        nondeterministicDiffsCount: number;
        stabilityRate: number;
        diffVariances: Array<{
            id: string;
            name: string;
            runClassifications: string[];
            runIssueCounts: number[];
        }>;
    };
    aggregateAllDiffsCombined: {
        meanPrecision: number;
        precisionCi: ConfidenceInterval;
        meanRecall: number;
        recallCi: ConfidenceInterval;
        meanF1: number;
    };
    aggregateHeldOutCombined: {
        meanPrecision: number;
        precisionCi: ConfidenceInterval;
        meanRecall: number;
        recallCi: ConfidenceInterval;
        meanF1: number;
    };
}
export declare function wilsonScoreInterval(successes: number, total: number, z?: number): ConfidenceInterval;
export declare function scoreIssues(detectedIssues: ReviewIssue[], expectedIssues: ExpectedIssue[]): IssueMatchResult;
export declare function classifyDiff(hasBug: boolean, scoring: IssueMatchResult): 'TP' | 'FP' | 'TN' | 'FN';
export declare function computeEngineAggregate(diffResults: Array<{
    diff: LabeledDiff;
    engine: EngineResult;
}>): EngineAggregateMetrics;
export declare function runEvaluation(): Promise<MultiRunEvaluationSummary>;
//# sourceMappingURL=run-eval.d.ts.map