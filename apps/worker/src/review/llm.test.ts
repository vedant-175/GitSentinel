import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLLMProvider,
  runModelPreflight,
  SUPPORTED_GEMINI_MODELS,
  SUPPORTED_OPENAI_MODELS,
  SUPPORTED_ANTHROPIC_MODELS,
  MockProvider,
} from './llm.js';

test('SUPPORTED_*_MODELS lists contain current official provider models and no invented models', () => {
  // Confirm invented model gemini-2.5-pro is NOT present
  assert.equal((SUPPORTED_GEMINI_MODELS as readonly string[]).includes('gemini-2.5-pro'), false);
  // Confirm official models are present
  assert.equal((SUPPORTED_GEMINI_MODELS as readonly string[]).includes('gemini-2.0-flash'), true);
  assert.equal((SUPPORTED_GEMINI_MODELS as readonly string[]).includes('gemini-1.5-pro'), true);
  assert.equal((SUPPORTED_GEMINI_MODELS as readonly string[]).includes('gemini-1.5-flash'), true);

  assert.equal((SUPPORTED_OPENAI_MODELS as readonly string[]).includes('gpt-4o'), true);
  assert.equal((SUPPORTED_OPENAI_MODELS as readonly string[]).includes('gpt-4o-mini'), true);
  assert.equal((SUPPORTED_OPENAI_MODELS as readonly string[]).includes('o3-mini'), true);

  assert.equal((SUPPORTED_ANTHROPIC_MODELS as readonly string[]).includes('claude-3-7-sonnet-20250219'), true);
  assert.equal((SUPPORTED_ANTHROPIC_MODELS as readonly string[]).includes('claude-3-5-sonnet-20241022'), true);
});

test('getLLMProvider fails when required model environment variables are missing (no hardcoded defaults)', () => {
  const origEnv = { ...process.env };

  try {
    process.env.NODE_ENV = 'production';

    // 1. Gemini without GEMINI_MODEL
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'fake-key';
    delete process.env.GEMINI_MODEL;
    assert.throws(
      () => getLLMProvider(),
      /Missing required environment variable GEMINI_MODEL/
    );

    // 2. Gemini with invalid / invented model
    process.env.GEMINI_MODEL = 'gemini-2.5-pro';
    assert.throws(
      () => getLLMProvider(),
      /Invalid or unsupported GEMINI_MODEL/
    );

    // 3. OpenAI without OPENAI_MODEL
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'fake-key';
    delete process.env.OPENAI_MODEL;
    assert.throws(
      () => getLLMProvider(),
      /Missing required environment variable OPENAI_MODEL/
    );

    // 4. OpenAI with invalid model
    process.env.OPENAI_MODEL = 'gpt-5-invented';
    assert.throws(
      () => getLLMProvider(),
      /Invalid or unsupported OPENAI_MODEL/
    );

    // 5. Anthropic without ANTHROPIC_MODEL
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'fake-key';
    delete process.env.ANTHROPIC_MODEL;
    assert.throws(
      () => getLLMProvider(),
      /Missing required environment variable ANTHROPIC_MODEL/
    );

    // 6. Anthropic with invalid model
    process.env.ANTHROPIC_MODEL = 'claude-4-mythical';
    assert.throws(
      () => getLLMProvider(),
      /Invalid or unsupported ANTHROPIC_MODEL/
    );
  } finally {
    process.env = origEnv;
  }
});

test('runModelPreflight validates model presence and rejects unsupported models', async () => {
  const origEnv = { ...process.env };

  try {
    process.env.NODE_ENV = 'test';

    // Mock in test mode succeeds
    await runModelPreflight('mock');

    // Unsupported model fails preflight
    await assert.rejects(
      async () => runModelPreflight('gemini', 'gemini-2.5-pro'),
      /Invalid or unsupported GEMINI_MODEL/
    );

    await assert.rejects(
      async () => runModelPreflight('openai', 'gpt-fake-model'),
      /Invalid or unsupported OPENAI_MODEL/
    );

    await assert.rejects(
      async () => runModelPreflight('anthropic', 'claude-fake-model'),
      /Invalid or unsupported ANTHROPIC_MODEL/
    );
  } finally {
    process.env = origEnv;
  }
});

test('MockProvider records tokens, latency, promptHash, and model in reviewChunk', async () => {
  const provider = new MockProvider();
  const result = await provider.reviewChunk({
    filePath: 'src/index.ts',
    diff: '@@ -0,0 +1,2 @@\n+const x = 1;\n+console.log(x);',
    chunkIndex: 0,
    totalChunks: 1,
    addedLines: [1, 2],
    validLines: [1, 2],
  });

  assert.ok(result.usage);
  assert.ok(result.usage.inputTokens > 0);
  assert.ok(result.promptHash);
  assert.equal(typeof result.promptHash, 'string');
  assert.equal(result.promptHash.length, 64); // SHA-256 hex string
  assert.equal(result.model, 'mock-provider');
  assert.equal(typeof result.latencyMs, 'number');
});
