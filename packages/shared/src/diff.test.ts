import { parseUnifiedDiff, chunkFileDiff, isFileIgnored, getAddedLines } from './diff.js';
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
  assert.deepStrictEqual(hunk.addedLineNumbers, [11, 12]);
});

test('chunkFileDiff splits hunks within token budget', () => {
  const files = parseUnifiedDiff(sampleDiff);
  const authFile = files[0];
  const chunks = chunkFileDiff(authFile, 500);
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].filePath, 'src/auth.ts');
  assert.deepStrictEqual(chunks[0].addedLines, [11, 12]);
});

test('isFileIgnored handles lockfiles and glob patterns with picomatch', () => {
  const customGlobs = ['*.custom', 'generated/**'];
  assert.strictEqual(isFileIgnored('package-lock.json', customGlobs), true);
  assert.strictEqual(isFileIgnored('yarn.lock', customGlobs), true);
  assert.strictEqual(isFileIgnored('dist/bundle.js', customGlobs), true);
  assert.strictEqual(isFileIgnored('file.custom', customGlobs), true);
  assert.strictEqual(isFileIgnored('generated/schema.ts', customGlobs), true);
  assert.strictEqual(isFileIgnored('src/index.ts', customGlobs), false);
});

test('Item 19: isFileIgnored handles all default ignore patterns across monorepo paths', () => {
  // **/dist/**
  assert.strictEqual(isFileIgnored('dist/bundle.js'), true);
  assert.strictEqual(isFileIgnored('packages/shared/dist/index.js'), true);
  assert.strictEqual(isFileIgnored('apps/web/dist/server/entry.js'), true);

  // **/build/**
  assert.strictEqual(isFileIgnored('build/main.js'), true);
  assert.strictEqual(isFileIgnored('apps/worker/build/index.js'), true);

  // **/.next/**
  assert.strictEqual(isFileIgnored('.next/static/chunks/main.js'), true);
  assert.strictEqual(isFileIgnored('apps/web/.next/server/pages/index.js'), true);

  // **/node_modules/**
  assert.strictEqual(isFileIgnored('node_modules/lodash/index.js'), true);
  assert.strictEqual(isFileIgnored('packages/db/node_modules/prisma/index.js'), true);

  // **/coverage/**
  assert.strictEqual(isFileIgnored('coverage/lcov.info'), true);
  assert.strictEqual(isFileIgnored('apps/web/coverage/clover.xml'), true);

  // **/*.lock
  assert.strictEqual(isFileIgnored('yarn.lock'), true);
  assert.strictEqual(isFileIgnored('sub/Cargo.lock'), true);
  assert.strictEqual(isFileIgnored('apps/worker/poetry.lock'), true);

  // **/package-lock.json
  assert.strictEqual(isFileIgnored('package-lock.json'), true);
  assert.strictEqual(isFileIgnored('apps/web/package-lock.json'), true);

  // **/pnpm-lock.yaml
  assert.strictEqual(isFileIgnored('pnpm-lock.yaml'), true);
  assert.strictEqual(isFileIgnored('packages/db/pnpm-lock.yaml'), true);

  // **/*.min.*
  assert.strictEqual(isFileIgnored('app.min.js'), true);
  assert.strictEqual(isFileIgnored('apps/web/public/vendor/bootstrap.min.css'), true);
  assert.strictEqual(isFileIgnored('packages/ui/dist/styles.min.css.map'), true);

  // **/*.generated.*
  assert.strictEqual(isFileIgnored('schema.generated.ts'), true);
  assert.strictEqual(isFileIgnored('packages/db/prisma/client.generated.js'), true);
  assert.strictEqual(isFileIgnored('apps/web/types/api.generated.d.ts'), true);

  // **/__snapshots__/**
  assert.strictEqual(isFileIgnored('__snapshots__/App.test.tsx.snap'), true);
  assert.strictEqual(isFileIgnored('apps/web/components/__snapshots__/button.snap'), true);

  // Legitimate source files should NOT be ignored
  assert.strictEqual(isFileIgnored('packages/shared/src/index.ts'), false);
  assert.strictEqual(isFileIgnored('apps/web/app/page.tsx'), false);
  assert.strictEqual(isFileIgnored('apps/worker/src/review/pipeline.ts'), false);
  assert.strictEqual(isFileIgnored('packages/db/prisma/schema.prisma'), false);
});

test('parseUnifiedDiff handles added lines like "+++x" and removed lines like "--- y"', () => {
  const trickyDiff = `diff --git a/calc.cpp b/calc.cpp
--- a/calc.cpp
+++ b/calc.cpp
@@ -5,4 +5,4 @@
 int x = 0;
---- y;
++++x;
 return x;
`;
  const files = parseUnifiedDiff(trickyDiff);
  assert.strictEqual(files.length, 1);
  const hunk = files[0].hunks[0];
  // 5: int x = 0; (context)
  // removed: --- y; (old line 6)
  // added: +++x; (new line 6)
  // 7: return x; (context)
  assert.deepStrictEqual(hunk.addedLineNumbers, [6]);
  assert.strictEqual(files[0].newPath, 'calc.cpp');

  const added = getAddedLines(trickyDiff);
  assert.strictEqual(added.length, 1);
  assert.strictEqual(added[0].lineNumber, 6);
  assert.strictEqual(added[0].content, '+++x;');
});

test('parseUnifiedDiff handles unicode and quoted paths', () => {
  const unicodeDiff = `diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"
--- "a/caf\\303\\251.ts"
+++ "b/caf\\303\\251.ts"
@@ -1,2 +1,3 @@
 export const name = "cafe";
+export const price = 4.5;
`;
  const files = parseUnifiedDiff(unicodeDiff);
  assert.strictEqual(files.length, 1);
  assert.strictEqual(files[0].newPath, 'café.ts');
  assert.strictEqual(files[0].oldPath, 'café.ts');
  assert.deepStrictEqual(files[0].hunks[0].addedLineNumbers, [2]);
});

test('parseUnifiedDiff handles hunks with a blank context line', () => {
  const blankContextDiff = `diff --git a/blank.ts b/blank.ts
--- a/blank.ts
+++ b/blank.ts
@@ -1,4 +1,5 @@
 const a = 1;

+const b = 2;
 return a + b;
`;
  const files = parseUnifiedDiff(blankContextDiff);
  assert.strictEqual(files.length, 1);
  const hunk = files[0].hunks[0];
  // Line 1: const a = 1;
  // Line 2: (blank context line)
  // Line 3: +const b = 2;
  // Line 4: return a + b;
  assert.deepStrictEqual(hunk.addedLineNumbers, [3]);
});

test('parseUnifiedDiff handles renames, binary files, and CRLF', () => {
  const multiDiff = `diff --git a/old-name.ts b/new-name.ts\r
similarity index 100%\r
rename from old-name.ts\r
rename to new-name.ts\r
diff --git a/logo.png b/logo.png\r
Binary files a/logo.png and b/logo.png differ\r
`;
  const files = parseUnifiedDiff(multiDiff);
  assert.strictEqual(files.length, 2);
  assert.strictEqual(files[0].oldPath, 'old-name.ts');
  assert.strictEqual(files[0].newPath, 'new-name.ts');
  assert.strictEqual(files[0].status, 'renamed');

  assert.strictEqual(files[1].newPath, 'logo.png');
  assert.strictEqual(files[1].isBinary, true);
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
        confidence: 0.95,
      },
    ],
    overall_assessment: 'Security risk flagged: hardcoded secret in auth module.',
  };

  const parsed = ReviewResultSchema.safeParse(validData);
  assert.strictEqual(parsed.success, true);
});
