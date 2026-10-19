/**
 * Organization Policies & Security Gates Engine - GitSentinel Phase 7
 * Strictly separates probabilistic AI recommendations from deterministic
 * organization policy decisions.
 */

import { z } from 'zod';
import { ReviewIssue } from './types.js';

export const OrgPolicySchema = z.object({
  // Security Gate Enforcements
  blockCriticalSecurity: z.boolean().default(true),
  minConfidence: z.number().min(0).max(1).default(0.70),
  maxComments: z.number().int().min(0).max(100).default(20),
  requiredChecks: z.array(z.string()).default(['static_analysis']),
  ignoredPaths: z.array(z.string()).default(['docs/**', 'tests/**', '**/*.md', '**/__tests__/**']),
  requiredTesting: z.boolean().default(true),
  disabledCategories: z.array(z.string()).default([]),
});

export type OrgPolicy = z.infer<typeof OrgPolicySchema>;

export function getDefaultOrgPolicy(): OrgPolicy {
  return OrgPolicySchema.parse({});
}

export type GateVerdict = 'PASS' | 'WARN' | 'BLOCK';

export interface SecurityGateOptions {
  contextSummary?: {
    totalTokensUsed?: number;
    sourcesCount?: number;
  } | null;
  testCoverage?: {
    changedFunctions?: string[];
    coveredFunctions?: string[];
    untestedFunctions?: string[];
  } | null;
  dependencyFindings?: unknown[] | null;
  completedChecks?: string[]; // e.g. ['static_analysis', 'dependencies']
}

export interface SecurityGateResult {
  gateVerdict: GateVerdict;
  gateReasons: string[];
  appliedPolicy: OrgPolicy;
  blockedCount: number;
  warnCount: number;
  filteredOutCount: number;
  untestedSecurityChanges: boolean;
  commentBudgetExceeded: boolean;
  effectiveIssues: ReviewIssue[];
}

/**
 * Path matching helper (supports simple wildcards like docs/**, *.md, tests/*)
 */
export function matchesGlob(filePath: string, globPattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  const normalizedGlob = globPattern.replace(/\\/g, '/').toLowerCase();

  if (normalizedGlob.endsWith('/**')) {
    const prefix = normalizedGlob.slice(0, -3);
    return normalizedPath.startsWith(prefix) || normalizedPath.includes(`/${prefix}`);
  }
  if (normalizedGlob.startsWith('**/')) {
    const suffix = normalizedGlob.slice(3);
    return normalizedPath.endsWith(suffix) || normalizedPath.includes(`/${suffix}`);
  }
  if (normalizedGlob.startsWith('*.')) {
    const ext = normalizedGlob.slice(1);
    return normalizedPath.endsWith(ext);
  }
  return normalizedPath.includes(normalizedGlob);
}

/**
 * Deterministically evaluates an organization's policy against review findings
 * and metadata.
 *
 * Rules:
 * 1. Filter out issues matching ignoredPaths, disabledCategories, or below minConfidence.
 * 2. If blockCriticalSecurity is true and any remaining security issue is critical (or risk >= 80), verdict = BLOCK.
 * 3. If requiredTesting is true and security-sensitive functions or issues are untested, adds gate warning or block.
 * 4. If requiredChecks are missing from completed checks, triggers gate warning/block.
 * 5. If issues exceed maxComments, trims comments to budget and flags commentBudgetExceeded.
 * 6. Returns deterministic verdict: BLOCK > WARN > PASS with detailed reasons.
 */
