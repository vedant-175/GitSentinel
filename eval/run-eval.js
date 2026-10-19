"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wilsonScoreInterval = wilsonScoreInterval;
exports.scoreIssues = scoreIssues;
exports.classifyDiff = classifyDiff;
exports.computeEngineAggregate = computeEngineAggregate;
exports.runEvaluation = runEvaluation;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const shared_1 = require("@ai-reviewer/shared");
const analyzer_js_1 = require("../apps/worker/src/staticAnalysis/analyzer.js");
const llm_js_1 = require("../apps/worker/src/review/llm.js");
const sanitize_js_1 = require("../apps/worker/src/review/sanitize.js");
const dataset_js_1 = require("./dataset.js");
// -------------------------------------------------------------
// Scoring & Confidence Interval Utilities
// -------------------------------------------------------------
function wilsonScoreInterval(successes, total, z = 1.95996) {
    if (total === 0) {
        return { center: 0, low: 0, high: 0 };
    }
    const p = successes / total;
    const z2 = z * z;
    const denominator = 1 + z2 / total;
    const center = (p + z2 / (2 * total)) / denominator;
    const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
    return {
        center: Math.round(center * 1000) / 1000,
        low: Math.max(0, Math.round((center - margin) * 1000) / 1000),
        high: Math.min(1, Math.round((center + margin) * 1000) / 1000),
    };
}
function scoreIssues(detectedIssues, expectedIssues) {
    const unmatchedExpected = [...expectedIssues];
    const matchedExpected = [];
    const unmatchedDetected = [];
    const normalize = (p) => p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    for (const det of detectedIssues) {
        const detPath = normalize(det.file_path);
        const expIndex = unmatchedExpected.findIndex(exp => {
            const expPath = normalize(exp.filePath);
            const fileMatches = detPath.endsWith(expPath) || expPath.endsWith(detPath);
            const lineMatches = det.line_number >= exp.startLine && det.line_number <= exp.endLine;
            const catMatches = det.category.toLowerCase() === exp.category.toLowerCase() ||
                (exp.category === 'security' && (det.category.toLowerCase() === 'security' || det.category.toLowerCase() === 'vulnerability')) ||
                (exp.category === 'bug' && (det.category.toLowerCase() === 'bug' || det.category.toLowerCase() === 'logic_error'));
            return fileMatches && lineMatches && catMatches;
        });
        if (expIndex !== -1) {
            const [matchedExp] = unmatchedExpected.splice(expIndex, 1);
            matchedExpected.push({ expected: matchedExp, detected: det });
        }
        else {
            unmatchedDetected.push(det);
        }
    }
    return {
        tp: matchedExpected.length,
        fp: unmatchedDetected.length,
        fn: unmatchedExpected.length,
        matchedExpected,
        unmatchedDetected,
        unmatchedExpected,
    };
}
function classifyDiff(hasBug, scoring) {
    if (hasBug) {
        return scoring.tp > 0 ? 'TP' : 'FN';
    }
    else {
        return scoring.fp > 0 ? 'FP' : 'TN';
    }
}
function computeEngineAggregate(diffResults) {
    let issueTp = 0;
    let issueFp = 0;
    let issueFn = 0;
    let diffTp = 0;
    let diffFp = 0;
    let diffTn = 0;
    let diffFn = 0;
    for (const item of diffResults) {
        issueTp += item.engine.issueScoring.tp;
        issueFp += item.engine.issueScoring.fp;
        issueFn += item.engine.issueScoring.fn;
        switch (item.engine.diffClassification) {
            case 'TP':
                diffTp++;
                break;
            case 'FP':
                diffFp++;
                break;
            case 'TN':
                diffTn++;
                break;
            case 'FN':
                diffFn++;
                break;
        }
    }
    const issuePrec = issueTp + issueFp > 0 ? issueTp / (issueTp + issueFp) : 1;
    const issueRec = issueTp + issueFn > 0 ? issueTp / (issueTp + issueFn) : 1;
    const f1 = issuePrec + issueRec > 0 ? (2 * issuePrec * issueRec) / (issuePrec + issueRec) : 0;
    const diffPrec = diffTp + diffFp > 0 ? diffTp / (diffTp + diffFp) : 1;
    const diffRec = diffTp + diffFn > 0 ? diffTp / (diffTp + diffFn) : 1;
    const fpr = diffFp + diffTn > 0 ? diffFp / (diffFp + diffTn) : 0;
    const accuracy = diffResults.length > 0 ? (diffTp + diffTn) / diffResults.length : 1;
    return {
        issueLevel: {
            tp: issueTp,
            fp: issueFp,
            fn: issueFn,
            precision: Math.round(issuePrec * 1000) / 1000,
            precisionCi: wilsonScoreInterval(issueTp, issueTp + issueFp),
            recall: Math.round(issueRec * 1000) / 1000,
            recallCi: wilsonScoreInterval(issueTp, issueTp + issueFn),
            f1: Math.round(f1 * 1000) / 1000,
        },
        diffLevel: {
            tp: diffTp,
            fp: diffFp,
            tn: diffTn,
            fn: diffFn,
            accuracy: Math.round(accuracy * 1000) / 1000,
            precision: Math.round(diffPrec * 1000) / 1000,
            recall: Math.round(diffRec * 1000) / 1000,
            falsePositiveRate: Math.round(fpr * 1000) / 1000,
        },
    };
}
function calculatePercentile(values, percentile) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}
function getGitCommitSha() {
    try {
        return (0, child_process_1.execSync)('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    }
    catch {
        return 'unknown';
    }
}
// -------------------------------------------------------------
// Core Single Diff Evaluation through Production Pipeline Code
// -------------------------------------------------------------
async function evaluateDiff(diffItem, provider) {
    const parsedFiles = (0, shared_1.parseUnifiedDiff)(diffItem.patch);
    const primaryFile = parsedFiles[0];
    const staticRawIssues = [];
    const llmRawIssues = [];
    const promptHashes = [];
    let modelReported = '';
    let llmLatencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const staticStart = performance.now();
    let staticLatencyMs = 0;
    if (primaryFile) {
        const chunks = (0, shared_1.chunkFileDiff)(primaryFile, 2000);
        // 1. Static Engine Pass
        for (const chunk of chunks) {
            const issues = (0, analyzer_js_1.runStaticAnalysis)({
                filePath: chunk.filePath,
                diff: chunk.diff,
            });
            for (const si of issues) {
                if (!chunk.addedLines.includes(si.line_number))
                    continue;
                const sanitized = (0, sanitize_js_1.sanitizeIssue)(si);
                staticRawIssues.push(sanitized);
            }
        }
        staticLatencyMs = Math.round((performance.now() - staticStart) * 100) / 100;
        // 2. Real LLM Engine Pass
        for (const chunk of chunks) {
            const llmChunkStart = performance.now();
            const reviewResult = await provider.reviewChunk(chunk);
            llmLatencyMs += Math.round((performance.now() - llmChunkStart) * 100) / 100;
            if (reviewResult.model) {
                modelReported = reviewResult.model;
            }
            if (reviewResult.promptHash) {
                promptHashes.push(reviewResult.promptHash);
            }
            if (reviewResult.usage) {
                inputTokens += reviewResult.usage.promptTokens;
                outputTokens += reviewResult.usage.completionTokens;
            }
            if (reviewResult.issues && reviewResult.issues.length > 0) {
                for (const rawIssue of reviewResult.issues) {
                    const parsed = shared_1.ReviewIssueSchema.safeParse(rawIssue);
                    if (!parsed.success)
                        continue;
                    const issue = parsed.data;
                    // Fail-closed validation rules
                    if (issue.file_path !== chunk.filePath)
                        continue;
                    if (!chunk.addedLines.includes(issue.line_number))
                        continue;
                    if ((issue.confidence ?? 1.0) < 0.7)
                        continue;
                    const sanitized = (0, sanitize_js_1.sanitizeIssue)(issue);
                    llmRawIssues.push(sanitized);
                }
            }
        }
    }
    // Deduplicate issues for static, llm, and combined
    const dedupe = (list) => {
        const seen = new Set();
        return list.filter(i => {
            const key = `${i.file_path}:${i.line_number}:${i.category.toLowerCase()}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    };
    const staticUnique = dedupe(staticRawIssues);
    const llmUnique = dedupe(llmRawIssues);
    const combinedUnique = dedupe([...staticRawIssues, ...llmRawIssues]);
    // Issue scoring
    const staticScoring = scoreIssues(staticUnique, diffItem.expectedIssues);
    const llmScoring = scoreIssues(llmUnique, diffItem.expectedIssues);
    const combinedScoring = scoreIssues(combinedUnique, diffItem.expectedIssues);
    // Injection bypass verification
    let injectionBlocked = true;
    if (diffItem.isInjection) {
        if (diffItem.hasBug && combinedScoring.tp === 0) {
            // Prompt injection successfully masked bug
            injectionBlocked = false;
        }
        else {
            injectionBlocked = true;
        }
    }
    return {
        id: diffItem.id,
        name: diffItem.name,
        filePath: diffItem.filePath,
        hasBug: diffItem.hasBug,
        isInjection: diffItem.isInjection,
        isHistorical: diffItem.isHistorical,
        isHeldOut: diffItem.isHeldOut,
        language: diffItem.language,
        staticOnly: {
            detectedIssues: staticUnique,
            issueScoring: staticScoring,
            diffClassification: classifyDiff(diffItem.hasBug, staticScoring),
            latencyMs: staticLatencyMs,
            tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            promptHashes: [],
        },
        llmOnly: {
            detectedIssues: llmUnique,
            issueScoring: llmScoring,
            diffClassification: classifyDiff(diffItem.hasBug, llmScoring),
            latencyMs: llmLatencyMs,
            tokens: {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
            },
            model: modelReported,
            promptHashes,
        },
        combined: {
            detectedIssues: combinedUnique,
            issueScoring: combinedScoring,
            diffClassification: classifyDiff(diffItem.hasBug, combinedScoring),
            latencyMs: Math.round((staticLatencyMs + llmLatencyMs) * 100) / 100,
            tokens: {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
            },
            model: modelReported,
            promptHashes,
        },
        injectionBlocked,
    };
}
// -------------------------------------------------------------
// Multi-Run Orchestrator
// -------------------------------------------------------------
async function runEvaluation() {
    console.log('⚡ ========================================================');
    console.log('⚡ AI Code Reviewer — Production Benchmark Evaluation Pipeline');
    console.log('⚡ ========================================================\n');
    // Enforce Real Provider (Phase A Item 1: Refuse mock)
    const providerName = (process.env.LLM_PROVIDER || '').toLowerCase();
    if (!providerName || providerName === 'mock') {
        console.error('❌ [EVAL REFUSAL] The eval runner requires a REAL provider.');
        console.error('MockProvider is strictly refused in evaluation.');
        console.error('Please configure LLM_PROVIDER ("gemini", "openai", or "anthropic") with valid credentials.');
        process.exit(1);
    }
    let targetModel = '';
    if (providerName === 'gemini')
        targetModel = process.env.GEMINI_MODEL || '';
    if (providerName === 'openai')
        targetModel = process.env.OPENAI_MODEL || '';
    if (providerName === 'anthropic')
        targetModel = process.env.ANTHROPIC_MODEL || '';
    if (!targetModel) {
        console.error(`❌ [EVAL REFUSAL] Missing model environment variable for provider "${providerName}".`);
        process.exit(1);
    }
    // Preflight check against provider API
    console.log(`🔍 Executing model preflight verification for ${providerName} (${targetModel})...`);
    await (0, llm_js_1.runModelPreflight)(providerName, targetModel);
    console.log('✅ Model preflight passed successfully.\n');
    const provider = (0, llm_js_1.getLLMProvider)();
    const commit = getGitCommitSha();
    const today = new Date().toISOString().split('T')[0];
    const runsDir = path_1.default.join(__dirname, 'runs', today);
    if (!fs_1.default.existsSync(runsDir)) {
        fs_1.default.mkdirSync(runsDir, { recursive: true });
    }
    const diffsDir = path_1.default.join(__dirname, 'diffs');
    if (!fs_1.default.existsSync(diffsDir)) {
        fs_1.default.mkdirSync(diffsDir, { recursive: true });
    }
    // Persist diff files to eval/diffs/
    for (const diffItem of dataset_js_1.LABELED_DIFFS) {
        const diffFileName = `${diffItem.id}-${diffItem.filePath.replace(/[/\\.]+/g, '_')}.diff`;
        fs_1.default.writeFileSync(path_1.default.join(diffsDir, diffFileName), diffItem.patch, 'utf8');
    }
    const runSummaries = [];
    const TOTAL_RUNS = 3;
    console.log(`Running evaluation across ${dataset_js_1.LABELED_DIFFS.length} diffs (${TOTAL_RUNS} iterations per diff to measure nondeterminism)...\n`);
    for (let runIdx = 1; runIdx <= TOTAL_RUNS; runIdx++) {
        console.log(`🔄 --- Starting Iteration ${runIdx} of ${TOTAL_RUNS} ---`);
        const runResults = [];
        const latencies = [];
        let runInputTokens = 0;
        let runOutputTokens = 0;
        for (const diffItem of dataset_js_1.LABELED_DIFFS) {
            const result = await evaluateDiff(diffItem, provider);
            runResults.push(result);
            latencies.push(result.combined.latencyMs);
            runInputTokens += result.combined.tokens.inputTokens;
            runOutputTokens += result.combined.tokens.outputTokens;
            const classification = result.combined.diffClassification;
            const statusIcon = classification === 'TP' || classification === 'TN' ? '✅' : '❌';
            console.log(`  ${statusIcon} [Run ${runIdx}] [${diffItem.id}] ${diffItem.name.slice(0, 50).padEnd(52)} => ${classification} (${result.combined.detectedIssues.length} issues, ${result.combined.latencyMs}ms)`);
        }
        // Compute metrics for Run
        const allDiffPairs = runResults.map(r => {
            const d = dataset_js_1.LABELED_DIFFS.find(x => x.id === r.id);
            return { diff: d, engine: r.combined };
        });
        const staticPairs = runResults.map(r => {
            const d = dataset_js_1.LABELED_DIFFS.find(x => x.id === r.id);
            return { diff: d, engine: r.staticOnly };
        });
        const llmPairs = runResults.map(r => {
            const d = dataset_js_1.LABELED_DIFFS.find(x => x.id === r.id);
            return { diff: d, engine: r.llmOnly };
        });
        const heldOutPairs = runResults
            .filter(r => r.isHeldOut)
            .map(r => {
            const d = dataset_js_1.LABELED_DIFFS.find(x => x.id === r.id);
            return { diff: d, engine: r.combined };
        });
        const heldOutStaticPairs = runResults
            .filter(r => r.isHeldOut)
            .map(r => {
            const d = dataset_js_1.LABELED_DIFFS.find(x => x.id === r.id);
            return { diff: d, engine: r.staticOnly };
        });
        const heldOutLlmPairs = runResults
            .filter(r => r.isHeldOut)
            .map(r => {
            const d = dataset_js_1.LABELED_DIFFS.find(x => x.id === r.id);
            return { diff: d, engine: r.llmOnly };
        });
        const injectionDiffs = runResults.filter(r => r.isInjection);
        const blockedCount = injectionDiffs.filter(r => r.injectionBlocked).length;
        const runSummary = {
            runIndex: runIdx,
            date: new Date().toISOString(),
            commit,
            provider: providerName,
            model: targetModel,
            totalDiffs: dataset_js_1.LABELED_DIFFS.length,
            heldOutDiffsCount: dataset_js_1.LABELED_DIFFS.filter(d => d.isHeldOut).length,
            allDiffs: {
                staticOnly: computeEngineAggregate(staticPairs),
                llmOnly: computeEngineAggregate(llmPairs),
                combined: computeEngineAggregate(allDiffPairs),
            },
            heldOutSet: {
                staticOnly: computeEngineAggregate(heldOutStaticPairs),
                llmOnly: computeEngineAggregate(heldOutLlmPairs),
                combined: computeEngineAggregate(heldOutPairs),
            },
            injections: {
                total: injectionDiffs.length,
                blocked: blockedCount,
                bypassed: injectionDiffs.length - blockedCount,
                blockRate: injectionDiffs.length > 0 ? Math.round((blockedCount / injectionDiffs.length) * 1000) / 1000 : 1,
            },
            performance: {
                meanLatencyMs: Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 10) / 10,
                p50LatencyMs: Math.round(calculatePercentile(latencies, 50) * 10) / 10,
                p95LatencyMs: Math.round(calculatePercentile(latencies, 95) * 10) / 10,
                minLatencyMs: Math.round(Math.min(...latencies) * 10) / 10,
                maxLatencyMs: Math.round(Math.max(...latencies) * 10) / 10,
                totalInputTokens: runInputTokens,
                totalOutputTokens: runOutputTokens,
                totalTokens: runInputTokens + runOutputTokens,
            },
            results: runResults,
        };
        // Write raw run file
        const runFilePath = path_1.default.join(runsDir, `run-${runIdx}.json`);
        fs_1.default.writeFileSync(runFilePath, JSON.stringify(runSummary, null, 2), 'utf8');
        console.log(`📁 Raw output for iteration ${runIdx} written to: ${runFilePath}\n`);
        runSummaries.push(runSummary);
    }
    // -------------------------------------------------------------
    // Analyze Nondeterminism Across the 3 Runs
    // -------------------------------------------------------------
    let deterministicCount = 0;
    const diffVariances = [];
    for (const diffItem of dataset_js_1.LABELED_DIFFS) {
        const runClassifications = runSummaries.map(r => r.results.find(res => res.id === diffItem.id).combined.diffClassification);
        const runIssueCounts = runSummaries.map(r => r.results.find(res => res.id === diffItem.id).combined.detectedIssues.length);
        const isDeterministic = runClassifications.every(c => c === runClassifications[0]) &&
            runIssueCounts.every(cnt => cnt === runIssueCounts[0]);
        if (isDeterministic) {
            deterministicCount++;
        }
        else {
            diffVariances.push({
                id: diffItem.id,
                name: diffItem.name,
                runClassifications,
                runIssueCounts,
            });
        }
    }
    const stabilityRate = Math.round((deterministicCount / dataset_js_1.LABELED_DIFFS.length) * 1000) / 1000;
    // Aggregate Combined Metrics Across Runs
    const meanAllPrec = Math.round((runSummaries.reduce((acc, r) => acc + r.allDiffs.combined.issueLevel.precision, 0) /
        runSummaries.length) *
        1000) / 1000;
    const meanAllRec = Math.round((runSummaries.reduce((acc, r) => acc + r.allDiffs.combined.issueLevel.recall, 0) /
        runSummaries.length) *
        1000) / 1000;
    const meanAllF1 = Math.round((runSummaries.reduce((acc, r) => acc + r.allDiffs.combined.issueLevel.f1, 0) /
        runSummaries.length) *
        1000) / 1000;
    const meanHeldOutPrec = Math.round((runSummaries.reduce((acc, r) => acc + r.heldOutSet.combined.issueLevel.precision, 0) /
        runSummaries.length) *
        1000) / 1000;
    const meanHeldOutRec = Math.round((runSummaries.reduce((acc, r) => acc + r.heldOutSet.combined.issueLevel.recall, 0) /
        runSummaries.length) *
        1000) / 1000;
    const meanHeldOutF1 = Math.round((runSummaries.reduce((acc, r) => acc + r.heldOutSet.combined.issueLevel.f1, 0) /
        runSummaries.length) *
        1000) / 1000;
    const multiRunSummary = {
        date: new Date().toISOString(),
        commit,
        provider: providerName,
        model: targetModel,
        totalRuns: TOTAL_RUNS,
        totalDiffs: dataset_js_1.LABELED_DIFFS.length,
        heldOutDiffsCount: dataset_js_1.LABELED_DIFFS.filter(d => d.isHeldOut).length,
        runs: runSummaries,
        nondeterminism: {
            deterministicDiffsCount: deterministicCount,
            nondeterministicDiffsCount: dataset_js_1.LABELED_DIFFS.length - deterministicCount,
            stabilityRate,
            diffVariances,
        },
        aggregateAllDiffsCombined: {
            meanPrecision: meanAllPrec,
            precisionCi: runSummaries[0].allDiffs.combined.issueLevel.precisionCi,
            meanRecall: meanAllRec,
            recallCi: runSummaries[0].allDiffs.combined.issueLevel.recallCi,
            meanF1: meanAllF1,
        },
        aggregateHeldOutCombined: {
            meanPrecision: meanHeldOutPrec,
            precisionCi: runSummaries[0].heldOutSet.combined.issueLevel.precisionCi,
            meanRecall: meanHeldOutRec,
            recallCi: runSummaries[0].heldOutSet.combined.issueLevel.recallCi,
            meanF1: meanHeldOutF1,
        },
    };
    const summaryFilePath = path_1.default.join(runsDir, 'summary.json');
    fs_1.default.writeFileSync(summaryFilePath, JSON.stringify(multiRunSummary, null, 2), 'utf8');
    // Also write to eval/results.json
    const resultsJsonPath = path_1.default.join(__dirname, 'results.json');
    fs_1.default.writeFileSync(resultsJsonPath, JSON.stringify(multiRunSummary, null, 2), 'utf8');
    console.log('========================================================');
    console.log('📊 MULTI-RUN BENCHMARK EVALUATION SUMMARY');
    console.log('========================================================');
    console.log(`• Provider & Model:      ${providerName} / ${targetModel}`);
    console.log(`• Git Commit:            ${commit}`);
    console.log(`• Total Labeled Diffs:   ${dataset_js_1.LABELED_DIFFS.length} (${multiRunSummary.heldOutDiffsCount} held-out)`);
    console.log(`• Iterations Run:        ${TOTAL_RUNS}`);
    console.log(`• Determinism Stability: ${(stabilityRate * 100).toFixed(1)}%`);
    console.log('--- ALL DIFFS (COMBINED ENGINE) ---');
    console.log(`• Issue Precision:       ${(meanAllPrec * 100).toFixed(1)}% (95% CI: [${(multiRunSummary.aggregateAllDiffsCombined.precisionCi.low * 100).toFixed(1)}%, ${(multiRunSummary.aggregateAllDiffsCombined.precisionCi.high * 100).toFixed(1)}%])`);
    console.log(`• Issue Recall:          ${(meanAllRec * 100).toFixed(1)}% (95% CI: [${(multiRunSummary.aggregateAllDiffsCombined.recallCi.low * 100).toFixed(1)}%, ${(multiRunSummary.aggregateAllDiffsCombined.recallCi.high * 100).toFixed(1)}%])`);
    console.log(`• F1 Score:              ${meanAllF1}`);
    console.log('--- HELD-OUT DATASET (COMBINED ENGINE) ---');
    console.log(`• Held-Out Precision:    ${(meanHeldOutPrec * 100).toFixed(1)}% (95% CI: [${(multiRunSummary.aggregateHeldOutCombined.precisionCi.low * 100).toFixed(1)}%, ${(multiRunSummary.aggregateHeldOutCombined.precisionCi.high * 100).toFixed(1)}%])`);
    console.log(`• Held-Out Recall:       ${(meanHeldOutRec * 100).toFixed(1)}% (95% CI: [${(multiRunSummary.aggregateHeldOutCombined.recallCi.low * 100).toFixed(1)}%, ${(multiRunSummary.aggregateHeldOutCombined.recallCi.high * 100).toFixed(1)}%])`);
    console.log(`• Summary written to:    ${summaryFilePath}`);
    console.log(`• Results written to:    ${resultsJsonPath}`);
    console.log('========================================================\n');
    return multiRunSummary;
}
if (require.main === module || process.argv[1]?.includes('run-eval')) {
    runEvaluation().catch(err => {
        console.error('Fatal evaluation runner error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=run-eval.js.map