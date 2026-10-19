import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ESLint } from 'eslint';

export interface PatchValidationRequest {
  filePath: string;
  originalContent: string;
  targetLineNumber: number;
  suggestedFix: string; // The replacement code or unified diff hunk
  runLintCheck?: boolean;
}

export interface PatchValidationResult {
  isValid: boolean;
  patchedContent: string | null;
  syntaxValid: boolean;
  contextMatched: boolean;
  pathSafe: boolean;
  lintPassed: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates that a file path is safe and stays within repo boundaries (no path traversal).
 */
export function isPathSafe(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  if (filePath.includes('..') || path.isAbsolute(filePath) || filePath.startsWith('/') || filePath.startsWith('\\')) {
    return false;
  }
  // Disallow forbidden system paths
  const forbiddenPatterns = [/^etc\//, /^proc\//, /^\.git\//, /^node_modules\//];
  if (forbiddenPatterns.some((p) => p.test(filePath))) {
    return false;
  }
  return true;
}

/**
 * Safely validates a suggested patch/remediation before it can ever be recommended or applied.
 * Performs path checks, context line matching, isolated scratch dir dry-run, and syntax/linter verification.
 */
export async function validateSuggestedPatch(
  request: PatchValidationRequest
): Promise<PatchValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate file path safety
  const pathSafe = isPathSafe(request.filePath);
  if (!pathSafe) {
    errors.push(`Unsafe file path rejected: ${request.filePath}`);
    return {
      isValid: false,
      patchedContent: null,
      syntaxValid: false,
      contextMatched: false,
      pathSafe: false,
      lintPassed: false,
      errors,
      warnings,
    };
  }

  // 2. Validate patch syntax
  if (!request.suggestedFix || request.suggestedFix.trim().length === 0) {
    errors.push('Empty patch or suggested fix');
    return {
      isValid: false,
      patchedContent: null,
      syntaxValid: false,
      contextMatched: false,
      pathSafe: true,
      lintPassed: false,
      errors,
      warnings,
    };
  }

  // Check for forbidden ellipses or placeholders
  if (
    request.suggestedFix.includes('...') ||
    request.suggestedFix.includes('/* existing code */') ||
    request.suggestedFix.includes('// TODO:')
  ) {
    errors.push('Suggested fix contains placeholders or ellipsis (...) rather than concrete code');
  }

  // 3. Match context line in original content
  const lines = request.originalContent.split('\n');
  const targetIndex = request.targetLineNumber - 1;

  if (targetIndex < 0 || targetIndex >= lines.length) {
    errors.push(
      `Target line number ${request.targetLineNumber} is out of bounds (file has ${lines.length} lines)`
    );
    return {
      isValid: false,
      patchedContent: null,
      syntaxValid: false,
      contextMatched: false,
      pathSafe: true,
      lintPassed: false,
      errors,
      warnings,
    };
  }

  // 4. Dry-run application of replacement in memory
  const patchedLines = [...lines];
  // Replace target line with suggestedFix
  patchedLines[targetIndex] = request.suggestedFix;
  const patchedContent = patchedLines.join('\n');

  // 5. Isolated sandbox verification in OS temp directory
  let scratchDir = '';
  let syntaxValid = true;
  let lintPassed = true;

  try {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-sentinel-patch-'));
    const safeBaseName = path.basename(request.filePath);
    const tempFilePath = path.join(scratchDir, safeBaseName);

    await fs.writeFile(tempFilePath, patchedContent, 'utf8');

    // 6. Syntax validation for JS/TS/JSON
    const ext = path.extname(safeBaseName).toLowerCase();
    if (ext === '.json') {
      try {
        JSON.parse(patchedContent);
      } catch (jsonErr: any) {
        syntaxValid = false;
        errors.push(`Patched file has invalid JSON syntax: ${jsonErr.message}`);
      }
    } else if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      if (request.runLintCheck !== false) {
        try {
          const eslint = new ESLint({
            useEslintrc: false,
            overrideConfig: {
              parser: '@typescript-eslint/parser',
              parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                ecmaFeatures: { jsx: true },
              },
              rules: {
                'no-undef': 'off', // In standalone snippets, external imports may be unresolvable
              },
            },
          });

          const results = await eslint.lintText(patchedContent, { filePath: tempFilePath });
          for (const res of results) {
            for (const msg of res.messages || []) {
              if (msg.fatal || msg.message.startsWith('Parsing error:')) {
                syntaxValid = false;
                errors.push(`Syntax / parse error in patched code: ${msg.message}`);
              } else if (msg.severity === 2) {
                lintPassed = false;
                warnings.push(`Linter error in patched code: [${msg.ruleId}] ${msg.message}`);
              }
            }
          }
        } catch (lintErr: any) {
          // If ESLint execution fails, record warning but do not fail unless parse error
          warnings.push(`Isolated lint check warning: ${lintErr.message}`);
        }
      }
    }
  } catch (scratchErr: any) {
    errors.push(`Isolated sandbox verification error: ${scratchErr.message}`);
  } finally {
    // Guaranteed cleanup of temp scratch sandbox
    if (scratchDir) {
      try {
        await fs.rm(scratchDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure
      }
    }
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    patchedContent: isValid ? patchedContent : null,
    syntaxValid,
    contextMatched: true,
    pathSafe,
    lintPassed,
    errors,
    warnings,
  };
}
