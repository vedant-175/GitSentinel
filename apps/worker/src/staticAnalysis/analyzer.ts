import { DiffChunk, ReviewIssue } from '@ai-reviewer/shared';

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

export const STATIC_RULES: StaticAnalysisRule[] = [
  {
    id: 'SEC-001',
    name: 'Hardcoded AWS Access Key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    category: 'security',
    severity: 'critical',
    message: 'Potential AWS Access Key ID detected in source code. Credentials must never be committed to source control.',
    suggestedFix: 'process.env.AWS_ACCESS_KEY_ID',
  },
  {
    id: 'SEC-002',
    name: 'Private Key Header',
    pattern: /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/,
    category: 'security',
    severity: 'critical',
    message: 'Private encryption key header committed in plain text.',
    suggestedFix: 'Load certificates/keys from secure vault or environment secret manager.',
  },
  {
    id: 'SEC-003',
    name: 'Python Unsafe Shell Execution',
    pattern: /subprocess\.(Popen|run|call|check_output)\s*\(.*shell\s*=\s*True/i,
    category: 'security',
    severity: 'critical',
    message: 'Executing shell commands with shell=True is susceptible to command injection attacks.',
    suggestedFix: 'subprocess.run(["command", arg1, arg2], shell=False)',
    fileExtensions: ['.py'],
  },
  {
    id: 'SEC-004',
    name: 'Insecure Pickle Deserialization',
    pattern: /\bpickle\.(loads|load)\s*\(/,
    category: 'security',
    severity: 'critical',
    message: 'Unpickling untrusted data is arbitrary code execution by design.',
    suggestedFix: 'Use safe serialization formats like json or safetensors.',
    fileExtensions: ['.py'],
  },
  {
    id: 'SEC-005',
    name: 'Dangerous React HTML Insertion',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/,
    category: 'security',
    severity: 'warning',
    message: 'dangerouslySetInnerHTML exposes the component to Cross-Site Scripting (XSS) if content is not sanitized with DOMPurify.',
    suggestedFix: 'dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}',
    fileExtensions: ['.tsx', '.jsx', '.js', '.ts'],
  },
  {
    id: 'BUG-001',
    name: 'Leftover Debugger Statement',
    pattern: /\b(debugger;|breakpoint\(\)|import\s+pdb;\s*pdb\.set_trace\(\))/,
    category: 'bug',
    severity: 'warning',
    message: 'Debug breakpoint or debugger statement left in code.',
    suggestedFix: null,
  },
  {
    id: 'BUG-002',
    name: 'Loose Equality Comparison',
    pattern: /[^!=]==[^=]/,
    category: 'bug',
    severity: 'suggestion',
    message: 'Use strict equality (===) instead of abstract equality (==) to prevent unexpected type coercion.',
    fileExtensions: ['.js', '.ts', '.tsx', '.jsx'],
  },
];

/**
 * Runs fast deterministic static checks across changed diff lines
 */
export function runStaticAnalysis(chunk: DiffChunk): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const lines = chunk.diff.split('\n');
  const ext = '.' + chunk.filePath.split('.').pop();

  let currentNewLine = 0;

  for (const rawLine of lines) {
    if (rawLine.startsWith('@@')) {
      const match = rawLine.match(/\+(\d+)/);
      if (match) currentNewLine = parseInt(match[1], 10);
      continue;
    }

    if (!rawLine.startsWith('+') || rawLine.startsWith('+++')) {
      if (rawLine.startsWith(' ')) currentNewLine++;
      continue;
    }

    const lineNum = currentNewLine++;
    const code = rawLine.substring(1);

    for (const rule of STATIC_RULES) {
      if (rule.fileExtensions && !rule.fileExtensions.includes(ext)) {
        continue;
      }

      if (rule.pattern.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNum,
          severity: rule.severity,
          category: rule.category,
          message: `[${rule.name}] ${rule.message}`,
          suggested_fix: rule.suggestedFix || null,
          source: 'static_analysis',
        });
      }
    }
  }

  return issues;
}
