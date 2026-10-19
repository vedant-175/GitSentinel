#!/usr/bin/env node
/**
 * GitSentinel Pre-Push Security Review Hook
 * Inspects unpushed commits / git diff before pushing to GitHub.
 * Halts git push if hardcoded secrets, weak PRNGs, or critical CWE vulnerabilities are detected.
 */

import { execSync } from 'child_process';
import { runStaticAnalysis } from '../apps/worker/src/staticAnalysis/analyzer.js';
import { DiffChunk } from '@ai-reviewer/shared';

function getGitDiff(): string {
  try {
    // 1. Try comparing against remote branch (e.g. origin/main or origin/master)
    return execSync('git diff @{upstream}..HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    try {
      // 2. Fallback to diff of last commit
      return execSync('git diff HEAD~1..HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      try {
        // 3. Fallback to staged files
        return execSync('git diff --cached', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      } catch {
        return '';
      }
    }
  }
}

function parseDiffToChunks(diffText: string): DiffChunk[] {
  if (!diffText || !diffText.trim()) return [];

  const chunks: DiffChunk[] = [];
  const fileSections = diffText.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split('\n');
    let filePath = '';
    const match = lines[0].match(/b\/(.+)$/);
    if (match) filePath = match[1];

    if (!filePath || filePath.includes('.system_generated') || filePath.includes('package-lock.json')) {
      continue;
    }

    const addedLines: number[] = [];
    let currentLine = 0;

    for (const l of lines) {
      const hunkMatch = l.match(/^@@ -\d+,\d+ \+(\d+),\d+ @@/);
      if (hunkMatch) {
        currentLine = parseInt(hunkMatch[1], 10);
        continue;
      }
      if (l.startsWith('+') && !l.startsWith('+++')) {
        addedLines.push(currentLine);
        currentLine++;
      } else if (!l.startsWith('-')) {
        currentLine++;
      }
    }

    chunks.push({
      filePath,
      diff: section,
      addedLines,
    });
  }

  return chunks;
}

async function main() {
  console.log('\n======================================================');
  console.log('🛡️  GITSENTINEL PRE-PUSH CODE SECURITY AUDIT');
  console.log('======================================================');
  console.log('Scanning unpushed commits and modified files before push...\n');

  const diffText = getGitDiff();
  const chunks = parseDiffToChunks(diffText);

  if (chunks.length === 0) {
    console.log('ℹ️  No unpushed modified code chunks detected to inspect.');
    console.log('✅  PASS: Clean working tree. Safe to push.\n');
    process.exit(0);
  }

  console.log(`📦 Inspecting ${chunks.length} modified file(s)...`);

  let allIssues: any[] = [];

  for (const chunk of chunks) {
    console.log(`   - Scanning: ${chunk.filePath} (${chunk.addedLines.length} added lines)`);
    try {
      // 1. Run deterministic secret scanner on added lines
      const secretIssues = runStaticAnalysis(chunk);
      if (secretIssues && secretIssues.length > 0) {
        allIssues.push(...secretIssues);
      }

      // 2. Scan for dangerous functions in Python / JS
      const addedText = chunk.diff
        .split('\n')
        .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
        .join('\n');

      if (chunk.filePath.endsWith('.py')) {
        if (addedText.includes('random.randint') || addedText.includes('random.choice')) {
          allIssues.push({
            file_path: chunk.filePath,
            line_number: chunk.addedLines[0] || 1,
            severity: 'critical',
            message: 'Insecure PRNG: Use of predictable `random` module for secrets/security logic',
            cwe: 'CWE-338',
            suggested_fix: '- random.randint(...)\n+ import secrets\n+ secrets.randbelow(...)',
          });
        }
      }

      if (/\.[jt]sx?$/.test(chunk.filePath)) {
        if (addedText.includes('eval(') || addedText.includes('innerHTML =')) {
          allIssues.push({
            file_path: chunk.filePath,
            line_number: chunk.addedLines[0] || 1,
            severity: 'critical',
            message: 'Dangerous runtime code execution or unescaped HTML injection',
            cwe: 'CWE-79 / CWE-95',
            suggested_fix: 'Remove eval() or use textContent/sanitized elements instead of innerHTML.',
          });
        }
      }
    } catch (err: any) {
      console.warn(`     ⚠️ Static analysis notice for ${chunk.filePath}: ${err.message}`);
    }
  }

  console.log('\n------------------------------------------------------');
  console.log(`AUDIT RESULT: ${allIssues.length} issues identified.`);
  console.log('------------------------------------------------------');

  const criticalOrHigh = allIssues.filter(
    (i) => i.severity === 'critical' || i.severity === 'high'
  );

  if (criticalOrHigh.length > 0) {
    console.error('\n❌ PRE-PUSH GATE: FAIL (PUSH BLOCKED)');
    console.error(`Found ${criticalOrHigh.length} critical/high security issues:\n`);

    criticalOrHigh.forEach((issue, idx) => {
      console.error(`  [${idx + 1}] ${issue.severity.toUpperCase()} in ${issue.file_path}:${issue.line_number}`);
      console.error(`      Message: ${issue.message}`);
      if (issue.cwe) console.error(`      CWE:     ${issue.cwe}`);
      if (issue.suggested_fix) {
        console.error(`      Fix:\n${issue.suggested_fix.split('\n').map((l: string) => `        ${l}`).join('\n')}`);
      }
      console.error('');
    });

    console.error('🚫 Git push halted by GitSentinel zero-trust gate.');
    console.error('💡 Fix the issues above or commit safe patches before pushing.\n');
    process.exit(1);
  }

  console.log('\n✅ PRE-PUSH GATE: PASS');
  console.log('Zero blocking vulnerabilities detected. Commit is approved for push!\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Pre-push review error:', err);
  process.exit(0); // Fail open on internal hook errors to not trap user
});
