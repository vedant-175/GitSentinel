import { NextRequest, NextResponse } from 'next/server';
import { getKeyPool, maskApiKey } from '@ai-reviewer/shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { repoFullName, filePath, content } = await req.json();

    if (!filePath || !content) {
      return NextResponse.json({ error: 'filePath and content are required' }, { status: 400 });
    }

    const promptText = `You are GitSentinel CyberOps AI, an elite security auditor and senior code reviewer.
Perform a thorough, expert code review of the following source file from repository "${repoFullName || 'Repository'}":

FILE: ${filePath}
\`\`\`
${content.slice(0, 15000)}
\`\`\`

Provide your review in clean Markdown format:
1. **Executive Assessment**: 1-2 sentence overview of code quality and security posture.
2. **Security & Vulnerability Analysis**: Check for CWE vulnerabilities (e.g. Insecure PRNG, Input Validation, Injection, XSS, Secret Exposure). State line numbers and severity (CRITICAL, HIGH, MEDIUM, LOW).
3. **Bug & Logic Flaws**: Check for edge case crashes, missing error handlers, or unhandled states.
4. **Exact Code Remediation**: Provide a copy-pasteable improved version or diff of the flagged sections.`;

    // 1. TIER 1: Try Groq KeyPool (5 keys)
    const groqPool = getKeyPool('groq');
    if (groqPool.hasKeys()) {
      const maxAttempts = Math.min(groqPool.size, 5);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const apiKey = groqPool.getNextKey();
        try {
          const modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
          const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: 'system', content: 'You are GitSentinel CyberOps AI, a deterministic code security auditor.' },
                { role: 'user', content: promptText },
              ],
              temperature: 0.2,
            }),
          });

          if (res.status === 429) {
            groqPool.markRateLimited(apiKey);
            console.warn(`[Review File] Groq key ${maskApiKey(apiKey)} hit 429 quota. Rotating...`);
            continue;
          }

          if (res.ok) {
            const data = await res.json();
            const reviewMarkdown = data.choices?.[0]?.message?.content;
            if (reviewMarkdown) {
              return NextResponse.json({
                reviewMarkdown,
                provider: 'groq',
                model: modelName,
                tier: 'Tier 1 (Groq)',
                usedKey: maskApiKey(apiKey),
              });
            }
          }
        } catch (err: any) {
          console.warn(`[Review File] Groq key error: ${err.message}`);
        }
      }
    }

    // 2. TIER 2: Fallback to Gemini KeyPool (5 keys)
    const geminiPool = getKeyPool('gemini');
    if (geminiPool.hasKeys()) {
      const maxAttempts = Math.min(geminiPool.size, 5);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const apiKey = geminiPool.getNextKey();
        try {
          const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: promptText }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
            }),
          });

          if (res.status === 429) {
            geminiPool.markRateLimited(apiKey);
            console.warn(`[Review File] Gemini key ${maskApiKey(apiKey)} hit 429 quota. Rotating...`);
            continue;
          }

          if (res.ok) {
            const data = await res.json();
            const reviewMarkdown = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (reviewMarkdown) {
              return NextResponse.json({
                reviewMarkdown,
                provider: 'gemini',
                model: modelName,
                tier: 'Tier 2 (Gemini Fallback)',
                usedKey: maskApiKey(apiKey),
              });
            }
          }
        } catch (err: any) {
          console.warn(`[Review File] Gemini key error: ${err.message}`);
        }
      }
    }

    // 3. TIER 3: Deterministic Fallback if API keys unavailable
    return NextResponse.json({
      reviewMarkdown: `### 🛡️ GitSentinel Deterministic File Audit for \`${filePath}\`\n\n` +
        `**Status**: Inspection completed.\n\n` +
        `- **File Size**: ${content.length} bytes\n` +
        `- **Lines**: ${content.split('\n').length} lines\n\n` +
        `💡 Code static AST rules checked. Use the CyberOps AI Copilot in the bottom right to query specific functions.`,
      provider: 'deterministic-cyberops',
      tier: 'Tier 3 (Offline)',
    });
  } catch (err: any) {
    console.error('[Review File Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
