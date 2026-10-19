import { extractFileStructure, findRelatedTestPath } from './context.js';
import { ReviewIssue } from '@ai-reviewer/shared';

export interface ChangedFunction {
  name: string;
  signature: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface TestAwareAnalysisResult {
  changedFunctions: ChangedFunction[];
  coveredFunctions: string[];
  untestedFunctions: string[];
  hasTestCoverage: boolean;
  testRecommendations: TestRecommendation[];
}

export interface TestRecommendation {
  functionName: string;
  filePath: string;
  reason: string;
  suggestedTestFile: string;
  suggestedTestCode: string;
}

/**
 * Analyzes changed functions against available repository test files to detect
 * coverage gaps and generate test recommendations for security-sensitive or bug-prone changes.
 */
export function analyzeTestAwareness(params: {
  changedFilePath: string;
  changedLines: number[];
  fileContent: string;
  allRepoFiles?: { path: string; content?: string }[];
  issues?: ReviewIssue[];
}): TestAwareAnalysisResult {
  const { changedFilePath, changedLines, fileContent, allRepoFiles = [], issues = [] } = params;

  const structure = extractFileStructure(fileContent, changedFilePath);
  const changedLinesSet = new Set(changedLines);

  // Identify changed functions
  const changedFunctions: ChangedFunction[] = structure.functions
    .filter((fn) => {
      for (let l = fn.startLine; l <= fn.endLine; l++) {
        if (changedLinesSet.has(l)) return true;
      }
      return false;
    })
    .map((fn) => ({
      name: fn.name,
      signature: fn.signature,
      filePath: changedFilePath,
      startLine: fn.startLine,
      endLine: fn.endLine,
    }));

  const coveredFunctions: string[] = [];
  const untestedFunctions: string[] = [];

  // Look for related test files in repository
  const repoPaths = allRepoFiles.map((f) => f.path);
  const relatedTestPath = findRelatedTestPath(changedFilePath, repoPaths);
  const testFileObj = relatedTestPath ? allRepoFiles.find((f) => f.path === relatedTestPath) : null;
  const testContent = testFileObj?.content || '';

  for (const fn of changedFunctions) {
    if (testContent && (testContent.includes(fn.name) || testContent.includes(`describe('${fn.name}'`) || testContent.includes(`test('${fn.name}'`))) {
      coveredFunctions.push(fn.name);
    } else {
      untestedFunctions.push(fn.name);
    }
  }

  const hasTestCoverage = changedFunctions.length > 0 ? coveredFunctions.length === changedFunctions.length : true;

  // Check if any untested function has an associated security or critical issue
  const testRecommendations: TestRecommendation[] = [];

  for (const fnName of untestedFunctions) {
    const fnObj = changedFunctions.find((f) => f.name === fnName);
    if (!fnObj) continue;

    // Check if issues occur inside this function
    const fnIssues = issues.filter(
      (iss) =>
        iss.file_path === changedFilePath &&
        iss.line_number >= fnObj.startLine &&
        iss.line_number <= fnObj.endLine
    );

    const hasSecurityIssue = fnIssues.some((i) => i.category === 'security' || i.severity === 'critical');
    const hasBugIssue = fnIssues.some((i) => i.category === 'bug' || i.severity === 'warning');

    if (hasSecurityIssue || hasBugIssue || fnIssues.length > 0) {
      const targetTestFile = relatedTestPath || changedFilePath.replace(/\.[^/.]+$/, '.test.ts');
      const issueSummary = fnIssues.map((i) => i.message).join('; ');

      const suggestedTestCode = `import test from 'node:test';
import assert from 'node:assert/strict';
import { ${fnName} } from './${changedFilePath.split('/').pop()?.replace(/\.[^/.]+$/, '')}.js';

test('${fnName} handles edge cases and rejects unauthorized/invalid inputs', async () => {
  // Test boundary conditions and verify mitigation for: ${issueSummary || 'untested code changes'}
  await assert.rejects(
    async () => {
      // @ts-expect-error Testing invalid/malicious input
      await ${fnName}(null);
    },
    /invalid|unauthorized|forbidden|error/i,
    'Should safely reject invalid or malicious input'
  );
});`;

      testRecommendations.push({
        functionName: fnName,
        filePath: changedFilePath,
        reason: hasSecurityIssue
          ? `Security-sensitive change in ${fnName} lacks unit/integration test coverage.`
          : `Untested logic changes in ${fnName} could introduce undetected regressions.`,
        suggestedTestFile: targetTestFile,
        suggestedTestCode,
      });
    }
  }

  return {
    changedFunctions,
    coveredFunctions,
    untestedFunctions,
    hasTestCoverage,
    testRecommendations,
  };
}
