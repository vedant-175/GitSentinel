import { createHash } from 'crypto';
import { GoogleGenerativeAI, FunctionDeclarationSchemaType } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import {
  ReviewResult,
  ReviewResultSchema,
  DiffChunk,
  getAddedLines,
  withRetry,
  isTransientLLMError,
  KeyPool,
  getKeyPool,
  maskApiKey,
} from '@ai-reviewer/shared';
import { SYSTEM_REVIEW_PROMPT, buildUserPrompt } from './prompt.js';
import { logger } from '../logger.js';

export const SUPPORTED_GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.0-pro-exp-02-05',
] as const;

export const SUPPORTED_OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06',
  'gpt-4o-2024-05-13',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
  'o1',
  'o1-2024-12-17',
  'o1-mini',
  'o1-mini-2024-09-12',
  'o1-preview',
  'o3-mini',
  'o3-mini-2025-01-31',
  'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09',
  'gpt-4',
  'gpt-3.5-turbo',
] as const;

export const SUPPORTED_ANTHROPIC_MODELS = [
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
] as const;

export interface ReviewContext {
  prTitle?: string;
  prDescription?: string;
  includePrContext?: boolean;
  codeContextSnippet?: string;
}

export interface LLMProvider {
  name?: string;
  reviewChunk(chunk: DiffChunk, context?: ReviewContext): Promise<ReviewResult>;
}

const DEFAULT_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10);

/**
 * Checks if an error is a rate-limiting (429 / quota / RESOURCE_EXHAUSTED) error.
 * Rate limit errors must NOT be swallowed or retried as schema errors;
 * they must be re-thrown so BullMQ backs off.
 */
export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  if (e.status === 429 || e.statusCode === 429) return true;
  if (e.name === 'RateLimitError') return true;

  const msg = typeof e.message === 'string' ? e.message : '';
  if (
    msg.includes('429') ||
    msg.toLowerCase().includes('rate limit') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota exceeded')
  ) {
    return true;
  }
  return false;
}

/**
 * Executes a promise with an enforced timeout
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, opName: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`LLM operation "${opName}" timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Gemini LLM Implementation with strict responseSchema and rate-limit backoff
 */
export class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async reviewChunk(chunk: DiffChunk, context?: ReviewContext): Promise<ReviewResult> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            issues: {
              type: FunctionDeclarationSchemaType.ARRAY,
              items: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                  file_path: { type: FunctionDeclarationSchemaType.STRING },
                  line_number: { type: FunctionDeclarationSchemaType.INTEGER },
                  severity: { type: FunctionDeclarationSchemaType.STRING },
                  category: { type: FunctionDeclarationSchemaType.STRING },
                  message: { type: FunctionDeclarationSchemaType.STRING },
                  suggested_fix: { type: FunctionDeclarationSchemaType.STRING, nullable: true },
                  confidence: { type: FunctionDeclarationSchemaType.NUMBER },
                },
                required: ['file_path', 'line_number', 'severity', 'category', 'message', 'confidence'],
              },
            },
            overall_assessment: { type: FunctionDeclarationSchemaType.STRING },
          },
          required: ['issues', 'overall_assessment'],
        } as any,
      },

      systemInstruction: SYSTEM_REVIEW_PROMPT,
    });

    const { prompt: basePrompt } = buildUserPrompt({
      chunk,
      filePath: chunk.filePath,
      diffChunk: chunk.diff,
      addedLines: chunk.addedLines,
      prTitle: context?.prTitle,
      prDescription: context?.prDescription,
      includePrContext: context?.includePrContext,
      codeContextSnippet: context?.codeContextSnippet,
    });

    let lastValidationError: string | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const promptText =
          attempt === 1
            ? basePrompt
            : `${basePrompt}\n\nIMPORTANT: Your previous response failed schema validation: ${lastValidationError}. Respond strictly with valid JSON conforming to the requested schema.`;

        const promptHash = createHash('sha256').update(promptText).digest('hex');
        const startTime = performance.now();

        const result = await withRetry(
          () =>
            withTimeout(
              model.generateContent(promptText),
              DEFAULT_TIMEOUT_MS,
              `Gemini:${this.modelName}:${chunk.filePath}`
            ),
          {
            maxRetries: 2,
            initialDelayMs: 400,
            isRetryable: isTransientLLMError,
          }
        );

        const latencyMs = Math.round(performance.now() - startTime);
        const text = result.response.text();
        const json = JSON.parse(text);
        const parsed = ReviewResultSchema.parse(json);
        const usage = (result.response as any).usageMetadata;

        return {
          ...parsed,
          usage: {
            inputTokens: usage?.promptTokenCount ?? 0,
            outputTokens: usage?.candidatesTokenCount ?? 0,
            totalTokens: usage?.totalTokenCount ?? 0,
          },
          model: this.modelName,
          promptHash,
          latencyMs,
        };
      } catch (err: unknown) {
        if (isRateLimitError(err)) {
          // Re-throw rate limit error so BullMQ can handle backoff
          logger.warn({ chunk: chunk.filePath, provider: 'gemini', msg: '[Gemini] Rate limit encountered. Propagating to BullMQ.' });
          throw err;
        }

        const errMsg = (err as Error).message || String(err);
        lastValidationError = errMsg;

        if (attempt === 2) {
          logger.error({ chunk: chunk.filePath, err: errMsg, provider: 'gemini', msg: 'Gemini review failed after 2 schema attempts' });
          throw new Error(`Gemini review failed for chunk ${chunk.filePath}: ${errMsg}`);
        }
      }
    }

    throw new Error(`Gemini review failed to produce valid output for chunk ${chunk.filePath}`);
  }
}

