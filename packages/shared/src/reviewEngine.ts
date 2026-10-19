import {
  ReviewIssue,
  Severity,
  Category,
  CertaintyLevel,
  TraceablePath,
  RepoConfig,
} from './types.js';
import { ReviewIssueSchema } from './schemas.js';
import {
  validateAndNormalizeCwe,
  validateAndNormalizeOwasp,
  inferValidatedTaxonomy,
} from './taxonomies.js';
import { calculateIssueFingerprint } from './fingerprint.js';

// =========================================================================
// 1. Line Range & Anchoring Validation
// =========================================================================

export interface LineValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validates that an issue is strictly anchored to changed lines in the diff.
 * Rejects findings that attempt to flag unchanged or pre-existing code.
 */
export function validateLineRange(
  issue: ReviewIssue,
  validAddedLines: number[],
  allValidLines?: number[]
): LineValidationResult {
  if (!issue.line_number || issue.line_number <= 0) {
    return { isValid: false, reason: 'Invalid or non-positive line number' };
  }

  // Ensure line is within PR's added/modified lines
  if (validAddedLines.length > 0 && !validAddedLines.includes(issue.line_number)) {
    if (allValidLines && !allValidLines.includes(issue.line_number)) {
      return {
        isValid: false,
        reason: `Line ${issue.line_number} is completely outside diff hunks (unrelated to changed code).`,
      };
    }
    return {
      isValid: false,
      reason: `Line ${issue.line_number} is not an added or modified line in this pull request.`,
    };
  }

  return { isValid: true };
}

// =========================================================================
// 2. Evidence Integrity & Hallucination Prevention
// =========================================================================

export interface EvidenceValidationResult {
  isValid: boolean;
  reason?: string;
  normalizedEvidence?: string;
}

const COMMON_SYNTAX_WORDS = new Set([
  'const',
  'let',
  'var',
  'req',
  'res',
  'return',
  'function',
  'import',
  'from',
  'this',
  'that',
  'with',
  'async',
  'await',
  'true',
  'false',
  'null',
]);

/**
 * Validates that the finding is backed by concrete, non-hallucinated code evidence.
 * Verifies that the quoted snippet or affected code actually exists in the target line/hunk.
 */
export function validateEvidenceIntegrity(
  issue: ReviewIssue,
  lineContent?: string,
  surroundingLines?: string[]
): EvidenceValidationResult {
  const snippets = [issue.affected_code, issue.evidence, issue.current_code]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  const targetContent = (lineContent || '').trim();

  // Rule 13: Never claim a vulnerability without code evidence.
  if (snippets.length === 0 && !targetContent) {
    return {
      isValid: false,
      reason: 'No code evidence provided; claiming a vulnerability without code evidence is strictly prohibited.',
    };
  }

  // If no snippets were provided but target line exists, use target line as valid evidence
  if (snippets.length === 0 && targetContent) {
    return {
      isValid: true,
      normalizedEvidence: `Line ${issue.line_number}: ${targetContent}`,
    };
  }

  // Rule 12: Never fabricate evidence.
  // Check if at least ONE of the provided code snippets matches the diff line/hunk
  if (targetContent && snippets.length > 0) {
    const normTarget = targetContent.replace(/\s+/g, ' ').toLowerCase();

    const anySnippetMatches = snippets.some((snippet) => {
      const normSnippet = snippet.replace(/\s+/g, ' ').toLowerCase();

      // Direct substring match
      if (normTarget.includes(normSnippet)) return true;
      if (normSnippet.includes(normTarget) && normTarget.length >= 10) return true;
      if (surroundingLines?.some((l) => l.replace(/\s+/g, ' ').toLowerCase().includes(normSnippet))) {
        return true;
      }

      // Token overlap
      const meaningfulTokens = (normSnippet.match(/[a-z0-9_]{3,}/g) || []).filter(
        (t) => !COMMON_SYNTAX_WORDS.has(t)
      );
      const matchedTokens = meaningfulTokens.filter((t) => normTarget.includes(t));
      const overlapRatio =
        meaningfulTokens.length > 0 ? matchedTokens.length / meaningfulTokens.length : 0;

      return overlapRatio >= 0.5;
    });

    if (!anySnippetMatches) {
      return {
        isValid: false,
        reason: `Fabricated code evidence detected: evidence "${snippets[0].slice(0, 60)}" does not appear in line ${issue.line_number} ("${targetContent.slice(0, 60)}").`,
      };
    }
  }

  const primaryEvidence = snippets[0] || (targetContent ? `Line ${issue.line_number}: ${targetContent}` : '');
  return {
    isValid: true,
    normalizedEvidence: primaryEvidence,
  };
}

