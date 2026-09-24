import { runStaticAnalysis } from './analyzer.js';
import { DiffChunk } from '@ai-reviewer/shared';
import assert from 'node:assert';
import test from 'node:test';

test('detects hardcoded AWS key in TypeScript file', () => {
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
  assert.match(issues[0].message, /Hardcoded AWS Access Key/);
});

test('detects Python command injection with shell=True', () => {
  const chunk: DiffChunk = {
    filePath: 'backend/tasks.py',
    chunkIndex: 0,
    totalChunks: 1,
    diff: `@@ -10,3 +10,4 @@
 def run_backup(path):
+    subprocess.Popen(f"tar -czf backup.tar {path}", shell=True)
`,
    addedLines: [11],
    validLines: [10, 11],
  };

  const issues = runStaticAnalysis(chunk);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, 'critical');
  assert.match(issues[0].message, /Python Unsafe Shell Execution/);
});

test('detects Python SQL string formatting injection', () => {
  const chunk: DiffChunk = {
    filePath: 'app/database.py',
    chunkIndex: 0,
    totalChunks: 1,
    diff: `@@ -5,3 +5,4 @@
 def get_user(user_id):
+    cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
`,
    addedLines: [6],
    validLines: [5, 6],
  };

  const issues = runStaticAnalysis(chunk);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, 'critical');
  assert.match(issues[0].message, /Python SQL String Formatting/);
});

test('detects Python mutable default argument', () => {
  const chunk: DiffChunk = {
    filePath: 'app/helpers.py',
    chunkIndex: 0,
    totalChunks: 1,
    diff: `@@ -1,2 +1,3 @@
+def append_to_list(val, items=[]):
     items.append(val)
`,
    addedLines: [1],
    validLines: [1, 2],
  };

  const issues = runStaticAnalysis(chunk);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, 'warning');
  assert.match(issues[0].message, /Python Mutable Default Argument/);
});

test('detects NaN comparison bug in JavaScript/TypeScript', () => {
  const chunk: DiffChunk = {
    filePath: 'src/utils/math.ts',
    chunkIndex: 0,
    totalChunks: 1,
    diff: `@@ -10,3 +10,4 @@
 function checkValue(val: number) {
+  if (val === NaN) return false;
   return true;
 }`,
    addedLines: [11],
    validLines: [10, 11, 12],
  };

  const issues = runStaticAnalysis(chunk);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, 'critical');
  assert.match(issues[0].message, /Invalid NaN Comparison/);
});

test('detects blocking fs.readFileSync in Node.js server code', () => {
  const chunk: DiffChunk = {
    filePath: 'src/server/handler.ts',
    chunkIndex: 0,
    totalChunks: 1,
    diff: `@@ -20,3 +20,4 @@
 export function handleRequest(req, res) {
+  const data = fs.readFileSync("/etc/config.json");
   return res.send(data);
 }`,
    addedLines: [21],
    validLines: [20, 21, 22],
  };

  const issues = runStaticAnalysis(chunk);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, 'warning');
  assert.strictEqual(issues[0].category, 'performance');
  assert.match(issues[0].message, /Blocking Synchronous I\/O/);
});
