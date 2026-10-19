import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAndNormalizeCwe,
  validateAndNormalizeOwasp,
  inferValidatedTaxonomy,
  calibrateConfidence,
  calculateExplainableRisk,
  generateSarifReport,
  validateSarifLog,
  ReviewIssue,
} from './index.js';

test('validateAndNormalizeCwe validates known CWEs and rejects hallucinated IDs', () => {
  const sql = validateAndNormalizeCwe('CWE-89');
  assert.ok(sql);
  assert.equal(sql?.id, 'CWE-89');
  assert.equal(sql?.owasp, 'A03:2021-Injection');

  const ssrf = validateAndNormalizeCwe('cwe-918');
  assert.ok(ssrf);
  assert.equal(ssrf?.id, 'CWE-918');

  const numericOnly = validateAndNormalizeCwe('22');
  assert.ok(numericOnly);
  assert.equal(numericOnly?.id, 'CWE-22');

  // Refusal of hallucinated CWEs
  assert.equal(validateAndNormalizeCwe('CWE-999999'), null);
  assert.equal(validateAndNormalizeCwe('INVALID_ID'), null);
  assert.equal(validateAndNormalizeCwe(null), null);
});

test('validateAndNormalizeOwasp validates Top 10 categories and rejects arbitrary taxonomies', () => {
  assert.equal(
    validateAndNormalizeOwasp('A03:2021-Injection'),
    'A03:2021-Injection'
  );
  assert.equal(
    validateAndNormalizeOwasp('A01'),
    'A01:2021-Broken Access Control'
  );
  assert.equal(
    validateAndNormalizeOwasp('Server-Side Request Forgery'),
    'A10:2021-Server-Side Request Forgery'
  );
  assert.equal(validateAndNormalizeOwasp('Hacking-Category-123'), null);
});

test('inferValidatedTaxonomy maps security finding signals to controlled taxonomies', () => {
  const sqli = inferValidatedTaxonomy('Unsanitized query string concatenation', 'security', 'db.query("SELECT * FROM users WHERE id = " + id)');
  assert.equal(sqli.cwe, 'CWE-89');
  assert.equal(sqli.owasp, 'A03:2021-Injection');

  const ssrf = inferValidatedTaxonomy('Unchecked URL fetch to arbitrary cloud metadata IP', 'security', 'fetch(targetUrl)');
  assert.equal(ssrf.cwe, 'CWE-918');
  assert.equal(ssrf.owasp, 'A10:2021-Server-Side Request Forgery');

  const traversal = inferValidatedTaxonomy('Zip slip path traversal extracting file archive', 'security');
  assert.equal(traversal.cwe, 'CWE-22');
  assert.equal(traversal.owasp, 'A01:2021-Broken Access Control');
});

test('calibrateConfidence dampens overconfident LLMs and boosts corroborated findings', () => {
  // Case 1: Corroborated by static analyzer and anchored in AST
  const highConf = calibrateConfidence({
    rawConfidence: 0.85,
    staticAnalyzerAgreement: true,
    hasStructuralValidation: true,
    historicalFeedbackFixRate: 0.9,
    historicalFeedbackCount: 10,
  });
  assert.ok(highConf.calibratedConfidence >= 0.9);
  assert.ok(highConf.explanation.includes('corroboration boost'));
  assert.ok(highConf.explanation.includes('AST structural anchor'));

  // Case 2: Solo LLM with unanchored context penalty
  const lowConf = calibrateConfidence({
    rawConfidence: 0.99, // Model overconfident
    staticAnalyzerAgreement: false,
    hasStructuralValidation: false, // Penalty applied
    historicalFeedbackFixRate: 0.2, // Frequently dismissed
    historicalFeedbackCount: 10,
  });
  assert.ok(lowConf.calibratedConfidence < 0.75);
  assert.ok(lowConf.explanation.includes('penalty'));
});

test('calculateExplainableRisk prioritizes high-impact critical security flaws on sensitive files', () => {
  const highRisk = calculateExplainableRisk({
    severity: 'critical',
    category: 'security',
    calibratedConfidence: 0.95,
    filePath: 'src/auth/jwt-service.ts',
    linesChangedCount: 600,
    filesChangedCount: 25,
    hasTestCoverage: false,
  });

  assert.equal(highRisk.riskLevel, 'CRITICAL');
  assert.ok(highRisk.riskScore >= 80);
  assert.ok(highRisk.breakdown.fileCriticalityPoints === 15);
  assert.ok(highRisk.breakdown.testGapPoints === 5);
  assert.ok(highRisk.explanation.includes('CRITICAL'));

  const lowRisk = calculateExplainableRisk({
    severity: 'suggestion',
    category: 'style',
    calibratedConfidence: 0.6,
    filePath: 'docs/guide.md',
    linesChangedCount: 10,
    filesChangedCount: 1,
    hasTestCoverage: true,
  });

  assert.equal(lowRisk.riskLevel, 'LOW');
  assert.ok(lowRisk.riskScore < 40);
  assert.ok(lowRisk.breakdown.fileCriticalityPoints === 1);
});

test('generateSarifReport produces valid OASIS SARIF 2.1.0 output', () => {
  const issues: ReviewIssue[] = [
    {
      file_path: 'src/users.ts',
      line_number: 10,
      severity: 'critical',
      category: 'security',
      message: 'SQL Injection detected in query builder',
      cwe: 'CWE-89',
      owasp: 'A03:2021-Injection',
      impact: 'Allows arbitrary unauthorized database reads and writes',
      remediation: 'Use parameterized queries ($1, [id]) instead of string concatenation',
      confidence: 0.95,
      risk_score: 92,
    },
    {
      file_path: 'src/utils/math.ts',
      line_number: 25,
      severity: 'warning',
      category: 'bug',
      message: 'Possible off-by-one array index boundary condition',
      confidence: 0.8,
      risk_score: 55,
    },
  ];

  const sarif = generateSarifReport(issues);
  const validation = validateSarifLog(sarif);

  assert.equal(validation.isValid, true, `SARIF validation failed: ${validation.errors.join(', ')}`);
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs.length, 1);
  assert.equal(sarif.runs[0].results.length, 2);
  assert.equal(sarif.runs[0].results[0].ruleId, 'GS-CWE-89');
  assert.equal(sarif.runs[0].results[0].level, 'error');
  assert.equal(sarif.runs[0].results[1].level, 'warning');
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine, 10);
});