// =========================================================================
// 3. Style Nitpick Detection
// =========================================================================

const STYLE_NITPICK_PATTERNS = [
  /prefer (single|double) quotes/i,
  /quote style/i,
  /naming convention/i,
  /consider renaming/i,
  /variable name should/i,
  /trailing (space|whitespace|comma)/i,
  /indentation/i,
  /inconsistent formatting/i,
  /missing semicolon/i,
  /add (a )?blank line/i,
  /remove (the )?extra newline/i,
  /code formatting/i,
  /prettier/i,
  /eslint formatting/i,
  /unnecessary parentheses/i,
];

/**
 * Checks if a finding is a cosmetic style nitpick rather than a security, correctness, or performance issue.
 */
export function isStyleNitpick(issue: ReviewIssue): boolean {
  if (issue.category === 'style') return true;
  const text = `${issue.message} ${issue.suggested_fix || ''}`.toLowerCase();
  return STYLE_NITPICK_PATTERNS.some((pat) => pat.test(text));
}

// =========================================================================
// 4. Severity Calibration
// =========================================================================

/**
 * Calibrates finding severity based on objective vulnerability impact and failure blast radius.
 */
export function calibrateSeverity(
  category: Category,
  message: string,
  cwe?: string | null,
  code?: string
): Severity {
  const text = `${message} ${cwe || ''} ${code || ''}`.toLowerCase();

  // Critical Security Vulnerabilities
  if (
    category === 'security' &&
    (text.includes('sql') ||
      text.includes('injection') ||
      text.includes('rce') ||
      text.includes('remote code') ||
      text.includes('eval(') ||
      text.includes('exec(') ||
      text.includes('ssrf') ||
      text.includes('secret') ||
      text.includes('credential') ||
      text.includes('api_key') ||
      text.includes('password') ||
      text.includes('private key') ||
      text.includes('token') ||
      text.includes('path traversal') ||
      text.includes('prototype pollution') ||
      text.includes('auth bypass') ||
      text.includes('jwt') ||
      text.includes('cwe-89') ||
      text.includes('cwe-78') ||
      text.includes('cwe-94') ||
      text.includes('cwe-798') ||
      text.includes('cwe-918') ||
      text.includes('cwe-22') ||
      text.includes('cwe-1321'))
  ) {
    return 'critical';
  }

  // Critical Bugs / Data Corruption / System Crash
  if (
    category === 'bug' &&
    (text.includes('data corruption') ||
      text.includes('infinite loop') ||
      text.includes('deadlock') ||
      text.includes('fatal crash') ||
      text.includes('corrupt'))
  ) {
    return 'critical';
  }

  // Warnings: Standard bugs, null safety, resource leaks, ReDoS, N+1 performance
  if (category === 'bug' || category === 'security' || category === 'performance') {
    if (
      text.includes('null') ||
      text.includes('undefined') ||
      text.includes('typeerror') ||
      text.includes('unhandled promise') ||
      text.includes('race condition') ||
      text.includes('leak') ||
      text.includes('off-by-one') ||
      text.includes('n+1') ||
      text.includes('redos') ||
      text.includes('complexity') ||
      text.includes('unindexed') ||
      text.includes('performance')
    ) {
      return 'warning';
    }
  }

  if (category === 'maintainability' || category === 'style') {
    return 'suggestion';
  }

  return 'warning';
}

// =========================================================================
// 5. Confidence Calibration & Certainty Distinction
// =========================================================================

export interface CalibratedConfidenceResult {
  calibratedConfidence: number;
  certainty: CertaintyLevel;
  explanation: string;
  passesThreshold: boolean;
}

const SPECULATIVE_PATTERNS = [
  /might possibly/i,
  /could theoretically/i,
  /in rare edge cases/i,
  /under some circumstances/i,
  /not sure if/i,
  /perhaps/i,
  /potential speculation/i,
  /could maybe/i,
];

/**
 * Calibrates confidence and distinguishes certainty ('confirmed' vs 'probable' vs 'speculative').
 */
