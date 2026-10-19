import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Role,
  Permission,
  PermissionType,
  ALL_PERMISSIONS,
  hasPermission,
  assertPermission,
  RbacForbiddenError,
  normalizeRole,
} from './rbac.js';
import {
  sanitizeAuditMetadata,
} from './audit.js';
import {
  evaluateSecurityGate,
} from './policies.js';
import { calculateIssueFingerprint } from './fingerprint.js';
import { ReviewIssue } from './types.js';

describe('Phase 7: Role-Based Access Control (RBAC)', () => {
  it('verifies deterministic permission matrix across all 4 roles', () => {
    // 1. OWNER has ALL permissions
    for (const perm of ALL_PERMISSIONS) {
      assert.equal(
        hasPermission(Role.OWNER, perm),
        true,
        `OWNER should have permission: ${perm}`
      );
      assert.doesNotThrow(() => assertPermission(Role.OWNER, perm));
    }

    // 2. ADMIN has all permissions EXCEPT REPOSITORY_DISCONNECT
    for (const perm of ALL_PERMISSIONS) {
      if (perm === Permission.REPOSITORY_DISCONNECT) {
        assert.equal(hasPermission(Role.ADMIN, perm), false);
        assert.throws(() => assertPermission(Role.ADMIN, perm), RbacForbiddenError);
      } else {
        assert.equal(hasPermission(Role.ADMIN, perm), true, `ADMIN should have ${perm}`);
        assert.doesNotThrow(() => assertPermission(Role.ADMIN, perm));
      }
    }

    // 3. REVIEWER has review, issue, feedback, and view permissions, but NOT config/policy update, audit, or member manage
    const reviewerForbidden: PermissionType[] = [
      Permission.REPOSITORY_CONNECT,
      Permission.REPOSITORY_DISCONNECT,
      Permission.CONFIG_UPDATE,
      Permission.POLICY_UPDATE,
      Permission.AUDIT_VIEW,
      Permission.MEMBER_MANAGE,
    ];
    for (const perm of reviewerForbidden) {
      assert.equal(hasPermission(Role.REVIEWER, perm), false, `REVIEWER must NOT have ${perm}`);
      assert.throws(() => assertPermission(Role.REVIEWER, perm), RbacForbiddenError);
    }
    const reviewerAllowed: PermissionType[] = [
      Permission.REPOSITORY_VIEW,
      Permission.REVIEW_TRIGGER,
      Permission.REVIEW_RERUN,
      Permission.REVIEW_RETRY,
      Permission.REVIEW_VIEW,
      Permission.SARIF_EXPORT,
      Permission.ISSUE_DISMISS,
      Permission.ISSUE_REOPEN,
      Permission.ISSUE_FIX,
      Permission.ISSUE_VIEW,
      Permission.FEEDBACK_SUBMIT,
    ];
    for (const perm of reviewerAllowed) {
      assert.equal(hasPermission(Role.REVIEWER, perm), true, `REVIEWER must have ${perm}`);
      assert.doesNotThrow(() => assertPermission(Role.REVIEWER, perm));
    }

    // 4. VIEWER is strictly read-only
    const viewerAllowed: PermissionType[] = [
      Permission.REPOSITORY_VIEW,
      Permission.CONFIG_VIEW,
      Permission.POLICY_VIEW,
      Permission.REVIEW_VIEW,
      Permission.SARIF_EXPORT,
      Permission.ISSUE_VIEW,
    ];
    for (const perm of ALL_PERMISSIONS) {
      if (viewerAllowed.includes(perm)) {
        assert.equal(hasPermission(Role.VIEWER, perm), true, `VIEWER must have ${perm}`);
        assert.doesNotThrow(() => assertPermission(Role.VIEWER, perm));
      } else {
        assert.equal(hasPermission(Role.VIEWER, perm), false, `VIEWER must NOT have ${perm}`);
        assert.throws(() => assertPermission(Role.VIEWER, perm), RbacForbiddenError);
      }
    }
  });

  it('handles invalid, empty, or unknown role gracefully', () => {
    assert.equal(hasPermission(null, Permission.REPOSITORY_VIEW), false);
    assert.equal(hasPermission(undefined, Permission.REPOSITORY_VIEW), false);
    assert.equal(hasPermission('UNKNOWN_ROLE', Permission.REPOSITORY_VIEW), false);
    assert.equal(normalizeRole('owner'), Role.OWNER);
    assert.equal(normalizeRole('admin'), Role.ADMIN);
    assert.equal(normalizeRole('reviewer'), Role.REVIEWER);
    assert.equal(normalizeRole('viewer'), Role.VIEWER);
    assert.equal(normalizeRole('garbage'), Role.VIEWER);
  });
});