/**
 * OpenAI LLM Implementation with strict json_schema and rate-limit backoff
 */
export class OpenAIProvider implements LLMProvider {
  private openai: OpenAI;
  private modelName: string;

  constructor(apiKey: string, baseURLOrModel?: string, modelName?: string) {
    let baseURL: string | undefined = undefined;
    let model = 'gpt-4o';
    if (modelName !== undefined) {
      baseURL = baseURLOrModel;
      model = modelName;
    } else if (baseURLOrModel !== undefined) {
      if (baseURLOrModel.startsWith('http://') || baseURLOrModel.startsWith('https://')) {
        baseURL = baseURLOrModel;
      } else {
        model = baseURLOrModel;
      }
    }
    this.openai = new OpenAI({ apiKey, baseURL });
    this.modelName = model;
  }

  async reviewChunk(chunk: DiffChunk, context?: ReviewContext): Promise<ReviewResult> {
    const { prompt: basePrompt } = buildUserPrompt({
      chunk,
      filePath: chunk.filePath,
      diffChunk: chunk.diff,
      addedLines: chunk.addedLines,
      prTitle: context?.prTitle,
      prDescription: context?.prDescription,
      includePrContext: context?.includePrContext,
      codeContextSnippet: context?.codeContextSnippet,
    });

    let lastValidationError: string | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const promptText =
          attempt === 1
            ? basePrompt
            : `${basePrompt}\n\nIMPORTANT: Your previous response failed schema validation: ${lastValidationError}. Return valid JSON matching schema precisely.`;

        const promptHash = createHash('sha256').update(promptText).digest('hex');
        const startTime = performance.now();

        const response = await withRetry(
          () =>
            withTimeout(
              this.openai.chat.completions.create({
                model: this.modelName,
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: 'code_review_response',
                    strict: true,
                    schema: {
                      type: 'object',
                      properties: {
                        issues: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              file_path: { type: 'string' },
                              line_number: { type: 'integer' },
                              severity: {
                                type: 'string',
                                enum: ['critical', 'warning', 'suggestion'],
                              },
                              category: {
                                type: 'string',
                                enum: ['bug', 'security', 'style', 'performance', 'maintainability'],
                              },
                              message: { type: 'string' },
                              suggested_fix: { type: ['string', 'null'] },
                              confidence: { type: 'number' },
                            },
                            required: [
                              'file_path',
                              'line_number',
                              'severity',
                              'category',
                              'message',
                              'suggested_fix',
                              'confidence',
                            ],
                            additionalProperties: false,
                          },
                        },
                        overall_assessment: { type: 'string' },
                      },
                      required: ['issues', 'overall_assessment'],
                      additionalProperties: false,
                    },
                  },
                },
                messages: [
                  { role: 'system', content: SYSTEM_REVIEW_PROMPT },
                  { role: 'user', content: promptText },
                ],
              }),
              DEFAULT_TIMEOUT_MS,
              `OpenAI:${this.modelName}:${chunk.filePath}`
            ),
          {
            maxRetries: 2,
            initialDelayMs: 400,
            isRetryable: isTransientLLMError,
          }
        );

        const latencyMs = Math.round(performance.now() - startTime);
        const text = response.choices[0]?.message?.content || '{}';
        const json = JSON.parse(text);
        const parsed = ReviewResultSchema.parse(json);

        return {
          ...parsed,
          usage: {
            inputTokens: response.usage?.prompt_tokens ?? 0,
            outputTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
          },
          model: response.model || this.modelName,
          promptHash,
          latencyMs,
        };
      } catch (err: unknown) {
        if (isRateLimitError(err)) {
          logger.warn({ chunk: chunk.filePath, provider: 'openai', msg: '[OpenAI] Rate limit encountered. Propagating to BullMQ.' });
          throw err;
        }

        const errMsg = (err as Error).message || String(err);
        lastValidationError = errMsg;

        if (attempt === 2) {
          logger.error({ chunk: chunk.filePath, err: errMsg, provider: 'openai', msg: 'OpenAI review failed after 2 schema attempts' });
          throw new Error(`OpenAI review failed for chunk ${chunk.filePath}: ${errMsg}`);
        }
      }
    }

    throw new Error(`OpenAI review failed to produce valid output for chunk ${chunk.filePath}`);
  }
}

