import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession, handleAuthError } from '@/lib/auth-helpers';
import { getKeyPool, maskApiKey } from '@ai-reviewer/shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Administrator privileges required' }, { status: 403 });
  }

  try {
    const { provider } = await req.json();

    const normalizedProvider = (provider || 'groq').toLowerCase();

    if (normalizedProvider === 'groq') {
      const groqPool = getKeyPool('groq');
      if (!groqPool.hasKeys()) {
        return NextResponse.json({
          success: false,
          error: 'No Groq API keys configured in environment (GROQ_API_KEYS).',
        }, { status: 400 });
      }

      const activeKey = groqPool.getNextKey();
      const startTime = performance.now();

      // Non-destructive ping using standard chat completion with 1 token
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeKey}`,
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (res.ok) {
        return NextResponse.json({
          success: true,
          provider: 'groq',
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          latencyMs,
          testedKey: maskApiKey(activeKey),
          poolSize: groqPool.size,
          activeKeys: groqPool.getActiveKeysCount(),
        });
      } else {
        const errorText = await res.text();
        return NextResponse.json({
          success: false,
          status: res.status,
          error: `Groq handshake failed (HTTP ${res.status}): ${errorText.slice(0, 100)}`,
        }, { status: 400 });
      }
    } else if (normalizedProvider === 'gemini') {
      const geminiPool = getKeyPool('gemini');
      if (!geminiPool.hasKeys()) {
        return NextResponse.json({
          success: false,
          error: 'No Gemini API keys configured in environment (GEMINI_API_KEYS).',
        }, { status: 400 });
      }

      const activeKey = geminiPool.getNextKey();
      const targetModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const startTime = performance.now();

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${activeKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (res.ok) {
        return NextResponse.json({
          success: true,
          provider: 'gemini',
          model: targetModel,
          latencyMs,
          testedKey: maskApiKey(activeKey),
          poolSize: geminiPool.size,
          activeKeys: geminiPool.getActiveKeysCount(),
        });
      } else {
        const errorText = await res.text();
        return NextResponse.json({
          success: false,
          status: res.status,
          error: `Gemini handshake failed (HTTP ${res.status}): ${errorText.slice(0, 100)}`,
        }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: false,
      error: `Unsupported validation provider: "${provider}". Only configured providers ("groq", "gemini") are testable.`,
    }, { status: 400 });
  } catch (error: any) {
    if (error?.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    return NextResponse.json({
      success: false,
      error: error.message || 'Validation request failed',
    }, { status: 500 });
  }
}
