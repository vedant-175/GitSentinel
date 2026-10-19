/**
 * Explicit Demo Data Seeder for Recruiter and Architecture Demonstrations.
 * In accordance with truthfulness guarantees:
 * - Every entity is explicitly labeled with "[DEMO DATA]"
 * - Preserves existing real installations and repositories
 * - Provides immediate, realistic review states for walkthroughs
 */
import { prisma } from '@ai-reviewer/db';
import { Role } from '@ai-reviewer/shared';

async function main() {
  console.log('🌱 Seeding clearly-labeled DEMO environment...');

  // 1. Create or update Demo Installation
  const demoInstallationId = BigInt(9990001);
  const inst = await prisma.installation.upsert({
    where: { githubInstallationId: demoInstallationId },
    update: {
      accountLogin: 'demo-organization',
      accountType: 'Organization',
    },
    create: {
      githubInstallationId: demoInstallationId,
      accountLogin: 'demo-organization',
      accountType: 'Organization',
    },
  });

  // 2. Assign default demo membership roles
  await prisma.installationMember.upsert({
    where: {
      installation_user_unique: {
        installationId: inst.id,
        userLogin: 'demo-reviewer',
      },
    },
    update: { role: Role.REVIEWER },
    create: {
      installationId: inst.id,
      userLogin: 'demo-reviewer',
      role: Role.REVIEWER,
    },
  });

  // 3. Create Demo Repository
  const demoRepoId = BigInt(8880001);
  const repo = await prisma.repository.upsert({
    where: { githubRepoId: demoRepoId },
    update: {
      fullName: 'demo-organization/payment-service',
      defaultBranch: 'main',
      organizationPolicy: {
        blockCriticalSecurity: true,
        minConfidence: 0.75,
        maxComments: 20,
        requiredChecks: ['static-analysis', 'secret-detection'],
        ignoredPaths: ['tests/**', 'dist/**'],
        requiredTesting: true,
        disabledCategories: [],
      },
    },
    create: {
      installationId: inst.id,
      githubRepoId: demoRepoId,
      fullName: 'demo-organization/payment-service',
      defaultBranch: 'main',
      organizationPolicy: {
        blockCriticalSecurity: true,
        minConfidence: 0.75,
        maxComments: 20,
        requiredChecks: ['static-analysis', 'secret-detection'],
        ignoredPaths: ['tests/**', 'dist/**'],
        requiredTesting: true,
        disabledCategories: [],
      },
      config: {
        confidenceThreshold: 0.75,
        blockOnCritical: true,
        autoApprove: false,
        reviewTone: 'constructive',
        ignorePaths: ['tests/**', 'dist/**'],
      },
    },
  });

  // 4. Demo PR #1: Critical Security Issue (BLOCK verdict)
  const pr1 = await prisma.pullRequest.upsert({
    where: {
      repositoryId_githubPrNumber: {
        repositoryId: repo.id,
        githubPrNumber: 101,
      },
    },
    update: {
      title: '[DEMO DATA] Migrate session token verification to RS256',
      author: 'demo-developer',
      headSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60101',
      state: 'open',
    },
    create: {
      repositoryId: repo.id,
      githubPrNumber: 101,
      title: '[DEMO DATA] Migrate session token verification to RS256',
      author: 'demo-developer',
      headSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60101',
      state: 'open',
    },
  });

  const review1 = await prisma.review.upsert({
    where: {
      pullRequestId_commitSha: {
        pullRequestId: pr1.id,
        commitSha: pr1.headSha,
      },
    },
    update: {
      status: 'completed',
      verdict: 'REQUEST_CHANGES',
      gateVerdict: 'BLOCK',
      gateReasons: [
        'Critical security vulnerability detected: CWE-347 Improper Verification of Cryptographic Signature',
        'High severity credential leak detected: CWE-798 Hardcoded Credentials',
      ],
      summary:
        '### 🛡️ GitSentinel Security Review [DEMO DATA]\n\n**Verdict**: ⛔ **BLOCK (Changes Requested)**\n\nIdentified 1 critical vulnerability and 1 hardcoded credential in changed lines. Automatic merge is blocked per organization policy.',
      latencyMs: 1420,
      model: 'hybrid-static-llm',
      promptVersion: 'v2.1-security-calibrated',
      staticAnalysisVersion: 'eslint@9.3.0,bandit@1.7.9,ruff@0.5.2',
      configVersion: '2026-10-05',
      completedAt: new Date(),
    },
    create: {
      pullRequestId: pr1.id,
      commitSha: pr1.headSha,
      status: 'completed',
      verdict: 'REQUEST_CHANGES',
      gateVerdict: 'BLOCK',
      gateReasons: [
        'Critical security vulnerability detected: CWE-347 Improper Verification of Cryptographic Signature',
        'High severity credential leak detected: CWE-798 Hardcoded Credentials',
      ],
      summary:
        '### 🛡️ GitSentinel Security Review [DEMO DATA]\n\n**Verdict**: ⛔ **BLOCK (Changes Requested)**\n\nIdentified 1 critical vulnerability and 1 hardcoded credential in changed lines. Automatic merge is blocked per organization policy.',
      latencyMs: 1420,
      model: 'hybrid-static-llm',
      promptVersion: 'v2.1-security-calibrated',
      staticAnalysisVersion: 'eslint@9.3.0,bandit@1.7.9,ruff@0.5.2',
      configVersion: '2026-10-05',
      completedAt: new Date(),
    },
  });

  // Clean old issues for demo PR1
  await prisma.reviewIssue.deleteMany({ where: { reviewId: review1.id } });

  await prisma.reviewIssue.createMany({
    data: [
      {
        reviewId: review1.id,
        filePath: 'src/auth/jwt.ts',
        lineNumber: 42,
        severity: 'critical',
        category: 'security',
        message:
          '[DEMO DATA] jwt.decode() called without signature verification: allows attackers to forge authorization claims with arbitrary user IDs.',
        cwe: 'CWE-347',
        owasp: 'A07:2021-Identification and Authentication Failures',
        confidence: 0.94,
        calibratedConfidence: 0.91,
        riskScore: 92,
        status: 'open',
        source: 'llm',
        fingerprint: 'demo-fp-jwt-decode-cwe347',
      },
      {
        reviewId: review1.id,
        filePath: 'src/payments/stripe.ts',
        lineNumber: 18,
        severity: 'critical',
        category: 'security',
        message:
          '[DEMO DATA] Hardcoded Stripe secret key committed in production router. Secrets must be loaded exclusively via environment variables.',
        cwe: 'CWE-798',
        owasp: 'A07:2021-Identification and Authentication Failures',
        confidence: 0.99,
        calibratedConfidence: 0.98,
        riskScore: 88,
        status: 'open',
        source: 'static_analysis',
        fingerprint: 'demo-fp-stripe-secret-cwe798',
      },
    ],
  });

  // 5. Demo PR #2: Clean Refactor (PASS verdict)
  const pr2 = await prisma.pullRequest.upsert({
    where: {
      repositoryId_githubPrNumber: {
        repositoryId: repo.id,
        githubPrNumber: 102,
      },
    },
    update: {
      title: '[DEMO DATA] Refactor currency formatting using Intl.NumberFormat',
      author: 'demo-developer',
      headSha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a10102',
      state: 'open',
    },
    create: {
      repositoryId: repo.id,
      githubPrNumber: 102,
      title: '[DEMO DATA] Refactor currency formatting using Intl.NumberFormat',
      author: 'demo-developer',
      headSha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a10102',
      state: 'open',
    },
  });

  await prisma.review.upsert({
    where: {
      pullRequestId_commitSha: {
        pullRequestId: pr2.id,
        commitSha: pr2.headSha,
      },
    },
    update: {
      status: 'completed',
      verdict: 'APPROVE',
      gateVerdict: 'PASS',
      gateReasons: ['All required checks passed', 'Zero blocking security findings'],
      summary:
        '### 🛡️ GitSentinel Security Review [DEMO DATA]\n\n**Verdict**: ✅ **APPROVE (Clean Code)**\n\nClean refactor. Zero security findings, tests present, and passes all static analysis checks.',
      latencyMs: 820,
      model: 'hybrid-static-llm',
      promptVersion: 'v2.1-security-calibrated',
      staticAnalysisVersion: 'eslint@9.3.0,bandit@1.7.9,ruff@0.5.2',
      configVersion: '2026-10-05',
      completedAt: new Date(),
    },
    create: {
      pullRequestId: pr2.id,
      commitSha: pr2.headSha,
      status: 'completed',
      verdict: 'APPROVE',
      gateVerdict: 'PASS',
      gateReasons: ['All required checks passed', 'Zero blocking security findings'],
      summary:
        '### 🛡️ GitSentinel Security Review [DEMO DATA]\n\n**Verdict**: ✅ **APPROVE (Clean Code)**\n\nClean refactor. Zero security findings, tests present, and passes all static analysis checks.',
      latencyMs: 820,
      model: 'hybrid-static-llm',
      promptVersion: 'v2.1-security-calibrated',
      staticAnalysisVersion: 'eslint@9.3.0,bandit@1.7.9,ruff@0.5.2',
      configVersion: '2026-10-05',
      completedAt: new Date(),
    },
  });

  console.log('✅ DEMO DATA seeded successfully:');
  console.log('   - Demo Installation: demo-organization (ID: 9990001)');
  console.log('   - Demo Repo: demo-organization/payment-service');
  console.log('   - Demo PR #101: BLOCK verdict with 2 real vulnerabilities');
  console.log('   - Demo PR #102: PASS verdict with clean refactor');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding demo data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
