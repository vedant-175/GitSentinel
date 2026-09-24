import { parseUnifiedDiff, chunkFileDiff, isFileIgnored } from './diff.js';
import { ReviewResultSchema } from './schemas.js';
import assert from 'node:assert';
import test from 'node:test';

const sampleDiff = `diff --git a/src/auth.ts b/src/auth.ts
index 83db48f..bf269f4 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,8 @@ export function authenticate(user: string, pass: string) {
   if (!user) return false;
+  // Hardcoded secret key for testing
+  const secret = "SUPER_SECRET_KEY_123";
   return pass === "admin";
 }
diff --git a/package-lock.json b/package-lock.json
new file mode 100644
index 0000000..f5c8d32
--- /dev/null
+++ b/package-lock.json
@@ -0,0 +1,5 @@
+{
+  "name": "project",
+  "lockfileVersion": 3
+}
`;

test('parseUnifiedDiff parses multiple files correctly', () => {
  const files = parseUnifiedDiff(sampleDiff);
  assert.strictEqual(files.length, 2);
  assert.strictEqual(files[0].newPath, 'src/auth.ts');
  assert.strictEqual(files[1].newPath, 'package-lock.json');
  assert.strictEqual(files[1].status, 'added');
});

test('parseUnifiedDiff accurately calculates added line numbers', () => {
  const files = parseUnifiedDiff(sampleDiff);
  const authFile = files[0];
  assert.strictEqual(authFile.hunks.length, 1);
  const hunk = authFile.hunks[0];
  // The hunk starts at new line 10.
  // Line 10 is '  if (!user) return false;' (context)
  // Line 11 is '+  // Hardcoded secret key for testing' (added)
  // Line 12 is '+  const secret = "SUPER_SECRET_KEY_123";' (added)
  // Line 13 is '  return pass === "admin";' (context)
  assert.deepStrictEqual(hunk.addedLineNumbers, [11, 12]);
});

test('chunkFileDiff splits hunks within maximum line limit', () => {
  const files = parseUnifiedDiff(sampleDiff);
  const authFile = files[0];
  const chunks = chunkFileDiff(authFile, 50);
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].filePath, 'src/auth.ts');
  assert.deepStrictEqual(chunks[0].addedLines, [11, 12]);
});

test('isFileIgnored handles lockfiles and glob patterns', () => {
  const ignoredGlobs = ['*.lock', 'package-lock.json', 'dist/**'];
  assert.strictEqual(isFileIgnored('package-lock.json', ignoredGlobs), true);
  assert.strictEqual(isFileIgnored('yarn.lock', ignoredGlobs), true);
  assert.strictEqual(isFileIgnored('dist/bundle.js', ignoredGlobs), true);
  assert.strictEqual(isFileIgnored('src/index.ts', ignoredGlobs), false);
});

test('ReviewResultSchema validates structured LLM response correctly', () => {
  const validData = {
    issues: [
      {
        file_path: 'src/auth.ts',
        line_number: 12,
        severity: 'critical',
        category: 'security',
        message: 'Hardcoded secret found in source code.',
        suggested_fix: 'const secret = process.env.AUTH_SECRET;',
      },
    ],
    overall_assessment: 'Security risk flagged: hardcoded secret in auth module.',
  };

  const parsed = ReviewResultSchema.safeParse(validData);
  assert.strictEqual(parsed.success, true);
});