export function evaluateSecurityGate(
  issues: ReviewIssue[],
  options: SecurityGateOptions = {},
  rawPolicy?: Partial<OrgPolicy> | null
): SecurityGateResult {
  const policy: OrgPolicy = OrgPolicySchema.parse(rawPolicy || {});
  const gateReasons: string[] = [];

  let blockedCount = 0;
  let warnCount = 0;
  let filteredOutCount = 0;

  // 1. Filter issues by ignored paths, disabled categories, and confidence threshold
  const effectiveIssues: ReviewIssue[] = [];

  for (const issue of issues) {
    // Check ignored paths
    const isIgnored = policy.ignoredPaths.some((pattern) => matchesGlob(issue.file_path, pattern));
    if (isIgnored) {
      filteredOutCount++;
      continue;
    }

    // Check disabled categories
    if (policy.disabledCategories.includes(issue.category.toLowerCase())) {
      filteredOutCount++;
      continue;
    }

    // Check minimum confidence threshold (using calibrated_confidence if present, else confidence)
    const effectiveConfidence = issue.calibrated_confidence ?? issue.confidence ?? 0.8;
    if (effectiveConfidence < policy.minConfidence) {
      filteredOutCount++;
      continue;
    }

    effectiveIssues.push(issue);
  }

  // 2. Check for critical security findings
  const criticalSecurityIssues = effectiveIssues.filter(
    (i) =>
      i.category === 'security' &&
      (i.severity === 'critical' || (i.risk_score != null && i.risk_score >= 80))
  );

  if (policy.blockCriticalSecurity && criticalSecurityIssues.length > 0) {
    blockedCount += criticalSecurityIssues.length;
    for (const crit of criticalSecurityIssues) {
      const taxonomy = crit.cwe || crit.owasp || 'Security Vulnerability';
      gateReasons.push(
        `BLOCK: Critical security issue detected (${taxonomy}) in ${crit.file_path}:${crit.line_number || 'file'}: "${crit.message}"`
      );
    }
  }

  // 3. Check required checks
  const completedChecks = new Set(options.completedChecks || ['static_analysis']);
  for (const reqCheck of policy.requiredChecks) {
    if (!completedChecks.has(reqCheck)) {
      warnCount++;
      gateReasons.push(`WARN: Required verification check "${reqCheck}" was not completed.`);
    }
  }

  // 4. Check test coverage enforcement
  let untestedSecurityChanges = false;
  if (policy.requiredTesting && options.testCoverage) {
    const untested = options.testCoverage.untestedFunctions || [];
    if (untested.length > 0) {
      // Check if any security findings exist in untested code or if untested functions touch sensitive paths
      const hasSecurityIssues = effectiveIssues.some((i) => i.category === 'security');
      if (hasSecurityIssues || untested.some((fn) => /auth|crypto|jwt|token|login|admin/i.test(fn))) {
        untestedSecurityChanges = true;
        warnCount++;
        gateReasons.push(
          `WARN: Untested sensitive functions detected without unit test coverage: ${untested.slice(0, 3).join(', ')}${untested.length > 3 ? '...' : ''}`
        );
      }
    }
  }

  // 5. Check non-critical issues for warnings
  const warnings = effectiveIssues.filter(
    (i) =>
      i.severity === 'warning' ||
      (i.severity === 'critical' && (!policy.blockCriticalSecurity || i.category !== 'security'))
  );
  if (warnings.length > 0 && blockedCount === 0) {
    warnCount += warnings.length;
    if (gateReasons.length === 0) {
      gateReasons.push(`WARN: Review contains ${warnings.length} warning(s) requiring developer attention.`);
    }
  }

  // 6. Check maximum comments budget
  const commentBudgetExceeded = effectiveIssues.length > policy.maxComments;
  if (commentBudgetExceeded) {
    gateReasons.push(
      `INFO: Finding count (${effectiveIssues.length}) exceeds maximum comment budget (${policy.maxComments}). Truncating inline comments to prevent PR notification fatigue.`
    );
  }

  // 7. Calculate final Gate Verdict
  let gateVerdict: GateVerdict = 'PASS';
  if (blockedCount > 0) {
    gateVerdict = 'BLOCK';
  } else if (warnCount > 0 || (effectiveIssues.length > 0 && effectiveIssues.some(i => i.severity === 'warning'))) {
    gateVerdict = 'WARN';
  } else {
    gateVerdict = 'PASS';
    gateReasons.push('PASS: All organization policy checks and security gates satisfied cleanly.');
  }

  return {
    gateVerdict,
    gateReasons,
    appliedPolicy: policy,
    blockedCount,
    warnCount,
    filteredOutCount,
    untestedSecurityChanges,
    commentBudgetExceeded,
    effectiveIssues: effectiveIssues.slice(0, policy.maxComments),
  };
}