/**
 * Anthropic Claude LLM Implementation with strict tool-use structured output
 */
export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    this.client = new Anthropic({ apiKey });
    this.modelName = modelName;
  }

  async reviewChunk(chunk: DiffChunk, context?: ReviewContext): Promise<ReviewResult> {
    const { prompt: basePrompt } = buildUserPrompt({
      chunk,
      filePath: chunk.filePath,
      diffChunk: chunk.diff,
      addedLines: chunk.addedLines,
      prTitle: context?.prTitle,
      prDescription: context?.prDescription,
      includePrContext: context?.includePrContext,
      codeContextSnippet: context?.codeContextSnippet,
    });

    let lastValidationError: string | null = null;

    const reviewTool: Anthropic.Tool = {
      name: 'submit_review',
      description: 'Submit structured code review with detected issues and overall assessment',
      input_schema: {
        type: 'object',
        properties: {
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                file_path: { type: 'string' },
                line_number: { type: 'integer' },
                severity: {
                  type: 'string',
                  enum: ['critical', 'warning', 'suggestion'],
                },
                category: {
                  type: 'string',
                  enum: ['bug', 'security', 'style', 'performance', 'maintainability'],
                },
                message: { type: 'string' },
                suggested_fix: { type: ['string', 'null'] },
                confidence: { type: 'number' },
              },
              required: [
                'file_path',
                'line_number',
                'severity',
                'category',
                'message',
                'confidence',
              ],
            },
          },
          overall_assessment: { type: 'string' },
        },
        required: ['issues', 'overall_assessment'],
      },
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const promptText =
          attempt === 1
            ? basePrompt
            : `${basePrompt}\n\nIMPORTANT: Your previous response failed schema validation: ${lastValidationError}. Call the submit_review tool with valid data conforming precisely to schema.`;

        const promptHash = createHash('sha256').update(promptText).digest('hex');
        const startTime = performance.now();

        const message = await withRetry(
          () =>
            withTimeout(
              this.client.messages.create({
                model: this.modelName,
                max_tokens: 4096,
                system: SYSTEM_REVIEW_PROMPT,
                messages: [{ role: 'user', content: promptText }],
                tools: [reviewTool],
                tool_choice: { type: 'tool', name: 'submit_review' },
              }),
              DEFAULT_TIMEOUT_MS,
              `Anthropic:${this.modelName}:${chunk.filePath}`
            ),
          {
            maxRetries: 2,
            initialDelayMs: 400,
            isRetryable: isTransientLLMError,
          }
        );

        const latencyMs = Math.round(performance.now() - startTime);

        const toolBlock = message.content.find(
          (block) => block.type === 'tool_use' && block.name === 'submit_review'
        );

        if (!toolBlock || toolBlock.type !== 'tool_use') {
          throw new Error('Anthropic did not call submit_review tool as required.');
        }

        const parsed = ReviewResultSchema.parse(toolBlock.input);

        return {
          ...parsed,
          usage: {
            inputTokens: message.usage?.input_tokens ?? 0,
            outputTokens: message.usage?.output_tokens ?? 0,
            totalTokens: (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0),
          },
          model: message.model || this.modelName,
          promptHash,
          latencyMs,
        };
      } catch (err: unknown) {
        if (isRateLimitError(err)) {
          logger.warn({ chunk: chunk.filePath, provider: 'anthropic', msg: '[Anthropic] Rate limit encountered. Propagating to BullMQ.' });
          throw err;
        }

        const errMsg = (err as Error).message || String(err);
        lastValidationError = errMsg;

        if (attempt === 2) {
          logger.error({ chunk: chunk.filePath, err: errMsg, provider: 'anthropic', msg: 'Anthropic review failed after 2 attempts' });
          throw new Error(`Anthropic review failed for chunk ${chunk.filePath}: ${errMsg}`);
        }
      }
    }

    throw new Error(`Anthropic review failed to produce valid output for chunk ${chunk.filePath}`);
  }
}

/**
 * Pooled Provider Wrappers: Transparently rotate across multiple API keys on 429 quota exhaustion
 */