export function calibrateConfidenceAndCertainty(
  issue: ReviewIssue,
  staticCorroboration: boolean,
  isAnchored: boolean,
  threshold: number = 0.75
): CalibratedConfidenceResult {
  const raw = Math.min(1.0, Math.max(0.1, issue.confidence ?? 0.85));
  const isSpeculative = SPECULATIVE_PATTERNS.some((p) => p.test(issue.message));

  // Balanced empirical scoring
  const baseScore = raw * 0.60;
  const staticBonus = staticCorroboration
    ? 0.25
    : issue.source === 'static_analysis' || issue.source === 'regex'
      ? 0.25
      : 0.05;
  const anchorBonus = isAnchored ? 0.15 : -0.25;
  const speculationAdjustment = isSpeculative ? -0.30 : 0.05;

  const total = Math.min(
    1.0,
    Math.max(0.05, baseScore + staticBonus + anchorBonus + speculationAdjustment)
  );
  const calibrated = Math.round(total * 1000) / 1000;

  let certainty: CertaintyLevel = 'probable';
  if (
    staticCorroboration ||
    issue.source === 'static_analysis' ||
    issue.source === 'regex' ||
    calibrated >= 0.95
  ) {
    certainty = 'confirmed';
  } else if (isSpeculative || calibrated < 0.70) {
    certainty = 'speculative';
  }

  return {
    calibratedConfidence: calibrated,
    certainty,
    explanation: `Base: ${(baseScore).toFixed(2)}, StaticBonus: ${staticBonus.toFixed(2)}, Anchor: ${anchorBonus.toFixed(2)}, SpecAdjustment: ${speculationAdjustment.toFixed(2)}`,
    passesThreshold: calibrated >= threshold,
  };
}

// =========================================================================
// 6. Traceable Path Construction
// =========================================================================

/**
 * Constructs the end-to-end traceable path for a finding:
 * diff → evidence → reasoning → classification → severity → remediation.
 */
export function buildTraceablePath(
  issue: ReviewIssue,
  lineContent: string
): TraceablePath {
  return {
    diff: {
      filePath: issue.file_path,
      lineNumber: issue.line_number,
      codeSnippet: lineContent,
    },
    evidence:
      issue.evidence ||
      issue.affected_code ||
      (lineContent ? `Line ${issue.line_number}: ${lineContent.trim()}` : issue.message),
    reasoning:
      issue.reasoning ||
      issue.impact ||
      issue.attack_scenario ||
      issue.message,
    classification: {
      category: issue.category,
      cwe: issue.cwe,
      owasp: issue.owasp,
    },
    severity: issue.severity,
    remediation: {
      guidance:
        issue.remediation ||
        (issue.suggested_fix ? 'Apply recommended replacement code.' : `Resolve issue at line ${issue.line_number}.`),
      suggestedFix: issue.suggested_fix || null,
    },
  };
}

// =========================================================================
// 7. Duplicate Detection & Finding Deduplication
// =========================================================================

export interface DeduplicationStats {
  totalEvaluated: number;
  duplicatesRemoved: number;
  duplicateFindingRate: number;
}

export interface DeduplicationResult {
  deduplicated: ReviewIssue[];
  stats: DeduplicationStats;
}

/**
 * Detects both exact fingerprint duplicates and proximity/semantic duplicates within a ±2 line window.
 * Reconciles duplicates by preserving the higher-severity, higher-confidence finding.
 */
