import { runStaticAnalysis, runRealStaticAnalysis } from './analyzer.js';
import { DiffChunk } from '@ai-reviewer/shared';
import assert from 'node:assert';
import test from 'node:test';

test('detects hardcoded AWS key in TypeScript file with suggested_fix null', () => {
  const chunk: DiffChunk = {
    filePath: 'src/config/aws.ts',
    chunkIndex: 0,
    totalChunks: 1,
    diff: `@@ -1,3 +1,5 @@
 import AWS from 'aws-sdk';
+const accessKey = "AKIAIOSFODNN7EXAMPLE";
 return accessKey;`,
    addedLines: [2],
    validLines: [1, 2, 3],
  };

  const issues = runStaticAnalysis(chunk);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, 'critical');
  assert.strictEqual(issues[0].category, 'security');
  assert.strictEqual(issues[0].suggested_fix, null);
  assert.match(issues[0].message, /Hardcoded AWS Access Key/);
});

test('detects private key header committed in plain text', () => {
  const chunk: DiffChunk = {
    filePath: 'backend/keys/server.key',
    chunkIndex: 0,
    totalChunks: 1,
    diff: `@@ -0,0 +1,2 @@
+-----BEGIN RSA PRIVATE KEY-----
+MIIEowIBAAKCAQEA...`,
    addedLines: [1, 2],
    validLines: [1, 2],
  };

  const issues = runStaticAnalysis(chunk);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, 'critical');
  assert.strictEqual(issues[0].suggested_fix, null);
  assert.match(issues[0].message, /Private Key Header/);
});

test('detects generic API secret key assignment', () => {
  const chunk: DiffChunk = {
    filePath: 'app/database.py',
    chunkIndex: 0,
    totalChunks: 1,
    diff: `@@ -5,3 +5,4 @@
 def setup():
+    api_key = "sk_test_mock-token-for-gitsentinel-scanner-99"
`,
    addedLines: [6],
    validLines: [5, 6],
  };

  const issues = runStaticAnalysis(chunk);
  assert.ok(issues.length >= 1);
  assert.strictEqual(issues[0].severity, 'critical');
  assert.strictEqual(issues[0].suggested_fix, null);
});

test('detects GitHub Personal Access Token', () => {
  const chunk: DiffChunk = {
    filePath: 'scripts/deploy.sh',
    chunkIndex: 0,
    totalChunks: 1,
    diff: `@@ -1,2 +1,3 @@
 #!/bin/bash
+GITHUB_TOKEN=ghp_123456789012345678901234567890123456
`,
    addedLines: [2],
    validLines: [1, 2],
  };

  const issues = runStaticAnalysis(chunk);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, 'critical');
  assert.strictEqual(issues[0].suggested_fix, null);
  assert.match(issues[0].message, /GitHub Personal Access Token/);
});

test('runRealStaticAnalysis handles empty or clean files cleanly without leaving temp dirs', async () => {
  const result = await runRealStaticAnalysis([
    {
      path: 'src/clean.ts',
      content: 'export const value = 42;\n',
    },
  ]);
  assert.ok(Array.isArray(result.issues));
  assert.strictEqual(result.issues.length, 0);
  assert.strictEqual(result.isPartial, false);
});

test('Item 18: ESLint runs with TS parser, JSX option, and eslint-plugin-security from local install', async () => {
  const tsxCode = `
    import React from 'react';
    export const Comp = ({ input }: { input: string }) => {
      eval(input);
      return <div className="danger">{input}</div>;
    };
  `;

  // Line 4 has eval(input)
  const validLinesMap = new Map<string, Set<number>>();
  validLinesMap.set('src/Comp.tsx', new Set([4, 5]));

  const result = await runRealStaticAnalysis(
    [
      {
        path: 'src/Comp.tsx',
        content: tsxCode,
      },
    ],
    { validLinesMap }
  );

  assert.ok(result.issues.length >= 1);
  const evalIssue = result.issues.find((i) => i.file_path === 'src/Comp.tsx' && i.line_number === 4);
  assert.ok(evalIssue, 'Must detect eval security vulnerability on line 4');
  assert.strictEqual(evalIssue.category, 'security');
  assert.strictEqual(evalIssue.severity, 'critical');
});

