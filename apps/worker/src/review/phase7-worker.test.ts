import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { processReviewJob } from './pipeline.js';
import { LLMProvider, ReviewContext } from './llm.js';
import { ReviewResult } from '@ai-reviewer/shared';

function itDb(name: string, fn: () => Promise<void> | void) {
  it(name, async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('Database is offline');
      return;
    }
    await fn();
  });
}

class TestMockProvider implements LLMProvider {
  name = 'mock-test-provider';
  private result: ReviewResult;
  constructor(result: ReviewResult) {
    this.result = result;
  }
  async reviewChunk(_chunk: any, _context?: ReviewContext): Promise<ReviewResult> {
    return this.result;
  }
}

describe('Phase 7 Worker: Security Gate & Review Provenance', () => {
  itDb('evaluates BLOCK gate verdict for critical security issue and records review.started audit log', async () => {
    const timestamp = Date.now();
    const inst = await prisma.installation.create({
      data: {
        githubInstallationId: BigInt(timestamp) * 1000n + 51n,
        accountLogin: `gate-user-${timestamp}`,
        accountType: 'User',
      },
    });

    const repo = await prisma.repository.create({
      data: {
        installationId: inst.id,
        githubRepoId: BigInt(timestamp) * 1000n + 52n,
        fullName: `gate-user-${timestamp}/sec-repo`,
        defaultBranch: 'main',
        organizationPolicy: {
          blockCriticalSecurity: true,
          minConfidence: 0.70,
        },
      },
    });

    const mockDiff = `diff --git a/src/db.ts b/src/db.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/db.ts
@@ -0,0 +1,5 @@
+export function queryUser(email: string) {
+  const sql = \`SELECT * FROM users WHERE email = '\${email}'\`;
+  return db.query(sql);
+}
`;

    const mockProvider = new TestMockProvider({
      issues: [
        {
          file_path: 'src/db.ts',
          line_number: 2,
          severity: 'critical',
          category: 'security',
          message: 'Direct concatenation into raw SQL creates SQL injection',
          cwe: 'CWE-89',
          owasp: 'A03:2021-Injection',
          evidence: "const sql = `SELECT * FROM users WHERE email = '${email}'`;",
          impact: 'Full unauthorized database read/write access',
          attack_scenario: "Attacker supplies ' OR '1'='1 to dump users table",
          affected_code: "const sql = `SELECT * FROM users WHERE email = '${email}'`;",
          remediation: 'Use parameterized queries: db.query("SELECT * FROM users WHERE email = $1", [email])',
          confidence: 0.99,
          calibrated_confidence: 0.98,
          risk_score: 95,
        },
      ],
      overall_assessment: 'Critical SQL injection detected in database query builder.',
    });

    const result = await processReviewJob(
      {
        type: 'review-pr',
        installationId: Number(inst.githubInstallationId),
        repoId: repo.id,
        githubRepoId: Number(repo.githubRepoId),
        prNumber: 701,
        commitSha: `commit-gate-${timestamp}`,
        repoFullName: repo.fullName,
      },
      mockDiff,
      undefined,
      `job-gate-${timestamp}`,
      { llmProviderOverride: mockProvider }
    );

    assert.ok(result.reviewId > 0);

    const savedReview = await prisma.review.findUnique({
      where: { id: result.reviewId },
      include: { issues: true },
    });

    assert.ok(savedReview);
    // Security Gate Verdict must be BLOCK
    assert.equal(savedReview.gateVerdict, 'BLOCK');
    assert.ok(Array.isArray(savedReview.gateReasons));
    assert.ok((savedReview.gateReasons as string[]).some((r) => r.includes('BLOCK: Critical security issue detected')));
    assert.equal(savedReview.promptVersion, 'v7.0.0-evidence-contract');
    assert.ok(savedReview.staticAnalysisVersion?.includes('eslint'));
    assert.ok(typeof savedReview.configVersion === 'string');

    // Issues must have deterministic fingerprints computed
    assert.equal(savedReview.issues.length, 1);
    const issue = savedReview.issues[0];
    assert.ok(issue.fingerprint);
    assert.ok(issue.fingerprint.length >= 16);

    // Audit log for review.started must exist
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        installationId: inst.id,
        action: 'review.started',
      },
    });
    assert.ok(auditLogs.length > 0);
    assert.equal(auditLogs[0].resourceId, String(savedReview.id));

    // Cleanup
    await prisma.installation.delete({ where: { id: inst.id } });
  });

  itDb('evaluates PASS gate verdict when PR has no security issues and satisfies all checks', async () => {
    const timestamp = Date.now();
    const inst = await prisma.installation.create({
      data: {
        githubInstallationId: BigInt(timestamp) * 1000n + 53n,
        accountLogin: `pass-user-${timestamp}`,
        accountType: 'User',
      },
    });

    const repo = await prisma.repository.create({
      data: {
        installationId: inst.id,
        githubRepoId: BigInt(timestamp) * 1000n + 54n,
        fullName: `pass-user-${timestamp}/clean-repo`,
        defaultBranch: 'main',
      },
    });

    const mockDiff = `diff --git a/src/math.ts b/src/math.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/math.ts
@@ -0,0 +1,3 @@
+export function add(a: number, b: number): number {
+  return a + b;
+}
`;

    const mockProvider = new TestMockProvider({
      issues: [],
      overall_assessment: 'Clean code changes with zero defects detected.',
    });

    const result = await processReviewJob(
      {
        type: 'review-pr',
        installationId: Number(inst.githubInstallationId),
        repoId: repo.id,
        githubRepoId: Number(repo.githubRepoId),
        prNumber: 702,
        commitSha: `commit-pass-${timestamp}`,
        repoFullName: repo.fullName,
      },
      mockDiff,
      undefined,
      `job-pass-${timestamp}`,
      { llmProviderOverride: mockProvider }
    );

    const savedReview = await prisma.review.findUnique({
      where: { id: result.reviewId },
    });

    assert.ok(savedReview);
    assert.equal(savedReview.gateVerdict, 'PASS');
    assert.ok((savedReview.gateReasons as string[]).some((r) => r.includes('PASS')));

    // Cleanup
    await prisma.installation.delete({ where: { id: inst.id } });
  });
});