export function detectAndDeduplicateFindings(issues: ReviewIssue[]): DeduplicationResult {
  const totalEvaluated = issues.length;
  if (totalEvaluated <= 1) {
    return {
      deduplicated: issues,
      stats: { totalEvaluated, duplicatesRemoved: 0, duplicateFindingRate: 0 },
    };
  }

  const seenFingerprints = new Set<string>();
  const kept: ReviewIssue[] = [];
  let duplicatesRemoved = 0;

  const SEV_WEIGHT: Record<Severity, number> = { critical: 3, warning: 2, suggestion: 1 };
  const sorted = [...issues].sort((a, b) => {
    const sevDiff = SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity];
    if (sevDiff !== 0) return sevDiff;
    return (b.calibrated_confidence ?? b.confidence ?? 0) - (a.calibrated_confidence ?? a.confidence ?? 0);
  });

  for (const candidate of sorted) {
    const fp =
      candidate.fingerprint ||
      calculateIssueFingerprint({
        filePath: candidate.file_path,
        lineNumber: candidate.line_number,
        category: candidate.category,
        cwe: candidate.cwe,
        message: candidate.message,
      });

    // 1. Exact fingerprint duplicate
    if (seenFingerprints.has(fp)) {
      duplicatesRemoved++;
      continue;
    }

    // 2. Proximity duplicate check (same file, line window <= 2, same CWE or similar message)
    const existingMatch = kept.find((existing) => {
      if (existing.file_path !== candidate.file_path) return false;
      const lineDiff = Math.abs(existing.line_number - candidate.line_number);
      if (lineDiff <= 2) {
        if (existing.cwe && candidate.cwe && existing.cwe === candidate.cwe) return true;
        if (existing.category === candidate.category) {
          const wordsA = new Set(existing.message.toLowerCase().split(/\s+/));
          const wordsB = new Set(candidate.message.toLowerCase().split(/\s+/));
          const common = [...wordsA].filter((w) => wordsB.has(w) && w.length > 3);
          if (common.length >= 2) return true;
        }
      }
      return false;
    });

    if (existingMatch) {
      duplicatesRemoved++;
      // Check if one finding is static and the other is LLM/hybrid -> Corroborate into Hybrid!
      const isOneStatic =
        existingMatch.source === 'static_analysis' ||
        existingMatch.source === 'regex' ||
        candidate.source === 'static_analysis' ||
        candidate.source === 'regex';
      const isOneLlmOrHybrid =
        existingMatch.source === 'llm' ||
        existingMatch.source === 'hybrid' ||
        candidate.source === 'llm' ||
        candidate.source === 'hybrid';

      if (isOneStatic && isOneLlmOrHybrid) {
        existingMatch.source = 'hybrid';
        existingMatch.certainty = 'confirmed';
        existingMatch.confidence = 1.0;
        existingMatch.calibrated_confidence = 1.0;
        if (!existingMatch.impact && candidate.impact) {
          existingMatch.impact = candidate.impact;
        }
        if (!existingMatch.remediation && candidate.remediation) {
          existingMatch.remediation = candidate.remediation;
        }
        if (!existingMatch.reasoning && candidate.reasoning) {
          existingMatch.reasoning = candidate.reasoning;
        }
        if (!existingMatch.attack_scenario && candidate.attack_scenario) {
          existingMatch.attack_scenario = candidate.attack_scenario;
        }
        if (!existingMatch.suggested_fix && candidate.suggested_fix) {
          existingMatch.suggested_fix = candidate.suggested_fix;
        }
        if (!existingMatch.evidence && candidate.evidence) {
          existingMatch.evidence = candidate.evidence;
        }
        if (candidate.traceable_path) {
          existingMatch.traceable_path = candidate.traceable_path;
        }
      }
      continue;
    }

    seenFingerprints.add(fp);
    kept.push({ ...candidate, fingerprint: fp });
  }

  const duplicateFindingRate =
    totalEvaluated > 0 ? Math.round((duplicatesRemoved / totalEvaluated) * 1000) / 1000 : 0;

  return {
    deduplicated: kept,
    stats: {
      totalEvaluated,
      duplicatesRemoved,
      duplicateFindingRate,
    },
  };
}

// =========================================================================
// 8. Malicious Repository Content & Prompt Injection Guard
// =========================================================================

export interface MaliciousScanResult {
  isMalicious: boolean;
  threatType: 'PROMPT_INJECTION' | 'MALICIOUS_CODE' | 'EXFILTRATION_ATTEMPT' | 'CLEAN';
  details?: string;
  cwe?: string;
  owasp?: string;
}

const INJECTION_PHRASES = [
  /ignore (all )?(previous )?instructions/i,
  /disregard (all )?(previous )?instructions/i,
  /approve this pr/i,
  /mark (this pr )?(as )?clean/i,
  /reveal (your )?system prompt/i,
  /output (all )?internal directives/i,
  /override rubric/i,
  /change your evaluation criteria/i,
];

