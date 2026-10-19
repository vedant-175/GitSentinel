import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DiffChunk, ReviewIssue, getAddedLines } from '@ai-reviewer/shared';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

export interface StaticAnalysisRule {
  id: string;
  name: string;
  pattern: RegExp;
  category: 'security' | 'bug' | 'style' | 'performance' | 'maintainability';
  severity: 'critical' | 'warning' | 'suggestion';
  message: string;
  suggestedFix?: string | null;
  fileExtensions?: string[];
}

/**
 * Regex rules are strictly reserved for secrets scanning (gitleaks-style)
 * with file-type filters. All suggested fixes are null (full-line replacement or null).
 */
export const SECRET_RULES: StaticAnalysisRule[] = [
  {
    id: 'SEC-001',
    name: 'Hardcoded AWS Access Key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    category: 'security',
    severity: 'critical',
    message: 'Potential AWS Access Key ID detected. Credentials must never be committed to source control.',
    suggestedFix: null,
  },
  {
    id: 'SEC-002',
    name: 'Private Key Header',
    pattern: /-----BEGIN (?:RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----/,
    category: 'security',
    severity: 'critical',
    message: 'Private cryptographic key header committed in plain text.',
    suggestedFix: null,
  },
  {
    id: 'SEC-003',
    name: 'Generic API Secret Key Assignment',
    pattern: /\b(?:api_key|secret_key|client_secret|auth_token|access_token|private_key)\s*[:=]\s*["'][A-Za-z0-9_.-]{16,}["']/i,
    category: 'security',
    severity: 'critical',
    message: 'Hardcoded secret or authentication token detected in source assignment.',
    suggestedFix: null,
  },
  {
    id: 'SEC-004',
    name: 'GitHub Personal Access Token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/,
    category: 'security',
    severity: 'critical',
    message: 'GitHub Personal Access Token or OAuth token detected.',
    suggestedFix: null,
  },
  {
    id: 'SEC-005',
    name: 'Slack Token',
    pattern: /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/,
    category: 'security',
    severity: 'critical',
    message: 'Slack API or bot token detected.',
    suggestedFix: null,
  },
  {
    id: 'SEC-006',
    name: 'Stripe API Key',
    pattern: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z_-]{20,}\b/,
    category: 'security',
    severity: 'critical',
    message: 'Stripe API secret key detected.',
    suggestedFix: null,
  },
];

/**
 * Runs deterministic secret scanning across changed diff lines using the shared getAddedLines implementation.
 */
export function runStaticAnalysis(chunk: DiffChunk): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const addedLines = getAddedLines(chunk.diff);
  const ext = '.' + chunk.filePath.split('.').pop();

  for (const { lineNumber, content } of addedLines) {
    for (const rule of SECRET_RULES) {
      if (rule.fileExtensions && !rule.fileExtensions.includes(ext)) {
        continue;
      }

      if (rule.pattern.test(content)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: rule.severity,
          category: rule.category,
          message: `[${rule.name}] ${rule.message}`,
          suggested_fix: null,
          source: 'static_analysis',
          confidence: 1.0,
        });
      }
    }
  }

  return issues;
}

// @ts-ignore
import { ESLint } from 'eslint';

export interface ChangedFilePayload {
  path: string;
  content: string;
}

export interface RealStaticAnalysisResult {
  issues: ReviewIssue[];
  summaryNotes: string[];
  isPartial: boolean;
}

export interface RealStaticAnalysisOptions {
  validLinesMap?: Map<string, Set<number>>;
  ruffCommand?: string;
  banditCommand?: string;
  execFileFn?: (
    file: string,
    args: string[],
    options: any
  ) => Promise<{ stdout: string; stderr?: string }>;
}

/**
 * Runs real static analysis tools (ESLint with @typescript-eslint/parser & eslint-plugin-security,
 * Ruff and Bandit for Python) in an isolated, secure manner.
 * Item 18:
 * - Runs ESLint from pinned local install, never npx
 * - Filters all results to ADDED lines
 * - Treats parse errors as "could not analyze this file" notes, never as critical findings
 * - Calls Bandit as well as Ruff for Python files
 * - If a tool is required but missing, marks the review partial
 */