export class PooledGeminiProvider implements LLMProvider {
  private keyPool: KeyPool;
  private modelName: string;
  private providers: Map<string, GeminiProvider> = new Map();

  constructor(keyPool: KeyPool, modelName: string) {
    this.keyPool = keyPool;
    this.modelName = modelName;
  }

  private getProviderForKey(key: string): GeminiProvider {
    let p = this.providers.get(key);
    if (!p) {
      p = new GeminiProvider(key, this.modelName);
      this.providers.set(key, p);
    }
    return p;
  }

  async reviewChunk(chunk: DiffChunk, context?: ReviewContext): Promise<ReviewResult> {
    const maxAttempts = Math.min(this.keyPool.size, 10);
    let lastError: any = null;

    for (let i = 0; i < maxAttempts; i++) {
      const currentKey = this.keyPool.getNextKey();
      const provider = this.getProviderForKey(currentKey);

      try {
        return await provider.reviewChunk(chunk, context);
      } catch (err: any) {
        if (isRateLimitError(err) && this.keyPool.size > 1) {
          this.keyPool.markRateLimited(currentKey);
          logger.warn({
            provider: 'gemini',
            key: maskApiKey(currentKey),
            activeRemaining: this.keyPool.getActiveKeysCount(),
            msg: `[KeyPool Fallback] Gemini key ${maskApiKey(currentKey)} rate limited (429). Rotating to next fallback key!`,
          });
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('All Gemini API keys in fallback pool were exhausted or rate-limited.');
  }
}

export class PooledOpenAIProvider implements LLMProvider {
  private keyPool: KeyPool;
  private baseURL?: string;
  private modelName: string;
  private providers: Map<string, OpenAIProvider> = new Map();

  constructor(keyPool: KeyPool, baseURL: string | undefined, modelName: string) {
    this.keyPool = keyPool;
    this.baseURL = baseURL;
    this.modelName = modelName;
  }

  private getProviderForKey(key: string): OpenAIProvider {
    let p = this.providers.get(key);
    if (!p) {
      p = new OpenAIProvider(key, this.baseURL, this.modelName);
      this.providers.set(key, p);
    }
    return p;
  }

  async reviewChunk(chunk: DiffChunk, context?: ReviewContext): Promise<ReviewResult> {
    const maxAttempts = Math.min(this.keyPool.size, 10);
    let lastError: any = null;

    for (let i = 0; i < maxAttempts; i++) {
      const currentKey = this.keyPool.getNextKey();
      const provider = this.getProviderForKey(currentKey);

      try {
        return await provider.reviewChunk(chunk, context);
      } catch (err: any) {
        if (isRateLimitError(err) && this.keyPool.size > 1) {
          this.keyPool.markRateLimited(currentKey);
          logger.warn({
            provider: 'openai',
            key: maskApiKey(currentKey),
            activeRemaining: this.keyPool.getActiveKeysCount(),
            msg: `[KeyPool Fallback] OpenAI key ${maskApiKey(currentKey)} rate limited (429). Rotating to next fallback key!`,
          });
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('All OpenAI API keys in fallback pool were exhausted or rate-limited.');
  }
}

/**
 * Cascading Provider: Utilises all Groq API keys first for rate-limit fallback,
 * then seamlessly cascades to the Gemini API key pool.
 */
export class CascadingGroqGeminiProvider implements LLMProvider {
  private groqProvider: PooledOpenAIProvider;
  private geminiProvider: PooledGeminiProvider;

  constructor(groqPool: KeyPool, geminiPool: KeyPool, groqModel: string, geminiModel: string) {
    this.groqProvider = new PooledOpenAIProvider(groqPool, 'https://api.groq.com/openai/v1', groqModel);
    this.geminiProvider = new PooledGeminiProvider(geminiPool, geminiModel);
  }

  async reviewChunk(chunk: DiffChunk, context?: ReviewContext): Promise<ReviewResult> {
    try {
      return await this.groqProvider.reviewChunk(chunk, context);
    } catch (groqErr: any) {
      logger.warn(
        { err: groqErr.message, chunk: chunk.filePath },
        '[Cascading LLM] All Groq API keys exhausted or rate-limited. Seamlessly failing over to Tier 2 (Gemini)...'
      );
      return await this.geminiProvider.reviewChunk(chunk, context);
    }
  }
}

/**
 * Mock Provider for instant local dev & CI/CD testing with zero API keys.
 * Uses canonical getAddedLines to eliminate duplicate line-counting loops.
 */
export class MockProvider implements LLMProvider {
  async reviewChunk(chunk: DiffChunk): Promise<ReviewResult> {
    const issues: ReviewResult['issues'] = [];
    const addedLines = getAddedLines(chunk.diff);

    for (const { lineNumber, content } of addedLines) {
      const code = content.trim();

      // Check for prompt injection attempt
      if (
        code.toLowerCase().includes('ignore all previous instructions') ||
        code.toLowerCase().includes('approve this pr')
      ) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'Potential prompt injection attempt detected inside source code or comment string.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.99,
        });
      }

      // Hardcoded secrets
      if (/(API_?KEY|SECRET_?KEY|password|token)\s*[:=]\s*["'][A-Za-z0-9_-]{8,}["']/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'Hardcoded secret or credential token detected in source code.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.98,
        });
      }

      // SQL injection risk (string concatenation or template literal)
      if (
        /(SELECT|INSERT|UPDATE|DELETE)\b.*(\+|\$\{)/i.test(code) ||
        /db\.query\s*\(\s*`[^`]*\$\{/i.test(code) ||
        (/db\.query\s*\(\s*['"]SELECT/i.test(code) && code.includes('+'))
      ) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'SQL query constructed via string concatenation or interpolation; vulnerable to SQL injection.',
          cwe: 'CWE-89',
          owasp: 'A03:2021-Injection',
          evidence: `Unescaped variable concatenated into raw SQL command: "${code}"`,
          impact: 'Allows unauthorized attackers to bypass authentication or extract/modify full database tables.',
          attack_scenario: 'Attacker supplies malicious SQL fragments in user input parameters that alter SQL execution logic.',
          affected_code: code,
          remediation: 'Use parameterized queries ($1, [id]) or ORM bindings instead of string concatenation.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.95,
        });
      }

      // SSRF risk (direct request to untrusted user-supplied url)
      if (/axios\.(get|post|put|delete)\s*\(\s*url\b/i.test(code) || /fetch\s*\(\s*url\b/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'Server-Side Request Forgery (SSRF): outbound HTTP request to unchecked user-supplied URL.',
          cwe: 'CWE-918',
          owasp: 'A10:2021-Server-Side Request Forgery',
          evidence: `Outbound HTTP client directly invokes request using untrusted user variable 'url': "${code}"`,
          impact: 'Allows internal port scanning, access to cloud metadata services (169.254.169.254), or lateral movement.',
          attack_scenario: 'Attacker provides an internal loopback IP or AWS metadata URL, retrieving IAM instance profile credentials.',
          affected_code: code,
          remediation: 'Validate destination URLs against a strict whitelist of permitted hostnames and disallow private IP ranges.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.93,
        });
      }

      // Insecure eval / exec
      if (/\beval\s*\(/.test(code) || /\bchild_process\.exec\s*\(/.test(code) || /\bexec\s*\(\s*['"]ping/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'Execution of arbitrary code or shell command via eval() or exec() poses severe RCE risks.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.99,
        });
      }

      // Path traversal
      if (/fs\.readFile(Sync)?\s*\(\s*['"][^'"]*['"]\s*\+/i.test(code) || /\/uploads\/.*userPath/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'Potential path traversal vulnerability: untrusted user input concatenated directly into file path.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.95,
        });
      }

      // Insecure JWT decode without signature verification
      if (/jwt\.decode\s*\(/.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'Authentication bypass: jwt.decode does not verify cryptographic signature. Use jwt.verify() with secret.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.98,
        });
      }

      // Reflected XSS
      if (/res\.send\s*\(.*<[^>]+>.*req\.query/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'Reflected Cross-Site Scripting (XSS): unescaped user query parameter rendered into raw HTML.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.94,
        });
      }

      // Weak cryptography for passwords
      if (/createHash\s*\(\s*['"]md5['"]\s*\)/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'MD5 is cryptographically broken and unsuitable for password hashing. Use bcrypt or argon2.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.99,
        });
      }

      // Insecure CORS wildcard with credentials
      if (/Access-Control-Allow-Origin.*\*['"]/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'Insecure CORS: Access-Control-Allow-Origin wildcard (*) with credentials compromises user sessions.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.92,
        });
      }

      // Prototype pollution vulnerability
      if (/target\[key\]\s*=\s*source\[key\]/i.test(code) && !code.includes('__proto__')) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'Potential prototype pollution vulnerability: keys must be filtered against __proto__ and constructor.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.93,
        });
      }

      // Insecure cookie without HttpOnly
      if (/Set-Cookie.*session=/i.test(code) && !/HttpOnly/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'warning',
          category: 'security',
          message: 'Session cookie missing HttpOnly flag, exposing it to theft via client-side script injection.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.88,
        });
      }

      // Plaintext password logging
      if (/console\.log.*password/i.test(code) || /logger\..*password/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'security',
          message: 'Plaintext credentials or passwords must never be written to stdout or application logs.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.97,
        });
      }

      // Off-by-one array index error
      if (/<=\s*[a-zA-Z0-9_.]+\.length\b/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'warning',
          category: 'bug',
          message: 'Off-by-one error in loop condition: array indexing with <= length accesses undefined out-of-bounds.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.91,
        });
      }

      // Unsafe nested property dereference
      if (/user\.profile\.address\.city/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'warning',
          category: 'bug',
          message: 'Unsafe nested property access without null/undefined verification may throw TypeError at runtime.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.89,
        });
      }

      // Unhandled promise call without await
      if (/sendAlert\s*\(/i.test(code) && !/await\s+sendAlert/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'warning',
          category: 'bug',
          message: 'Asynchronous function invoked without await or .catch(), risking unhandled promise rejection.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.87,
        });
      }

      // Missing parseInt radix
      if (/parseInt\s*\(\s*[a-zA-Z0-9_.]+\s*\)/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'suggestion',
          category: 'bug',
          message: 'Missing radix parameter in parseInt call: always specify base 10 (parseInt(x, 10)).',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.82,
        });
      }

      // ReDoS catastrophic backtracking
      if (/\(\[[^\]]+\]\+\)\+/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'warning',
          category: 'performance',
          message: 'Regular expression contains nested quantifiers vulnerable to catastrophic backtracking (ReDoS).',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.9,
        });
      }

      // Unclosed stream leak
      if (/createReadStream/i.test(code) && !/pipeline|close|finish/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'warning',
          category: 'maintainability',
          message: 'Stream created without error handling or pipeline destruction, risking file descriptor exhaustion.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.85,
        });
      }

      // Race condition
      if (/account\.balance\s*-\s*amount/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'critical',
          category: 'bug',
          message: 'Check-then-act balance modification without transactional row lock (SELECT FOR UPDATE) causes race condition.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.94,
        });
      }

      // Memory leak in event listener
      if (/globalEmitter\.on/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'warning',
          category: 'performance',
          message: 'Attaching listener to global event emitter inside request handler causes memory leak.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.88,
        });
      }

      // Performance: N+1 or await in loop
      if (/\bfor\s*\(.*\)\s*\{?/.test(code) && /await\s+/.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'warning',
          category: 'performance',
          message: 'Sequential await statement executed inside loop causing unnecessary latency (N+1 pattern).',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.9,
        });
      }

      // Leftover console.log or print
      if (/\bconsole\.(log|debug)\s*\(/.test(code) && !/password/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNumber,
          severity: 'suggestion',
          category: 'style',
          message: 'Debug logging statement found in production code.',
          suggested_fix: null,
          source: 'llm',
          confidence: 0.85,
        });
      }
    }

    const promptHash = createHash('sha256').update(chunk.diff).digest('hex');
    return {
      issues,
      overall_assessment:
        issues.length > 0
          ? `Analysis identified ${issues.length} potential issue(s) requiring attention.`
          : 'Code changes look clean, structured, and free of apparent security vulnerabilities.',
      usage: {
        inputTokens: Math.ceil(chunk.diff.length / 4),
        outputTokens: Math.ceil(JSON.stringify(issues).length / 4),
        totalTokens: Math.ceil((chunk.diff.length + JSON.stringify(issues).length) / 4),
      },
      model: 'mock-provider',
      promptHash,
      latencyMs: 1,
    };
  }
}