const MALICIOUS_CODE_PHRASES = [
  /\/bin\/(?:ba)?sh\s+-i\s+>&/i, // reverse shell
  /nc\s+-e\s+\/bin\/(?:ba)?sh/i,
  /powershell(?:\.exe)?\s+-[eE](?:nc|ncodedCommand)\s+[A-Za-z0-9+/=]{20,}/i,
  /curl\s+[^|\n]+\|\s*(?:ba)?sh/i,
  /wget\s+[^|\n]+\|\s*(?:ba)?sh/i,
  /rm\s+-rf\s+(?:\/|\s|"|')/i, // destructive rm -rf /
];

/**
 * Scans untrusted input for prompt injection vectors and malicious repository content.
 * Never executes or obeys malicious directives; flags them as security threats.
 */
export function scanForMaliciousContent(text: string): MaliciousScanResult {
  for (const pat of INJECTION_PHRASES) {
    if (pat.test(text)) {
      return {
        isMalicious: true,
        threatType: 'PROMPT_INJECTION',
        details: 'Prompt injection directive attempting to manipulate automated code reviewer.',
        cwe: 'CWE-94',
        owasp: 'A03:2021-Injection',
      };
    }
  }

  for (const pat of MALICIOUS_CODE_PHRASES) {
    if (pat.test(text)) {
      return {
        isMalicious: true,
        threatType: 'MALICIOUS_CODE',
        details: 'Malicious payload (reverse shell, destructive command, or obfuscated execution) detected.',
        cwe: 'CWE-78',
        owasp: 'A03:2021-Injection',
      };
    }
  }

  return {
    isMalicious: false,
    threatType: 'CLEAN',
  };
}

// =========================================================================
// 9. Hybrid Reconciliation Engine
// =========================================================================

export interface HybridReconciliationParams {
  staticFindings: ReviewIssue[];
  llmFindings: ReviewIssue[];
  validAddedLinesMap: Map<string, number[]>;
  fileLineContentMap: Map<string, Map<number, string>>;
  config?: RepoConfig;
}

export interface HybridReconciliationResult {
  issues: ReviewIssue[];
  rejectedFindings: Array<{ issue: ReviewIssue; reason: string }>;
  stats: {
    totalEvaluated: number;
    acceptedCount: number;
    rejectedCount: number;
    duplicateFindingRate: number;
    staticCorroboratedCount: number;
  };
}

/**
 * Reconciles deterministic static analysis findings with semantic LLM findings:
 * - Validates schema, line range, and non-hallucinated evidence.
 * - Suppresses style nitpicks unless configured.
 * - Calibrates confidence and distinguishes certainty.
 * - Corroborates overlapping findings (Static + LLM) into unified hybrid findings.
 * - Deduplicates near and exact findings.
 * - Constructs complete traceable paths.
 */
export function reconcileHybridFindings(
  params: HybridReconciliationParams
): HybridReconciliationResult {
  const { staticFindings, llmFindings, validAddedLinesMap, fileLineContentMap, config } = params;
  const confidenceThreshold = config?.confidence_threshold ?? 0.75;
  const includeStyle = config?.include_style_nitpicks ?? false;

  const acceptedCandidates: ReviewIssue[] = [];
  const rejectedFindings: Array<{ issue: ReviewIssue; reason: string }> = [];
  let staticCorroboratedCount = 0;

  const staticLineKeySet = new Set(
    staticFindings.map((sf) => `${sf.file_path}:${sf.line_number}`)
  );

  // 1. Process Deterministic Static Findings (100% precision baseline)
  for (const sf of staticFindings) {
    const parse = ReviewIssueSchema.safeParse(sf);
    if (!parse.success) {
      rejectedFindings.push({ issue: sf, reason: `Malformed schema: ${parse.error.message}` });
      continue;
    }

    const validLines = validAddedLinesMap.get(sf.file_path) || [];
    const lineCheck = validateLineRange(sf, validLines);
    if (!lineCheck.isValid) {
      rejectedFindings.push({ issue: sf, reason: lineCheck.reason || 'Invalid line' });
      continue;
    }

    const lineContent = fileLineContentMap.get(sf.file_path)?.get(sf.line_number) || '';
    const evidenceCheck = validateEvidenceIntegrity(sf, lineContent);
    if (!evidenceCheck.isValid) {
      rejectedFindings.push({ issue: sf, reason: evidenceCheck.reason || 'Invalid evidence' });
      continue;
    }

    // Taxonomy validation
    const validCwe = validateAndNormalizeCwe(sf.cwe);
    const validOwasp = validateAndNormalizeOwasp(sf.owasp);
    const cweId = validCwe?.id || sf.cwe || 'CWE-798';
    const owaspCat = validOwasp || validCwe?.owasp || 'A07:2021-Identification and Authentication Failures';

    const calibratedSev = calibrateSeverity(sf.category, sf.message, cweId, lineContent);
    const trace = buildTraceablePath(sf, lineContent);

    acceptedCandidates.push({
      ...sf,
      cwe: cweId,
      owasp: owaspCat,
      severity: calibratedSev,
      confidence: 1.0,
      calibrated_confidence: 1.0,
      certainty: 'confirmed',
      source: 'static_analysis',
      evidence: evidenceCheck.normalizedEvidence,
      traceable_path: trace,
    });
  }

  // 2. Process LLM Findings (Rigorous Validation & Hallucination Prevention)
  for (const lf of llmFindings) {
    // A. Schema validation
    const parse = ReviewIssueSchema.safeParse(lf);
    if (!parse.success) {
      rejectedFindings.push({ issue: lf, reason: `Malformed schema: ${parse.error.message}` });
      continue;
    }

    // B. Check for malicious content in issue text
    const maliciousScan = scanForMaliciousContent(lf.message);
    if (maliciousScan.isMalicious) {
      lf.severity = 'critical';
      lf.category = 'security';
      lf.cwe = maliciousScan.cwe;
      lf.owasp = maliciousScan.owasp;
      lf.reasoning = maliciousScan.details;
    }

    // C. Line Range & Anchoring Validation (Avoid findings unrelated to changed code)
    const validLines = validAddedLinesMap.get(lf.file_path) || [];
    const lineCheck = validateLineRange(lf, validLines);
    if (!lineCheck.isValid) {
      rejectedFindings.push({ issue: lf, reason: lineCheck.reason || 'Line unrelated to changed code' });
      continue;
    }

    // D. Evidence Validation & Anti-Hallucination Guard
    const lineContent = fileLineContentMap.get(lf.file_path)?.get(lf.line_number) || '';
    const evidenceCheck = validateEvidenceIntegrity(lf, lineContent);
    if (!evidenceCheck.isValid) {
      rejectedFindings.push({ issue: lf, reason: evidenceCheck.reason || 'Hallucinated or missing code evidence' });
      continue;
    }

    // E. Style Nitpick Suppression
    if (!includeStyle && isStyleNitpick(lf)) {
      rejectedFindings.push({ issue: lf, reason: 'Suppressed style/formatting nitpick (not configured)' });
      continue;
    }

    // F. Taxonomy Normalization
    let cweId = lf.cwe;
    let owaspCat = lf.owasp;
    const normCwe = validateAndNormalizeCwe(lf.cwe);
    const normOwasp = validateAndNormalizeOwasp(lf.owasp);
    if (normCwe) {
      cweId = normCwe.id;
      owaspCat = normOwasp || normCwe.owasp;
    } else {
      const inferred = inferValidatedTaxonomy(lf.message, lf.category, lineContent);
      cweId = inferred.cwe || undefined;
      owaspCat = normOwasp || inferred.owasp || undefined;
    }

    // G. Confidence Calibration & Certainty Distinction
    const isCorroborated = staticLineKeySet.has(`${lf.file_path}:${lf.line_number}`);
    if (isCorroborated) staticCorroboratedCount++;

    const calib = calibrateConfidenceAndCertainty(lf, isCorroborated, true, confidenceThreshold);
    if (!calib.passesThreshold) {
      rejectedFindings.push({
        issue: lf,
        reason: `Confidence below minimum threshold (${calib.calibratedConfidence} < ${confidenceThreshold})`,
      });
      continue;
    }

    // H. Severity Calibration
    const calibratedSev = calibrateSeverity(lf.category, lf.message, cweId, lineContent);
    const trace = buildTraceablePath(lf, lineContent);

    acceptedCandidates.push({
      ...lf,
      cwe: cweId,
      owasp: owaspCat,
      severity: calibratedSev,
      confidence: lf.confidence ?? 0.85,
      calibrated_confidence: calib.calibratedConfidence,
      certainty: isCorroborated ? 'confirmed' : calib.certainty,
      source: isCorroborated ? 'hybrid' : 'llm',
      evidence: evidenceCheck.normalizedEvidence,
      reasoning: lf.reasoning || lf.impact || lf.message,
      traceable_path: trace,
    });
  }

  // 3. Deduplicate (Fingerprint + Proximity)
  const dedupResult = detectAndDeduplicateFindings(acceptedCandidates);

  return {
    issues: dedupResult.deduplicated,
    rejectedFindings,
    stats: {
      totalEvaluated: staticFindings.length + llmFindings.length,
      acceptedCount: dedupResult.deduplicated.length,
      rejectedCount: rejectedFindings.length,
      duplicateFindingRate: dedupResult.stats.duplicateFindingRate,
      staticCorroboratedCount,
    },
  };
}
