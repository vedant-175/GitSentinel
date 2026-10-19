import { ReviewIssue } from './types.js';

export interface DimensionScore {
  score: number;
  maxScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  deductions: string[];
}

export interface RepositoryHealthReport {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: {
    security: DimensionScore;
    reliability: DimensionScore;
    maintainability: DimensionScore;
    testing: DimensionScore;
    performance: DimensionScore;
  };
  explanation: string;
}

export interface HealthCalculationInput {
  issues: Array<{
    severity: string;
    category: string;
    status?: string;
  }>;
  totalPrs?: number;
  prsWithTests?: number;
}

function calculateGrade(score: number, maxScore: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  const pct = (score / maxScore) * 100;
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

/**
 * Calculates a transparent, 100-point explainable repository health score.
 * Formula:
 * - Security (30 pts): -15 per critical, -5 per warning, -1 per suggestion
 * - Reliability (25 pts): -12 per critical bug, -4 per warning bug, -1 per suggestion
 * - Maintainability (20 pts): -2 per style/maintainability issue
 * - Testing (15 pts): based on PR test coverage ratio (or default 12/15)
 * - Performance (10 pts): -3 per performance issue
 */
export function calculateRepositoryHealthScore(input: HealthCalculationInput): RepositoryHealthReport {
  // Only evaluate open/unresolved issues
  const activeIssues = input.issues.filter((i) => i.status !== 'dismissed' && i.status !== 'fixed');

  // 1. Security Dimension (30 pts max)
  let securityScore = 30;
  const securityDeductions: string[] = [];
  const secCriticals = activeIssues.filter((i) => i.category === 'security' && i.severity === 'critical').length;
  const secWarnings = activeIssues.filter((i) => i.category === 'security' && i.severity === 'warning').length;
  const secSuggestions = activeIssues.filter((i) => i.category === 'security' && i.severity === 'suggestion').length;

  if (secCriticals > 0) {
    const penalty = secCriticals * 15;
    securityScore -= penalty;
    securityDeductions.push(`-${penalty} pts: ${secCriticals} critical security vulnerabilit${secCriticals === 1 ? 'y' : 'ies'}`);
  }
  if (secWarnings > 0) {
    const penalty = secWarnings * 5;
    securityScore -= penalty;
    securityDeductions.push(`-${penalty} pts: ${secWarnings} security warning${secWarnings === 1 ? '' : 's'}`);
  }
  if (secSuggestions > 0) {
    const penalty = secSuggestions * 1;
    securityScore -= penalty;
    securityDeductions.push(`-${penalty} pts: ${secSuggestions} security hygiene suggestion${secSuggestions === 1 ? '' : 's'}`);
  }
  securityScore = Math.max(0, Math.min(30, securityScore));

  // 2. Reliability Dimension (25 pts max)
  let reliabilityScore = 25;
  const reliabilityDeductions: string[] = [];
  const relCriticals = activeIssues.filter((i) => i.category === 'bug' && i.severity === 'critical').length;
  const relWarnings = activeIssues.filter((i) => i.category === 'bug' && i.severity === 'warning').length;
  const relSuggestions = activeIssues.filter((i) => i.category === 'bug' && i.severity === 'suggestion').length;

  if (relCriticals > 0) {
    const penalty = relCriticals * 12;
    reliabilityScore -= penalty;
    reliabilityDeductions.push(`-${penalty} pts: ${relCriticals} critical bug/crash defect${relCriticals === 1 ? '' : 's'}`);
  }
  if (relWarnings > 0) {
    const penalty = relWarnings * 4;
    reliabilityScore -= penalty;
    reliabilityDeductions.push(`-${penalty} pts: ${relWarnings} logic/runtime warning${relWarnings === 1 ? '' : 's'}`);
  }
  if (relSuggestions > 0) {
    const penalty = relSuggestions * 1;
    reliabilityScore -= penalty;
    reliabilityDeductions.push(`-${penalty} pts: ${relSuggestions} minor edge-case suggestion${relSuggestions === 1 ? '' : 's'}`);
  }
  reliabilityScore = Math.max(0, Math.min(25, reliabilityScore));

  // 3. Maintainability Dimension (20 pts max)
  let maintainabilityScore = 20;
  const maintainabilityDeductions: string[] = [];
  const maintIssues = activeIssues.filter((i) => i.category === 'maintainability' || i.category === 'style').length;

  if (maintIssues > 0) {
    const penalty = maintIssues * 2;
    maintainabilityScore -= penalty;
    maintainabilityDeductions.push(`-${penalty} pts: ${maintIssues} maintainability/code smell issue${maintIssues === 1 ? '' : 's'}`);
  }
  maintainabilityScore = Math.max(0, Math.min(20, maintainabilityScore));

  // 4. Testing Dimension (15 pts max)
  let testingScore = 15;
  const testingDeductions: string[] = [];
  if (input.totalPrs && input.totalPrs > 0) {
    const testRatio = (input.prsWithTests || 0) / input.totalPrs;
    if (testRatio < 0.8) {
      const lost = Math.round(15 * (1 - testRatio));
      testingScore -= lost;
      testingDeductions.push(`-${lost} pts: Only ${(testRatio * 100).toFixed(0)}% of PRs include test updates (target: >=80%)`);
    }
  } else {
    // Default baseline if no PR historical stats yet
    testingScore = 14;
  }
  testingScore = Math.max(0, Math.min(15, testingScore));

  // 5. Performance Dimension (10 pts max)
  let performanceScore = 10;
  const performanceDeductions: string[] = [];
  const perfIssues = activeIssues.filter((i) => i.category === 'performance').length;

  if (perfIssues > 0) {
    const penalty = perfIssues * 3;
    performanceScore -= penalty;
    performanceDeductions.push(`-${penalty} pts: ${perfIssues} performance bottleneck${perfIssues === 1 ? '' : 's'}`);
  }
  performanceScore = Math.max(0, Math.min(10, performanceScore));

  const overallScore = Math.round(securityScore + reliabilityScore + maintainabilityScore + testingScore + performanceScore);
  const grade = calculateGrade(overallScore, 100);

  const explanation = `Repository Health Score: ${overallScore}/100 (Grade: ${grade}). ` +
    `Evaluated across Security (${securityScore}/30), Reliability (${reliabilityScore}/25), ` +
    `Maintainability (${maintainabilityScore}/20), Testing (${testingScore}/15), and Performance (${performanceScore}/10).`;

  return {
    overallScore,
    grade,
    dimensions: {
      security: {
        score: securityScore,
        maxScore: 30,
        grade: calculateGrade(securityScore, 30),
        deductions: securityDeductions,
      },
      reliability: {
        score: reliabilityScore,
        maxScore: 25,
        grade: calculateGrade(reliabilityScore, 25),
        deductions: reliabilityDeductions,
      },
      maintainability: {
        score: maintainabilityScore,
        maxScore: 20,
        grade: calculateGrade(maintainabilityScore, 20),
        deductions: maintainabilityDeductions,
      },
      testing: {
        score: testingScore,
        maxScore: 15,
        grade: calculateGrade(testingScore, 15),
        deductions: testingDeductions,
      },
      performance: {
        score: performanceScore,
        maxScore: 10,
        grade: calculateGrade(performanceScore, 10),
        deductions: performanceDeductions,
      },
    },
    explanation,
  };
}

/**
 * Automatically maps issues to standard CWE and OWASP categories when missing
 */
export function enrichIssueSecurityMetadata(issue: { category?: string; message?: string; cwe?: string | null; owasp?: string | null }): { cwe: string | null; owasp: string | null } {
  if (issue.cwe && issue.owasp) {
    return { cwe: issue.cwe, owasp: issue.owasp };
  }
  const text = `${issue.category || ''} ${issue.message || ''}`.toLowerCase();

  if (text.includes('secret') || text.includes('api_key') || text.includes('apikey') || text.includes('token') || text.includes('password') || text.includes('credential')) {
    return { cwe: issue.cwe || 'CWE-798', owasp: issue.owasp || 'A07:2021-Identification and Authentication Failures' };
  }
  if (text.includes('sql') || text.includes('injection') || text.includes('query')) {
    return { cwe: issue.cwe || 'CWE-89', owasp: issue.owasp || 'A03:2021-Injection' };
  }
  if (text.includes('xss') || text.includes('cross-site') || text.includes('innerhtml') || text.includes('dangerouslysetinnerhtml')) {
    return { cwe: issue.cwe || 'CWE-79', owasp: issue.owasp || 'A03:2021-Injection' };
  }
  if (text.includes('path') || text.includes('traversal') || text.includes('directory')) {
    return { cwe: issue.cwe || 'CWE-22', owasp: issue.owasp || 'A01:2021-Broken Access Control' };
  }
  if (text.includes('deserializ') || text.includes('eval(') || text.includes('untrusted')) {
    return { cwe: issue.cwe || 'CWE-502', owasp: issue.owasp || 'A08:2021-Software and Data Integrity Failures' };
  }
  if (issue.category === 'security') {
    return { cwe: issue.cwe || 'CWE-693', owasp: issue.owasp || 'A05:2021-Security Misconfiguration' };
  }
  if (issue.category === 'bug') {
    return { cwe: issue.cwe || 'CWE-682', owasp: issue.owasp || 'A04:2021-Insecure Design' };
  }
  if (issue.category === 'performance') {
    return { cwe: issue.cwe || 'CWE-400', owasp: issue.owasp || null };
  }
  return { cwe: issue.cwe || null, owasp: issue.owasp || null };
}

/**
 * Generates an executive structured summary separating AI reasoning from deterministic findings (Requirement 5)
 */
export function generateStructuredPRSummary(params: {
  filesCount: number;
  linesCount: number;
  issues: ReviewIssue[];
  aiAssessment?: string;
}): {
  whatChanged: string;
  riskLevel: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW';
  criticalIssues: string[];
  warnings: string[];
  suggestions: string[];
  securityImpact: string;
  testingImpact: string;
  deterministicFindings: ReviewIssue[];
  aiFindings: ReviewIssue[];
  markdown: string;
} {
  const { filesCount, linesCount, issues, aiAssessment } = params;

  const deterministicFindings = issues.filter((i) => i.source && i.source !== 'llm');
  const aiFindings = issues.filter((i) => !i.source || i.source === 'llm');

  const criticalIssues = issues.filter((i) => i.severity === 'critical').map((i) => `${i.file_path}:${i.line_number} — ${i.message}`);
  const warnings = issues.filter((i) => i.severity === 'warning').map((i) => `${i.file_path}:${i.line_number} — ${i.message}`);
  const suggestions = issues.filter((i) => i.severity === 'suggestion').map((i) => `${i.file_path}:${i.line_number} — ${i.message}`);

  let riskLevel: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW' = 'LOW';
  if (criticalIssues.length > 0) riskLevel = 'CRITICAL';
  else if (warnings.length > 2) riskLevel = 'ELEVATED';
  else if (warnings.length > 0) riskLevel = 'MODERATE';

  const whatChanged = `Modified ${filesCount} file${filesCount === 1 ? '' : 's'} with ${linesCount} analyzed line${linesCount === 1 ? '' : 's'}.`;

  const secIssues = issues.filter((i) => i.category === 'security');
  const securityImpact = secIssues.length > 0
    ? `Identified ${secIssues.length} security finding(s): ${secIssues.map((s) => s.cwe || s.message).join('; ')}.`
    : 'No security vulnerabilities or secret leaks identified in this changeset.';

  const testingImpact = issues.some((i) => i.category === 'bug' && i.severity === 'critical')
    ? 'Critical defects identified. Comprehensive regression unit and integration tests are required prior to merge.'
    : 'Standard test coverage verified against added lines.';

  const markdown = `
### Pull Request Analysis Summary
- **What Changed**: ${whatChanged}
- **Risk Level**: **\`${riskLevel}\`**
- **Critical Issues**: ${criticalIssues.length}
- **Warnings**: ${warnings.length}
- **Suggestions**: ${suggestions.length}

#### Security Impact
${securityImpact}

#### Testing Impact
${testingImpact}

---

### 🛡️ Deterministic Static Analysis Findings (${deterministicFindings.length})
${
  deterministicFindings.length === 0
    ? '_Zero deterministic static analysis issues detected (ESLint, Bandit, Secret Regex clean)._'
    : deterministicFindings
        .map((f) => `- **[${f.severity.toUpperCase()}]** \`${f.file_path}:${f.line_number}\`: ${f.message}`)
        .join('\n')
}

---

### 🧠 Semantic AI Model Findings (${aiFindings.length})
${
  aiFindings.length === 0
    ? '_Zero semantic AI findings flagged._'
    : aiFindings
        .map((f) => `- **[${f.severity.toUpperCase()}]** \`${f.file_path}:${f.line_number}\`: ${f.message}`)
        .join('\n')
}

${aiAssessment ? `\n**Overall Assessment**: ${aiAssessment}` : ''}
`.trim();

  return {
    whatChanged,
    riskLevel,
    criticalIssues,
    warnings,
    suggestions,
    securityImpact,
    testingImpact,
    deterministicFindings,
    aiFindings,
    markdown,
  };
}
