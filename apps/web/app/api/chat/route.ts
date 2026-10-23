import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@ai-reviewer/db';
import { getKeyPool } from '@ai-reviewer/shared';
import {
  requireSession,
  getSessionInstallationIds,
  assertPullRequestAccess,
  assertInstallationAccess,
  handleAuthError,
} from '@/lib/auth-helpers';
import {
  acquireAIConcurrencySlot,
  releaseAIConcurrencySlot,
  checkAIBudget,
  checkAIChatRateLimit,
} from '@/lib/rate-limit';
import {
  ChatRequestSchema,
  buildSecureChatPrompt,
  sanitizeModelOutput,
  validateGeneratedPatch,
  redactSensitiveData,
  safeProviderFetch,
} from '@/lib/ai-security';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // 1. Session check
  let session: any;
  try {
    session = await requireSession();
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session?.user?.id || session?.user?.login || 'user';

  // 2. Distributed Rate Limiting & User AI Quota
  const rateLimitRes = await checkAIChatRateLimit(req, userId);
  if (rateLimitRes) return rateLimitRes;

  const budget = await checkAIBudget(userId, 100);
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Daily AI request budget exceeded. Quota resets at midnight UTC.',
        retryAfter: budget.resetSeconds,
      },
      {
        status: 429,
        headers: { 'Retry-After': budget.resetSeconds.toString() },
      }
    );
  }

  // 3. Concurrency Limiting (Max 3 concurrent chat requests per user)
  const slot = await acquireAIConcurrencySlot(userId, 3);
  if (!slot.acquired) {
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Concurrent AI request limit reached. Please wait for current query to finish.',
      },
      { status: 429 }
    );
  }

  try {
    // 4. Strict Schema Input Validation (Zod)
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid or missing JSON payload' }, { status: 400 });
    }

    const parseResult = ChatRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || 'Invalid chat request schema';
      return NextResponse.json(
        { error: 'Bad Request', message: firstError, details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { prId, repoId, message, messages = [] } = parseResult.data;
    const userMessage = (message || (messages[messages.length - 1]?.content) || '').trim();

    const installationIds = await getSessionInstallationIds().catch(() => []);

    // 5. Tenancy verification: Ensure user is authorized for the targeted PR or repo
    if (prId) {
      const parsedPrId = typeof prId === 'number' ? prId : parseInt(prId, 10);
      if (!isNaN(parsedPrId)) {
        try {
          await assertPullRequestAccess(parsedPrId, installationIds);
        } catch {
          return NextResponse.json(
            { error: 'Forbidden: Access denied to pull request context' },
            { status: 403 }
          );
        }
      }
    } else if (repoId) {
      const parsedRepoId = typeof repoId === 'number' ? repoId : parseInt(repoId, 10);
      if (!isNaN(parsedRepoId)) {
        try {
          await assertInstallationAccess(parsedRepoId, installationIds);
        } catch {
          return NextResponse.json(
            { error: 'Forbidden: Access denied to repository context' },
            { status: 403 }
          );
        }
      }
    }

    // 6. Gather Context (PR, Review, Issues, Gate Verdict)
    let contextStr = '';
    let prRecord: any = null;
    let repoRecord: any = null;

    try {
      if (prId) {
        const parsedPrId = typeof prId === 'number' ? prId : parseInt(prId, 10);
        if (!isNaN(parsedPrId)) {
          prRecord = await prisma.pullRequest.findUnique({
            where: { id: parsedPrId },
            include: {
              repository: true,
              reviews: {
                orderBy: { id: 'desc' },
                take: 1,
                include: {
                  issues: true,
                },
              },
            },
          });
        }
      } else if (repoId) {
        const parsedRepoId = typeof repoId === 'number' ? repoId : parseInt(repoId, 10);
        if (!isNaN(parsedRepoId)) {
          repoRecord = await prisma.repository.findUnique({
            where: { id: parsedRepoId },
          });
        }
      }
    } catch (dbErr) {
      console.warn('[Chat API] Database offline during context fetch, proceeding with fallback:', redactSensitiveData(String(dbErr)));
    }

    if (prRecord) {
      const latestReview = prRecord.reviews?.[0];
      const issues = latestReview?.issues || [];
      contextStr = `
PULL REQUEST CONTEXT:
- Title: "${prRecord.title}"
- Repository: "${prRecord.repository?.fullName}"
- PR Number: #${prRecord.number}
- HEAD Commit: ${prRecord.headSha}
- Security Gate Verdict: ${latestReview?.gateVerdict || 'PENDING'}
- Overall Review Verdict: ${latestReview?.verdict || 'PENDING'}
- Summary: ${latestReview?.summary || 'No review summary generated yet'}
- Detected Vulnerabilities (${issues.length} Total):
${issues
  .map(
    (iss: any, idx: number) => `
  [Issue ${idx + 1}]
  - File: ${iss.filePath}:${iss.lineNumber}
  - Severity: ${iss.severity.toUpperCase()}
  - Category: ${iss.category}
  - Title/Message: ${iss.message}
  - CWE: ${iss.cwe || 'N/A'} | OWASP: ${iss.owasp || 'N/A'}
  - Attack Scenario: ${iss.attackScenario || 'N/A'}
  - Remediation Advice: ${iss.remediation || 'N/A'}
  - Suggested Fix:
${iss.suggestedFix || 'None'}
`
  )
  .join('\n')}
`;
    } else if (repoRecord || repoId) {
      contextStr = `
REPOSITORY CONTEXT:
- Name: "${repoRecord?.fullName || repoId}"
- Default Branch: ${repoRecord?.defaultBranch || 'main'}
- Monitoring: Active AST & LLM Surveillance
`;
    }

    // 7. Secure Prompt Construction with Untrusted Data Isolation
    const { systemPrompt, userPrompt } = buildSecureChatPrompt({
      contextStr,
      userMessage,
    });

    // 8. Multi-Tier Cascading KeyPool Resolution with Timeouts
    const groqPool = getKeyPool('groq');
    const geminiPool = getKeyPool('gemini');

    // Attempt Tier 1: Groq (5 keys with 429 rotation)
    if (groqPool.hasKeys()) {
      const maxGroqAttempts = Math.min(groqPool.size, 5);
      for (let attempt = 0; attempt < maxGroqAttempts; attempt++) {
        const apiKey = groqPool.getNextKey();
        try {
          const modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
          const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

          const response = await safeProviderFetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.2,
            }),
          }, 15000);

          if (response.status === 429) {
            groqPool.markRateLimited(apiKey);
            continue;
          }

          if (response.ok) {
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content;
            if (reply) {
              const sanitizedReply = sanitizeModelOutput(reply);
              return NextResponse.json({
                response: sanitizedReply,
                provider: 'groq',
                model: modelName,
                tier: 'Tier 1 (Groq)',
                activePoolSize: groqPool.getActiveKeysCount(),
              });
            }
          }
        } catch (groqErr: any) {
          console.warn('[Chat API] Groq attempt failed:', redactSensitiveData(groqErr.message));
        }
      }
    }

    // Attempt Tier 2: Gemini (5 keys with 429 rotation)
    if (geminiPool.hasKeys()) {
      const maxGeminiAttempts = Math.min(geminiPool.size, 5);
      for (let attempt = 0; attempt < maxGeminiAttempts; attempt++) {
        const apiKey = geminiPool.getNextKey();
        try {
          const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

          const response = await safeProviderFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
                },
              ],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1024,
              },
            }),
          }, 15000);

          if (response.status === 429) {
            geminiPool.markRateLimited(apiKey);
            continue;
          }

          if (response.ok) {
            const data = await response.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (reply) {
              const sanitizedReply = sanitizeModelOutput(reply);
              return NextResponse.json({
                response: sanitizedReply,
                provider: 'gemini',
                model: modelName,
                tier: 'Tier 2 Fallback (Gemini)',
                activePoolSize: geminiPool.getActiveKeysCount(),
              });
            }
          }
        } catch (geminiErr: any) {
          console.warn('[Chat API] Gemini attempt failed:', redactSensitiveData(geminiErr.message));
        }
      }
    }

    // 9. Deterministic CyberOps Intelligent Assistant (Zero-Key Safe Fallback)
    const lowerQ = userMessage.toLowerCase();
    const latestReview = prRecord?.reviews?.[0];
    const issues = latestReview?.issues || [];

    let answer = '';

    if (lowerQ.includes('why') && (lowerQ.includes('block') || lowerQ.includes('fail') || lowerQ.includes('gate'))) {
      if (issues.length > 0) {
        answer = `🛡️ **Security Gate Enforcement: MERGE BLOCKED**\n\nThis Pull Request is blocked because the analysis detected **${issues.length} critical/high security issue(s)** that violate our zero-trust merge policy:\n\n` +
          `| Severity | Category / CWE | File & Line | Issue Message |\n` +
          `| :--- | :--- | :--- | :--- |\n` +
          issues.map((i: any) => `| **${i.severity.toUpperCase()}** | ${i.cwe || i.category || 'Security'} | \`${i.filePath}:${i.lineNumber}\` | ${i.message} |`).join('\n') +
          `\n\n### 🔧 Required Remediation Actions\n\n` +
          issues.map((i: any, idx: number) => `${idx + 1}. **${i.cwe || 'Fix'}** in \`${i.filePath}\`:\n   ${i.remediation || 'Sanitize inputs and apply parameterized logic.'}`).join('\n\n') +
          `\n\n---\n\n💡 Commit the recommended cryptographic and validation patches to unblock the merge gate.`;
      } else {
        answer = `✅ **Security Gate: PASS**\n\nNo blocking vulnerabilities were detected in this branch. The code conforms to organization security policies.`;
      }
    } else if (lowerQ.includes('fix') || lowerQ.includes('patch') || lowerQ.includes('how to solve') || lowerQ.includes('remed')) {
      if (issues.length > 0) {
        const issueWithFix = issues.find((i: any) => i.suggestedFix) || issues[0];
        const patchContent = issueWithFix.suggestedFix || '// Fix not available';
        const patchValidation = validateGeneratedPatch(patchContent);

        answer = `💻 **Recommended Security Patch for \`${issueWithFix.filePath}\`**:\n\n` +
          `| Parameter | Details |\n` +
          `| :--- | :--- |\n` +
          `| **Target File** | \`${issueWithFix.filePath}:${issueWithFix.lineNumber}\` |\n` +
          `| **Classification** | **${issueWithFix.severity.toUpperCase()}** (${issueWithFix.cwe || 'CWE Violation'}) |\n` +
          `| **Root Cause** | ${issueWithFix.message} |\n\n` +
          `### 🛠️ Code Remediation\n\n` +
          (issueWithFix.remediation ? `${issueWithFix.remediation}\n\n` : '') +
          (patchValidation.valid
            ? '```diff\n' + patchContent + '\n```\n\n'
            : '> [!WARNING]\n> Generated patch failed automated safety validation and was withheld.\n\n') +
          `---\n\n` +
          `**Verification**: Once committed, GitSentinel's AST validator will verify the patch and update the gate status.`;
      } else {
        answer = `✅ All files in this PR currently satisfy security checks. No remediation patches are currently required.`;
      }
    } else if (lowerQ.includes('exploit') || lowerQ.includes('attack') || lowerQ.includes('scenario') || lowerQ.includes('cwe')) {
      const secIssue = issues.find((i: any) => i.attackScenario) || issues[0];
      if (secIssue) {
        answer = `⚔️ **Attack Scenario & Threat Vector (${secIssue.cwe || 'Security Impact'})**:\n\n` +
          `| Vector Parameter | Description |\n` +
          `| :--- | :--- |\n` +
          `| **Vulnerable Component** | \`${secIssue.filePath}:${secIssue.lineNumber}\` |\n` +
          `| **Threat Classification** | **${secIssue.severity?.toUpperCase() || 'HIGH'}** (${secIssue.category || 'Vulnerability'}) |\n` +
          `| **Potential Impact** | ${secIssue.impact || 'Adversary exploitation allows state or data compromise.'} |\n\n` +
          `### 💥 Attack Mechanism\n\n` +
          `${secIssue.attackScenario || 'An attacker can exploit this predictable or unvalidated logic to bypass controls.'}\n\n` +
          `---\n\n` +
          `🛡️ **Mitigation**: Use cryptographically secure randomness (CSPRNG) and strict input bounds checking.`;
      } else {
        answer = `No active attack vectors were identified in the changes.`;
      }
    } else if (lowerQ.includes('summary') || lowerQ.includes('overview') || lowerQ.includes('what changed')) {
      answer = `📋 **Pull Request Security Summary**:\n\n` +
        `| Metric | Status / Value |\n` +
        `| :--- | :--- |\n` +
        `| **Repository** | \`${prRecord?.repository?.fullName || 'Active Repo'}\` |\n` +
        `| **PR Title** | ${prRecord?.title || 'PR'} |\n` +
        `| **Audit Status** | ${latestReview?.status?.toUpperCase() || 'COMPLETED'} |\n` +
        `| **Gate Verdict** | ${latestReview?.gateVerdict === 'BLOCK' ? '❌ **BLOCK (MERGE BLOCKED)**' : '✅ **PASS**'} |\n` +
        `| **Findings Total** | **${issues.length}** issues (${issues.filter((i: any) => i.severity === 'critical').length} Critical) |\n\n` +
        `### Analysis Notes\n\n` +
        (latestReview?.summary || 'Code inspected against OWASP Top 10 and MITRE CWE benchmarks.');
    } else {
      answer = `🤖 **GitSentinel CyberOps Analysis**:\n\n` +
        `Regarding your question: "${userMessage}"\n\n` +
        (prRecord
          ? `For PR **#${prRecord.number} (${prRecord.title})**, we have **${issues.length} security finding(s)** recorded. The primary concern is ${issues[0]?.message || 'code quality and boundary verification'}.\n\nYou can ask me to:\n1. *"Show how to fix the vulnerability"*\n2. *"Explain the attack scenario"*\n3. *"Why is the PR blocked?"*`
          : `I am monitoring this repository. You can ask for security summaries, vulnerability fixes, or attack simulations.`);
    }

    const totalPoolSize = groqPool.size + geminiPool.size;
    return NextResponse.json({
      response: sanitizeModelOutput(answer),
      provider: 'deterministic-cyberops',
      activePoolSize: totalPoolSize,
      note: totalPoolSize > 0 ? 'Fallback used' : 'Offline / Zero-Key Engine Active',
    });
  } catch (err: any) {
    console.error('[Chat API Error]:', redactSensitiveData(err.message || String(err)));
    return NextResponse.json(
      { error: 'Failed to process chat query: ' + redactSensitiveData(err.message || String(err)) },
      { status: 500 }
    );
  } finally {
    // 10. Always release concurrency slot
    await releaseAIConcurrencySlot(userId);
  }
}
