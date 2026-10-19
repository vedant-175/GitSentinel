import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFileStructure, extractCallGraph, retrieveRelevantContext, findRelatedTestPath } from './context.js';
import { analyzeTestAwareness } from './testAware.js';
import { validateSuggestedPatch, isPathSafe } from './patchValidation.js';
import { shouldEscalateFinding, applyEscalationPolicy } from './escalation.js';
import { scanDependenciesForVulnerabilities, isVersionBelow, parseNpmManifest } from './dependencies.js';
import { ReviewIssue } from '@ai-reviewer/shared';

// ==========================================
// 1. CONTEXT-AWARE REVIEW TESTS
// ==========================================
test('Context Retrieval: extracts enclosing functions, types, interfaces, and imports', () => {
  const sampleCode = `
import { db } from './db.js';
import { User, AuthToken } from '../types.js';

export interface LoginRequest {
  username: string;
  pass: string;
}

export type AuthResponse = {
  token: string;
  expiresIn: number;
};

export async function authenticateUser(req: LoginRequest): Promise<AuthResponse> {
  const user = await db.findUser(req.username);
  if (!user) throw new Error('Not found');
  return generateToken(user);
}

function generateToken(user: any): AuthResponse {
  return { token: 'xyz', expiresIn: 3600 };
}
`;

  const structure = extractFileStructure(sampleCode, 'src/auth/service.ts');
  assert.equal(structure.imports.length, 2);
  assert.equal(structure.functions.length, 2);
  assert.equal(structure.functions[0].name, 'authenticateUser');
  assert.equal(structure.functions[1].name, 'generateToken');
  assert.equal(structure.typesAndInterfaces.length, 2);
  assert.equal(structure.typesAndInterfaces[0].name, 'LoginRequest');
  assert.equal(structure.typesAndInterfaces[1].name, 'AuthResponse');

  const { callees } = extractCallGraph(sampleCode, 'authenticateUser');
  assert.deepEqual(callees, ['generateToken']);

  const testPath = findRelatedTestPath('src/auth/service.ts', [
    'src/auth/service.test.ts',
    'src/user.ts',
  ]);
  assert.equal(testPath, 'src/auth/service.test.ts');

  // Test token budget context retrieval
  const retrieved = retrieveRelevantContext(
    {
      changedFilePath: 'src/auth/service.ts',
      changedLines: [16, 17], // Inside authenticateUser
      fileContent: sampleCode,
      allRepoFiles: [
        { path: 'src/auth/service.test.ts', content: "test('authenticateUser works', () => {});" },
      ],
      schemaFiles: [
        { path: 'schema.prisma', content: 'model User { id Int @id }' },
      ],
    },
    { tokenBudget: 1000 }
  );

  assert.ok(retrieved.sources.length >= 3);
  assert.ok(retrieved.summary.enclosingFunctionsCount >= 1);
  assert.ok(retrieved.summary.totalTokens < 1000);
  assert.ok(retrieved.promptSnippet.includes('<relevant_code_context>'));
  assert.ok(retrieved.promptSnippet.includes('authenticateUser'));
});

// ==========================================
// 2. TEST-AWARE REVIEW TESTS
// ==========================================
test('Test-Aware Review: identifies covered and untested changed functions, generating recommendations', () => {
  const code = `
export function sanitizeInput(val: string): string {
  return val.replace(/['"]/g, '');
}

export function deleteAccount(userId: string): void {
  db.execute("DELETE FROM users WHERE id = '" + userId + "'");
}
`;

  const result = analyzeTestAwareness({
    changedFilePath: 'src/account.ts',
    changedLines: [2, 3, 6, 7],
    fileContent: code,
    allRepoFiles: [
      {
        path: 'src/account.test.ts',
        content: `describe('account', () => { test('sanitizeInput strips quotes', () => {}); });`,
      },
    ],
    issues: [
      {
        file_path: 'src/account.ts',
        line_number: 7,
        severity: 'critical',
        category: 'security',
        message: 'SQL Injection in deleteAccount query',
      },
    ],
  });

  assert.equal(result.changedFunctions.length, 2);
  assert.deepEqual(result.coveredFunctions, ['sanitizeInput']);
  assert.deepEqual(result.untestedFunctions, ['deleteAccount']);
  assert.equal(result.hasTestCoverage, false);
  assert.equal(result.testRecommendations.length, 1);
  assert.equal(result.testRecommendations[0].functionName, 'deleteAccount');
  assert.ok(result.testRecommendations[0].suggestedTestCode.includes("test('deleteAccount"));
});