describe('Phase 7: Audit Logging & Secret Sanitization', () => {
  it('redacts all API keys, GitHub tokens, passwords, and private keys from metadata', () => {
    const rawMetadata = {
      prNumber: 42,
      repo: 'test-org/repo',
      userApiKey: 'AIzaSyD-fake-google-api-key-1234567890',
      githubToken: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
      nested: {
        password: 'super-secret-password-123',
        authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...',
        safeValue: 'normal-config-param',
      },
      tags: ['security', 'audit'],
    };

    const sanitized = sanitizeAuditMetadata(rawMetadata) as any;

    assert.equal(sanitized.prNumber, 42);
    assert.equal(sanitized.repo, 'test-org/repo');
    assert.equal(sanitized.userApiKey, '[REDACTED_SECRET]');
    assert.equal(sanitized.githubToken, '[REDACTED_SECRET]');
    assert.equal(sanitized.nested.password, '[REDACTED_SECRET]');
    assert.equal(sanitized.nested.authHeader, '[REDACTED_SECRET]');
    assert.equal(sanitized.nested.private_key, '[REDACTED_SECRET]');
    assert.equal(sanitized.nested.safeValue, 'normal-config-param');
    assert.deepEqual(sanitized.tags, ['security', 'audit']);
  });
});

describe('Phase 7: Organization Policies & Security Gates', () => {
  it('evaluates PASS when code has no issues and meets all checks', () => {
    const result = evaluateSecurityGate([], { completedChecks: ['static_analysis'] });
    assert.equal(result.gateVerdict, 'PASS');
    assert.equal(result.blockedCount, 0);
    assert.equal(result.warnCount, 0);
    assert.ok(result.gateReasons.some((r) => r.includes('PASS')));
  });

  it('evaluates BLOCK when critical security issue is found', () => {
    const criticalIssue: ReviewIssue = {
      file_path: 'src/auth/login.ts',
      line_number: 42,
      severity: 'critical',
      category: 'security',
      message: 'Unsanitized raw SQL interpolation',
      cwe: 'CWE-89',
      owasp: 'A03:2021-Injection',
      confidence: 0.95,
      calibrated_confidence: 0.95,
      risk_score: 95,
    };

    const result = evaluateSecurityGate([criticalIssue], { completedChecks: ['static_analysis'] });
    assert.equal(result.gateVerdict, 'BLOCK');
    assert.equal(result.blockedCount, 1);
    assert.ok(result.gateReasons.some((r) => r.includes('BLOCK: Critical security issue detected')));
  });

  it('filters out ignored paths and disabled categories according to policy', () => {
    const issues: ReviewIssue[] = [
      {
        file_path: 'docs/architecture.md',
        line_number: 10,
        severity: 'critical',
        category: 'security',
        message: 'Fake sample credential in documentation',
        confidence: 0.9,
      },
      {
        file_path: 'src/main.ts',
        line_number: 25,
        severity: 'suggestion',
        category: 'style',
        message: 'Trailing whitespace',
        confidence: 0.9,
      },
    ];

    const policy = {
      ignoredPaths: ['docs/**', '**/*.md'],
      disabledCategories: ['style'],
      blockCriticalSecurity: true,
    };

    const result = evaluateSecurityGate(issues, {}, policy);
    assert.equal(result.filteredOutCount, 2);
    assert.equal(result.effectiveIssues.length, 0);
    assert.equal(result.gateVerdict, 'PASS');
  });

  it('caps inline comments when comment budget is exceeded', () => {
    const manyIssues: ReviewIssue[] = Array.from({ length: 25 }, (_, i) => ({
      file_path: `src/file_${i}.ts`,
      line_number: i + 1,
      severity: 'warning' as const,
      category: 'bug' as const,
      message: `Potential bug ${i}`,
      confidence: 0.85,
    }));

    const result = evaluateSecurityGate(manyIssues, {}, { maxComments: 5 });
    assert.equal(result.commentBudgetExceeded, true);
    assert.equal(result.effectiveIssues.length, 5);
    assert.ok(result.gateReasons.some((r) => r.includes('exceeds maximum comment budget')));
  });

  it('warns when required verification checks are missing', () => {
    const result = evaluateSecurityGate([], { completedChecks: [] }, { requiredChecks: ['static_analysis'] });
    assert.equal(result.gateVerdict, 'WARN');
    assert.ok(result.gateReasons.some((r) => r.includes('Required verification check "static_analysis" was not completed')));
  });
});

describe('Phase 7: Deterministic Issue Fingerprinting', () => {
  it('generates consistent, deterministic SHA-256 fingerprints', () => {
    const issue1 = {
      filePath: 'src/controllers/auth.ts',
      lineNumber: 45,
      category: 'security',
      cwe: 'CWE-89',
      message: 'Direct concatenation of query parameters into SQL string',
    };

    const issue2 = {
      filePath: 'src/controllers/auth.ts',
      lineNumber: 45,
      category: 'SECURITY',
      cwe: 'cwe-89',
      message: '  Direct concatenation of query parameters into SQL string  ',
    };

    const fp1 = calculateIssueFingerprint(issue1);
    const fp2 = calculateIssueFingerprint(issue2);

    assert.equal(fp1, fp2);
    assert.equal(typeof fp1, 'string');
    assert.equal(fp1.length, 64); // SHA-256 hex length
  });

  it('generates different fingerprints for distinct locations or messages', () => {
    const base = {
      filePath: 'src/auth.ts',
      lineNumber: 10,
      category: 'security',
      cwe: 'CWE-89',
      message: 'SQL Injection',
    };

    const diffLine = { ...base, lineNumber: 11 };
    const diffFile = { ...base, filePath: 'src/user.ts' };

    assert.notEqual(calculateIssueFingerprint(base), calculateIssueFingerprint(diffLine));
    assert.notEqual(calculateIssueFingerprint(base), calculateIssueFingerprint(diffFile));
  });
});
