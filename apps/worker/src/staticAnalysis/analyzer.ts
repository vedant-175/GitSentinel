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
  // --- Cross-Language Security Rules ---
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
    name: 'Generic API Secret Key Assignment',
    pattern: /(api_key|secret_key|client_secret|auth_token)\s*=\s*["'][A-Za-z0-9_\-]{16,}["']/i,
    category: 'security',
    severity: 'critical',
    message: 'Hardcoded secret or authentication token detected in source assignment.',
    suggestedFix: 'os.getenv("SECRET_KEY") or process.env.SECRET_KEY',
  },

  // --- Python Specific Rules ---
  {
    id: 'SEC-PY-001',
    name: 'Python Unsafe Shell Execution',
    pattern: /subprocess\.(Popen|run|call|check_output)\s*\(.*shell\s*=\s*True/i,
    category: 'security',
    severity: 'critical',
    message: 'Executing shell commands with shell=True is susceptible to command injection attacks.',
    suggestedFix: 'subprocess.run(["command", arg1, arg2], shell=False)',
    fileExtensions: ['.py'],
  },
  {
    id: 'SEC-PY-002',
    name: 'Insecure Pickle Deserialization',
    pattern: /\bpickle\.(loads|load)\s*\(/,
    category: 'security',
    severity: 'critical',
    message: 'Unpickling untrusted data is arbitrary code execution by design.',
    suggestedFix: 'Use safe serialization formats like json or safetensors.',
    fileExtensions: ['.py'],
  },
  {
    id: 'SEC-PY-003',
    name: 'Insecure PyYAML Load',
    pattern: /\byaml\.load\s*\([^,)]*\)/,
    category: 'security',
    severity: 'critical',
    message: 'yaml.load without Loader parameter is vulnerable to arbitrary code execution.',
    suggestedFix: 'yaml.safe_load(stream)',
    fileExtensions: ['.py'],
  },
  {
    id: 'SEC-PY-004',
    name: 'Python SQL String Formatting',
    pattern: /(execute|executemany)\s*\(\s*(f["']|["'].*%s.*%|.*\.format\()/i,
    category: 'security',
    severity: 'critical',
    message: 'SQL query constructed via string interpolation or formatting in execute(); susceptible to SQL injection.',
    suggestedFix: 'cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))',
    fileExtensions: ['.py'],
  },
  {
    id: 'BUG-PY-001',
    name: 'Python Mutable Default Argument',
    pattern: /def\s+\w+\s*\([^)]*=\s*(\[\]|\{\})/i,
    category: 'bug',
    severity: 'warning',
    message: 'Mutable default argument (list or dict) retains state across function calls, creating subtle state leaks.',
    suggestedFix: 'def fn(arg=None):\n    if arg is None:\n        arg = []',
    fileExtensions: ['.py'],
  },

  // --- JavaScript / TypeScript Specific Rules ---
  {
    id: 'SEC-JS-001',
    name: 'Dangerous React HTML Insertion',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/,
    category: 'security',
    severity: 'warning',
    message: 'dangerouslySetInnerHTML exposes the component to Cross-Site Scripting (XSS) if content is not sanitized with DOMPurify.',
    suggestedFix: 'dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}',
    fileExtensions: ['.tsx', '.jsx', '.js', '.ts'],
  },
  {
    id: 'SEC-JS-002',
    name: 'Insecure Eval Execution',
    pattern: /\beval\s*\(/,
    category: 'security',
    severity: 'critical',
    message: 'eval() executes arbitrary code strings and creates severe remote code execution vulnerabilities.',
    suggestedFix: 'Refactor to use JSON.parse() or structured object mapping.',
    fileExtensions: ['.js', '.ts', '.tsx', '.jsx'],
  },
  {
    id: 'BUG-JS-001',
    name: 'Invalid NaN Comparison',
    pattern: /(===?|!==?)\s*NaN\b|\bNaN\s*(===?|!==?)/,
    category: 'bug',
    severity: 'critical',
    message: 'Comparing value with NaN using equality operators always evaluates to false. Use Number.isNaN().',
    suggestedFix: 'Number.isNaN(value)',
    fileExtensions: ['.js', '.ts', '.tsx', '.jsx'],
  },
  {
    id: 'BUG-JS-002',
    name: 'Loose Equality Comparison',
    pattern: /[^!=]==[^=]/,
    category: 'bug',
    severity: 'suggestion',
    message: 'Use strict equality (===) instead of abstract equality (==) to prevent unexpected type coercion.',
    suggestedFix: '===',
    fileExtensions: ['.js', '.ts', '.tsx', '.jsx'],
  },
  {
    id: 'PERF-001',
    name: 'Blocking Synchronous I/O in Server Code',
    pattern: /\bfs\.(readFileSync|writeFileSync|appendFileSync)\s*\(/,
    category: 'performance',
    severity: 'warning',
    message: 'Synchronous file system operations block Node.js event loop threads, causing severe server latency spikes.',
    suggestedFix: 'await fs.promises.readFile(path)',
    fileExtensions: ['.js', '.ts'],
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