export async function runRealStaticAnalysis(
  files: ChangedFilePayload[],
  options?: RealStaticAnalysisOptions
): Promise<RealStaticAnalysisResult> {
  const issues: ReviewIssue[] = [];
  const summaryNotes: string[] = [];
  let isPartial = false;

  if (files.length === 0) {
    return { issues, summaryNotes, isPartial };
  }

  const exec = options?.execFileFn || execFileAsync;
  const validLinesMap = options?.validLinesMap;

  // 1. Check for JS/TS files and run ESLint (Item 18)
  const jsTsFiles = files.filter((f) => /\.[jt]sx?$/.test(f.path));
  if (jsTsFiles.length > 0) {
    let eslint: any = null;
    try {
      eslint = new ESLint({
        useEslintrc: false,
        overrideConfig: {
          parser: '@typescript-eslint/parser',
          parserOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            ecmaFeatures: {
              jsx: true,
            },
          },
          plugins: ['security'],
          rules: {
            'security/detect-unsafe-regex': 'error',
            'security/detect-non-literal-regexp': 'warn',
            'security/detect-non-literal-require': 'warn',
            'security/detect-non-literal-fs-filename': 'warn',
            'security/detect-eval-with-expression': 'error',
            'security/detect-pseudoRandomBytes': 'warn',
            'security/detect-possible-timing-attacks': 'warn',
            'security/detect-no-csrf-before-method-override': 'warn',
            'security/detect-buffer-noassert': 'warn',
            'security/detect-child-process': 'warn',
            'security/detect-disable-mustache-escape': 'error',
            'security/detect-object-injection': 'warn',
            'security/detect-new-buffer': 'warn',
            'security/detect-bidi-characters': 'error',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-debugger': 'warn',
            'no-compare-neg-zero': 'error',
          },
        },
      });
    } catch (eslintInitErr) {
      summaryNotes.push(
        `Required static analysis tool 'eslint' failed to initialize: ${(eslintInitErr as Error).message}`
      );
      isPartial = true;
    }

    if (eslint) {
      for (const file of jsTsFiles) {
        try {
          const results = await eslint.lintText(file.content, { filePath: file.path });
          for (const res of results) {
            for (const msg of res.messages || []) {
              // Treat parse errors as "could not analyze this file" (a note in the summary), never as critical findings
              if (msg.fatal || !msg.ruleId || msg.message.startsWith('Parsing error:')) {
                summaryNotes.push(`Could not analyze ${file.path}: ${msg.message}`);
                continue;
              }

              const lineNum = msg.line || 1;

              // Filter results to ADDED lines
              if (validLinesMap) {
                const addedForFile = validLinesMap.get(file.path);
                if (addedForFile && !addedForFile.has(lineNum)) {
                  continue;
                }
              }

              const isSecurity = Boolean(
                msg.ruleId?.startsWith('security/') || msg.ruleId?.includes('eval')
              );

              issues.push({
                file_path: file.path,
                line_number: lineNum,
                severity: msg.severity === 2 ? 'critical' : 'warning',
                category: isSecurity ? 'security' : 'bug',
                message: `[ESLint ${msg.ruleId || 'rule'}] ${msg.message}`,
                suggested_fix: null,
                source: 'static_analysis',
                confidence: 0.95,
              });
            }
          }
        } catch (lintFileErr) {
          summaryNotes.push(
            `Could not analyze ${file.path}: ${(lintFileErr as Error).message}`
          );
        }
      }
    }
  }

  // 2. Check for Python files and run Ruff and Bandit (Item 18)
  const pyFiles = files.filter((f) => f.path.endsWith('.py') || f.path.endsWith('.pyw'));
  if (pyFiles.length > 0) {
    const ruffCmd = options?.ruffCommand || 'ruff';
    const banditCmd = options?.banditCommand || 'bandit';

    let ruffAvailable = false;
    let banditAvailable = false;

    try {
      await exec(ruffCmd, ['--version'], { timeout: 5000 });
      ruffAvailable = true;
    } catch {
      ruffAvailable = false;
    }

    if (!ruffAvailable) {
      summaryNotes.push(
        `Required static analysis tool 'ruff' is missing. Could not perform static analysis on Python files.`
      );
      isPartial = true;
    }

    try {
      await exec(banditCmd, ['--version'], { timeout: 5000 });
      banditAvailable = true;
    } catch {
      banditAvailable = false;
    }

    if (!banditAvailable) {
      summaryNotes.push(
        `Required static analysis tool 'bandit' is missing. Could not perform security analysis on Python files.`
      );
      isPartial = true;
    }

    // If either tool is available, write files to temp directory and execute
    if (ruffAvailable || banditAvailable) {
      let tempDir = '';
      try {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ai-review-python-'));
        for (const file of pyFiles) {
          if (
            file.path.includes('..') ||
            file.path.includes('\0') ||
            path.isAbsolute(file.path) ||
            file.path.startsWith('/') ||
            file.path.startsWith('\\')
          ) {
            throw new Error(`Security violation: Path traversal or invalid path detected: ${file.path}`);
          }
          const resolvedTemp = path.resolve(tempDir);
          const targetPath = path.resolve(tempDir, file.path);
          if (!targetPath.startsWith(resolvedTemp + path.sep) && targetPath !== resolvedTemp) {
            throw new Error(`Security violation: Path traversal detected in static analysis file path: ${file.path}`);
          }
          await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.promises.writeFile(targetPath, file.content, 'utf8');
        }

        // Run Ruff
        if (ruffAvailable) {
          try {
            const { stdout } = await exec(
              ruffCmd,
              ['check', '--output-format=json', ...pyFiles.map((f) => path.join(tempDir, f.path))],
              { cwd: tempDir, timeout: 20000, maxBuffer: 5 * 1024 * 1024, shell: false }
            ).catch((err: any) => ({ stdout: err.stdout || '' }));

            if (stdout && stdout.trim().startsWith('[')) {
              const results = JSON.parse(stdout);
              for (const item of results) {
                const relPath = path.relative(tempDir, item.filename).replace(/\\/g, '/');
                const line = item.location?.row || 1;

                // Treat parse errors as "could not analyze this file", never as critical findings
                if (item.code === 'E999' || item.message.toLowerCase().includes('syntax error')) {
                  summaryNotes.push(`Could not analyze ${relPath}: ${item.message}`);
                  continue;
                }

                // Filter to ADDED lines
                if (validLinesMap) {
                  const addedForFile = validLinesMap.get(relPath);
                  if (addedForFile && !addedForFile.has(line)) {
                    continue;
                  }
                }

                const isSecurity = Boolean(item.code?.startsWith('S'));
                issues.push({
                  file_path: relPath,
                  line_number: line,
                  severity: isSecurity ? 'critical' : 'warning',
                  category: isSecurity ? 'security' : 'bug',
                  message: `[Ruff ${item.code}] ${item.message}`,
                  suggested_fix: null,
                  source: 'static_analysis',
                  confidence: 0.95,
                });
              }
            }
          } catch (ruffErr) {
            summaryNotes.push(
              `Could not analyze Python files with Ruff: ${(ruffErr as Error).message}`
            );
            isPartial = true;
          }
        }

        // Run Bandit
        if (banditAvailable) {
          try {
            const { stdout } = await exec(
              banditCmd,
              ['-f', 'json', '-q', ...pyFiles.map((f) => path.join(tempDir, f.path))],
              { cwd: tempDir, timeout: 30000, maxBuffer: 5 * 1024 * 1024, shell: false }
            ).catch((err: any) => ({ stdout: err.stdout || '' }));

            if (stdout && stdout.trim().startsWith('{')) {
              const report = JSON.parse(stdout);

              // Treat parse errors in errors array as "could not analyze this file", never as critical findings
              if (Array.isArray(report.errors)) {
                for (const errItem of report.errors) {
                  const relPath = path.relative(tempDir, errItem.filename || '').replace(/\\/g, '/');
                  summaryNotes.push(`Could not analyze ${relPath}: ${errItem.reason || 'parse error'}`);
                }
              }

              if (Array.isArray(report.results)) {
                for (const res of report.results) {
                  const relPath = path.relative(tempDir, res.filename).replace(/\\/g, '/');
                  const line = res.line_number || 1;

                  // Filter to ADDED lines
                  if (validLinesMap) {
                    const addedForFile = validLinesMap.get(relPath);
                    if (addedForFile && !addedForFile.has(line)) {
                      continue;
                    }
                  }

                  const severity =
                    res.issue_severity === 'HIGH'
                      ? 'critical'
                      : res.issue_severity === 'MEDIUM'
                      ? 'warning'
                      : 'suggestion';

                  issues.push({
                    file_path: relPath,
                    line_number: line,
                    severity,
                    category: 'security',
                    message: `[Bandit ${res.test_id}: ${res.test_name}] ${res.issue_text}`,
                    suggested_fix: null,
                    source: 'static_analysis',
                    confidence: 0.95,
                  });
                }
              }
            }
          } catch (banditErr) {
            summaryNotes.push(
              `Could not analyze Python files with Bandit: ${(banditErr as Error).message}`
            );
            isPartial = true;
          }
        }
      } finally {
        if (tempDir) {
          try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
          } catch (cleanErr) {
            logger.warn({ temp_dir: tempDir, err: (cleanErr as Error).message, msg: 'Failed to clean up temp dir' });
          }
        }
      }
    }
  }

  return { issues, summaryNotes, isPartial };
}