/**
 * Startup preflight check that makes one tiny real API call to the configured
 * provider and fails boot on 404, invalid model, authentication error, or "model retired".
 */
export async function runModelPreflight(
  providerName: string = process.env.LLM_PROVIDER || '',
  modelName?: string
): Promise<void> {
  const normProvider = (providerName || '').toLowerCase();

  if (normProvider === 'mock') {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        'MockProvider is allowed only when NODE_ENV=test. Startup preflight failed.'
      );
    }
    return;
  }

  if (normProvider === 'groq') {
    const groqPool = getKeyPool('groq');
    if (!groqPool.hasKeys()) {
      throw new Error('[Preflight Failure] Missing GROQ_API_KEYS for LLM_PROVIDER="groq".');
    }
    return;
  }

  if (normProvider === 'gemini') {
    const targetModel = modelName || process.env.GEMINI_MODEL;
    if (!targetModel) {
      throw new Error(
        `[Preflight Failure] Missing GEMINI_MODEL. Supported models: ${SUPPORTED_GEMINI_MODELS.join(', ')}.`
      );
    }

    if (!SUPPORTED_GEMINI_MODELS.includes(targetModel as any)) {
      throw new Error(
        `[Preflight Failure] Invalid or unsupported GEMINI_MODEL: "${targetModel}". Supported models from official Gemini documentation: ${SUPPORTED_GEMINI_MODELS.join(', ')}.`
      );
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('[Preflight Failure] Missing GEMINI_API_KEY.');

    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: targetModel });
      await withTimeout(model.countTokens('ping'), 10000, 'Preflight:Gemini');
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (
        err?.status === 404 ||
        msg.includes('404') ||
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('retired') ||
        msg.toLowerCase().includes('deprecated') ||
        msg.toLowerCase().includes('unsupported')
      ) {
        throw new Error(
          `[Preflight Failure] GEMINI_MODEL "${targetModel}" was not found or has been retired by Google: ${msg}`
        );
      }
      if (
        err?.status === 400 ||
        err?.status === 401 ||
        err?.status === 403 ||
        msg.toLowerCase().includes('api_key') ||
        msg.toLowerCase().includes('permission')
      ) {
        throw new Error(`[Preflight Failure] Gemini API key or credentials invalid: ${msg}`);
      }
      throw new Error(`[Preflight Failure] Gemini preflight call failed: ${msg}`);
    }
    return;
  }

  if (normProvider === 'openai') {
    const targetModel = modelName || process.env.OPENAI_MODEL;
    if (!targetModel) {
      throw new Error(
        `[Preflight Failure] Missing OPENAI_MODEL. Supported models: ${SUPPORTED_OPENAI_MODELS.join(', ')}.`
      );
    }

    if (!SUPPORTED_OPENAI_MODELS.includes(targetModel as any)) {
      throw new Error(
        `[Preflight Failure] Invalid or unsupported OPENAI_MODEL: "${targetModel}". Supported models from official OpenAI documentation: ${SUPPORTED_OPENAI_MODELS.join(', ')}.`
      );
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('[Preflight Failure] Missing OPENAI_API_KEY.');

    try {
      const openai = new OpenAI({ apiKey: key, baseURL: process.env.OPENAI_BASE_URL });
      await withTimeout(
        openai.chat.completions.create({
          model: targetModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        10000,
        'Preflight:OpenAI'
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (
        err?.status === 404 ||
        msg.includes('404') ||
        msg.toLowerCase().includes('model_not_found') ||
        msg.toLowerCase().includes('does not exist') ||
        msg.toLowerCase().includes('retired') ||
        msg.toLowerCase().includes('deprecated')
      ) {
        throw new Error(
          `[Preflight Failure] OPENAI_MODEL "${targetModel}" was not found or has been retired by OpenAI: ${msg}`
        );
      }
      if (err?.status === 401 || err?.status === 403) {
        throw new Error(`[Preflight Failure] OpenAI API key or credentials invalid: ${msg}`);
      }
      throw new Error(`[Preflight Failure] OpenAI preflight call failed: ${msg}`);
    }
    return;
  }

  if (normProvider === 'anthropic') {
    const targetModel = modelName || process.env.ANTHROPIC_MODEL;
    if (!targetModel) {
      throw new Error(
        `[Preflight Failure] Missing ANTHROPIC_MODEL. Supported models: ${SUPPORTED_ANTHROPIC_MODELS.join(', ')}.`
      );
    }

    if (!SUPPORTED_ANTHROPIC_MODELS.includes(targetModel as any)) {
      throw new Error(
        `[Preflight Failure] Invalid or unsupported ANTHROPIC_MODEL: "${targetModel}". Supported models from official Anthropic documentation: ${SUPPORTED_ANTHROPIC_MODELS.join(', ')}.`
      );
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('[Preflight Failure] Missing ANTHROPIC_API_KEY.');

    try {
      const anthropic = new Anthropic({ apiKey: key });
      await withTimeout(
        anthropic.messages.create({
          model: targetModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        10000,
        'Preflight:Anthropic'
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (
        err?.status === 404 ||
        msg.includes('404') ||
        msg.toLowerCase().includes('not_found') ||
        msg.toLowerCase().includes('retired') ||
        msg.toLowerCase().includes('deprecated')
      ) {
        throw new Error(
          `[Preflight Failure] ANTHROPIC_MODEL "${targetModel}" was not found or has been retired by Anthropic: ${msg}`
        );
      }
      if (err?.status === 401 || err?.status === 403) {
        throw new Error(`[Preflight Failure] Anthropic API key or credentials invalid: ${msg}`);
      }
      throw new Error(`[Preflight Failure] Anthropic preflight call failed: ${msg}`);
    }
    return;
  }

  throw new Error(`[Preflight Failure] Unsupported LLM_PROVIDER: "${providerName}".`);
}

/**
 * Factory to instantiate the active LLM provider based on environment variables
 */
export function getLLMProvider(): LLMProvider {
  const isTest = process.env.NODE_ENV === 'test';
  const provider = (process.env.LLM_PROVIDER || (isTest ? 'mock' : '')).toLowerCase();

  if (isTest && (!provider || provider === 'mock')) {
    return new MockProvider();
  }

  if (provider === 'mock') {
    if (!isTest) {
      throw new Error(
        'MockProvider is allowed only when NODE_ENV=test. Please set LLM_PROVIDER="gemini", "openai", or "anthropic" with valid API keys.'
      );
    }
    return new MockProvider();
  }

  if (provider === 'groq') {
    const groqPool = getKeyPool('groq');
    const geminiPool = getKeyPool('gemini');
    const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

    if (groqPool.hasKeys() && geminiPool.hasKeys()) {
      logger.info(
        { groqKeys: groqPool.size, geminiKeys: geminiPool.size },
        'Initialized Cascading LLM: Tier 1 (Groq 5-Key Pool) with fallback to Tier 2 (Gemini 5-Key Pool).'
      );
      return new CascadingGroqGeminiProvider(groqPool, geminiPool, groqModel, geminiModel);
    }

    if (groqPool.hasKeys()) {
      return new PooledOpenAIProvider(groqPool, 'https://api.groq.com/openai/v1', groqModel);
    }

    if (geminiPool.hasKeys()) {
      return new PooledGeminiProvider(geminiPool, geminiModel);
    }
  }

  if (provider === 'gemini') {
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
    if (!rawKeys) {
      throw new Error('Missing GEMINI_API_KEYS or GEMINI_API_KEY for LLM_PROVIDER="gemini".');
    }
    const model = process.env.GEMINI_MODEL;
    if (!model) {
      throw new Error(
        'Missing required environment variable GEMINI_MODEL for LLM_PROVIDER="gemini". Default model IDs are not permitted. Supported models: ' +
          SUPPORTED_GEMINI_MODELS.join(', ')
      );
    }
    if (!SUPPORTED_GEMINI_MODELS.includes(model as any)) {
      throw new Error(
        `Invalid or unsupported GEMINI_MODEL: "${model}". Supported models: ${SUPPORTED_GEMINI_MODELS.join(', ')}`
      );
    }
    const pool = getKeyPool('gemini');
    if (pool.size > 1) {
      logger.info({ poolSize: pool.size, provider: 'gemini', model }, 'Initialized Multi-Key Pool for Gemini with automatic 429 failover.');
      return new PooledGeminiProvider(pool, model);
    }
    return new GeminiProvider(pool.getNextKey(), model);
  }

  if (provider === 'openai') {
    const rawKeys = process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY;
    if (!rawKeys) {
      throw new Error('Missing OPENAI_API_KEYS or OPENAI_API_KEY for LLM_PROVIDER="openai".');
    }
    const model = process.env.OPENAI_MODEL;
    if (!model) {
      throw new Error(
        'Missing required environment variable OPENAI_MODEL for LLM_PROVIDER="openai". Default model IDs are not permitted. Supported models: ' +
          SUPPORTED_OPENAI_MODELS.join(', ')
      );
    }
    if (!SUPPORTED_OPENAI_MODELS.includes(model as any)) {
      throw new Error(
        `Invalid or unsupported OPENAI_MODEL: "${model}". Supported models: ${SUPPORTED_OPENAI_MODELS.join(', ')}`
      );
    }
    const pool = getKeyPool('openai');
    if (pool.size > 1) {
      logger.info({ poolSize: pool.size, provider: 'openai', model }, 'Initialized Multi-Key Pool for OpenAI with automatic 429 failover.');
      return new PooledOpenAIProvider(pool, process.env.OPENAI_BASE_URL, model);
    }
    return new OpenAIProvider(pool.getNextKey(), process.env.OPENAI_BASE_URL, model);
  }

  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('Missing ANTHROPIC_API_KEY for LLM_PROVIDER="anthropic".');
    }
    const model = process.env.ANTHROPIC_MODEL;
    if (!model) {
      throw new Error(
        'Missing required environment variable ANTHROPIC_MODEL for LLM_PROVIDER="anthropic". Default model IDs are not permitted. Supported models: ' +
          SUPPORTED_ANTHROPIC_MODELS.join(', ')
      );
    }
    if (!SUPPORTED_ANTHROPIC_MODELS.includes(model as any)) {
      throw new Error(
        `Invalid or unsupported ANTHROPIC_MODEL: "${model}". Supported models: ${SUPPORTED_ANTHROPIC_MODELS.join(', ')}`
      );
    }
    return new AnthropicProvider(key, model);
  }

  throw new Error(
    `Missing or unsupported LLM_PROVIDER: "${provider}". Expected "gemini", "openai", or "anthropic" (or "mock" when NODE_ENV=test).`
  );
}