test('Item 18: ESLint filters static analysis results to ADDED lines only', async () => {
  const tsCode = `
    const oldVulnerability = eval(req.body.a); // line 2 (not added in diff)
    const safeLine = 42;                        // line 3 (added)
    const newVulnerability = eval(req.body.b); // line 4 (added in diff)
  `;

  // Only line 3 and line 4 are added in this PR diff
  const validLinesMap = new Map<string, Set<number>>();
  validLinesMap.set('src/service.ts', new Set([3, 4]));

  const result = await runRealStaticAnalysis(
    [
      {
        path: 'src/service.ts',
        content: tsCode,
      },
    ],
    { validLinesMap }
  );

  // Line 2 was NOT in added lines, so it must be filtered out
  const line2Issue = result.issues.find((i) => i.line_number === 2);
  assert.strictEqual(line2Issue, undefined, 'Issues on untouched lines must be filtered out');

  // Line 4 WAS in added lines, so it must be reported
  const line4Issue = result.issues.find((i) => i.line_number === 4);
  assert.ok(line4Issue, 'Issues on added lines must be reported');
});

test('Item 18: ESLint treats parse errors as "could not analyze this file" note, never as critical findings', async () => {
  const malformedCode = `
    const brokenSyntax = ;
  `;

  const result = await runRealStaticAnalysis([
    {
      path: 'src/malformed.ts',
      content: malformedCode,
    },
  ]);

  // Must NOT produce critical issues or any findings for parse errors
  assert.strictEqual(result.issues.length, 0);

  // Must produce a visible note in summaryNotes
  assert.ok(result.summaryNotes.length >= 1);
  const parseNote = result.summaryNotes.find((n) => n.includes('Could not analyze src/malformed.ts'));
  assert.ok(parseNote, 'Must record parse error as a note in the summary');
});

test('Item 18: Python files require Ruff and Bandit; missing tools mark review partial', async () => {
  const pythonFiles = [
    {
      path: 'backend/app.py',
      content: 'import os\nprint("hello")\n',
    },
  ];

  // Provide custom execFileFn where both ruff and bandit fail with ENOENT (missing)
  const mockExecMissing = async () => {
    const err: any = new Error('spawn ruff ENOENT');
    err.code = 'ENOENT';
    throw err;
  };

  const result = await runRealStaticAnalysis(pythonFiles, {
    execFileFn: mockExecMissing as any,
  });

  // Review must be marked partial because required tools are missing
  assert.strictEqual(result.isPartial, true);
  assert.ok(result.summaryNotes.some((n) => n.includes("tool 'ruff' is missing")));
  assert.ok(result.summaryNotes.some((n) => n.includes("tool 'bandit' is missing")));
});

test('Item 18: Calls Bandit as well as Ruff and filters findings to added lines', async () => {
  const pythonFiles = [
    {
      path: 'backend/server.py',
      content: 'import subprocess\nsubprocess.call("rm -rf /", shell=True)\n',
    },
  ];

  const validLinesMap = new Map<string, Set<number>>();
  validLinesMap.set('backend/server.py', new Set([2])); // line 2 is added

  // Mock exec function simulating installed Ruff and Bandit
  const mockExec = async (cmd: string, args: string[]) => {
    if (args.includes('--version')) {
      return { stdout: `${cmd} version 1.0.0` };
    }
    if (cmd === 'ruff') {
      return {
        stdout: JSON.stringify([
          {
            code: 'S602',
            message: '`subprocess` call with `shell=True` identified, security issue.',
            filename: args[args.length - 1],
            location: { row: 2, column: 1 },
          },
        ]),
      };
    }
    if (cmd === 'bandit') {
      return {
        stdout: JSON.stringify({
          errors: [],
          results: [
            {
              code: 'subprocess.call("rm -rf /", shell=True)',
              filename: args[args.length - 1],
              issue_confidence: 'HIGH',
              issue_severity: 'HIGH',
              issue_text: 'subprocess call with shell=True seems safe, but may be dangerous.',
              line_number: 2,
              test_id: 'B602',
              test_name: 'subprocess_popen_with_shell_equals_true',
            },
          ],
        }),
      };
    }
    return { stdout: '' };
  };

  const result = await runRealStaticAnalysis(pythonFiles, {
    validLinesMap,
    execFileFn: mockExec as any,
  });

  assert.strictEqual(result.isPartial, false);
  assert.ok(result.issues.some((i) => i.message.includes('Ruff S602') && i.line_number === 2));
  assert.ok(result.issues.some((i) => i.message.includes('Bandit B602') && i.line_number === 2));
});