// ==========================================
// 3. SAFE PATCH VALIDATION TESTS
// ==========================================
test('Patch Validation: enforces safe paths and rejects broken/hallucinated patches', async () => {
  assert.equal(isPathSafe('src/user.ts'), true);
  assert.equal(isPathSafe('../etc/passwd'), false);
  assert.equal(isPathSafe('/etc/shadow'), false);
  assert.equal(isPathSafe('.git/config'), false);

  const fileContent = `const user = await db.query("SELECT * FROM users WHERE id = " + id);`;

  // Safe valid patch
  const validResult = await validateSuggestedPatch({
    filePath: 'src/db.ts',
    originalContent: fileContent,
    targetLineNumber: 1,
    suggestedFix: `const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);`,
  });
  assert.equal(validResult.isValid, true);
  assert.ok(validResult.patchedContent?.includes('$1'));

  // Invalid patch with ellipses
  const ellipseResult = await validateSuggestedPatch({
    filePath: 'src/db.ts',
    originalContent: fileContent,
    targetLineNumber: 1,
    suggestedFix: `const user = ...;`,
  });
  assert.equal(ellipseResult.isValid, false);
  assert.ok(ellipseResult.errors.some((e) => e.includes('ellipsis')));

  // Out of bounds line number
  const oobResult = await validateSuggestedPatch({
    filePath: 'src/db.ts',
    originalContent: fileContent,
    targetLineNumber: 999,
    suggestedFix: `const user = null;`,
  });
  assert.equal(oobResult.isValid, false);
});

// ==========================================
// 4. MULTI-MODEL DISAGREEMENT & ESCALATION
// ==========================================
test('Multi-Model Escalation: triggers REVIEW REQUIRED on uncorroborated critical security findings', async () => {
  const criticalIssue: ReviewIssue = {
    file_path: 'src/auth/jwt.ts',
    line_number: 10,
    severity: 'critical',
    category: 'security',
    message: 'Potential secret key exposure',
    confidence: 0.75, // Borderline confidence on security
  };

  const decision = shouldEscalateFinding(criticalIssue);
  assert.equal(decision.shouldEscalate, true);

  const escalated = await applyEscalationPolicy(criticalIssue, {
    chunkIndex: 0,
    totalChunks: 1,
    filePath: 'src/auth/jwt.ts',
    diff: '+ const key = "abc";',
    addedLines: [10],
    validLines: [10],
  });

  assert.equal(escalated.escalation_status, 'REVIEW_REQUIRED');
  assert.ok(escalated.message.includes('[REVIEW REQUIRED]'));
  assert.ok(escalated.supporting_evidence?.includes('Escalated under policy'));
});

// ==========================================
// 5. DETERMINISTIC DEPENDENCY SCANNING
// ==========================================
test('Dependency Scanning: detects known CVE vulnerabilities deterministically without LLM', () => {
  assert.equal(isVersionBelow('4.17.20', '4.17.21'), true);
  assert.equal(isVersionBelow('4.17.21', '4.17.21'), false);
  assert.equal(isVersionBelow('4.18.0', '4.17.21'), false);

  const packageJson = `{
  "name": "sample",
  "dependencies": {
    "lodash": "4.17.15",
    "axios": "^0.21.1",
    "express": "^4.19.2"
  }
}`;

  const deps = parseNpmManifest(packageJson);
  assert.equal(deps.length, 3);

  const findings = scanDependenciesForVulnerabilities({
    filePath: 'package.json',
    fileContent: packageJson,
  });

  assert.equal(findings.length, 2);
  const lodashFinding = findings.find((f) => f.message.includes('lodash'));
  assert.ok(lodashFinding);
  assert.equal(lodashFinding?.cwe, 'CWE-1321');
  assert.equal(lodashFinding?.owasp, 'A03:2021-Injection');
  assert.equal(lodashFinding?.severity, 'critical');
  assert.ok(lodashFinding?.attack_scenario?.includes('prototype pollution'));

  // Python requirements.txt
  const reqs = `requests==2.28.1\nurllib3==1.25.10\n`;
  const pythonFindings = scanDependenciesForVulnerabilities({
    filePath: 'requirements.txt',
    fileContent: reqs,
  });

  assert.equal(pythonFindings.length, 2);
  assert.ok(pythonFindings.some((f) => f.cwe === 'CWE-1333'));
});
