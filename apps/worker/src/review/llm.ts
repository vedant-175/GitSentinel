import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { ReviewResult, ReviewResultSchema, DiffChunk } from '@ai-reviewer/shared';
import { SYSTEM_REVIEW_PROMPT, buildUserPrompt } from './prompt.js';

export interface LLMProvider {
  reviewChunk(chunk: DiffChunk): Promise<ReviewResult>;
}

/**
 * Gemini LLM Implementation
 */
export class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string = 'gemini-1.5-flash') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async reviewChunk(chunk: DiffChunk): Promise<ReviewResult> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
      },
      systemInstruction: SYSTEM_REVIEW_PROMPT,
    });

    const userPrompt = buildUserPrompt(chunk.filePath, chunk.diff, chunk.addedLines);
    
    // Attempt with 1 retry on malformed JSON
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const promptText = attempt === 1 
          ? userPrompt 
          : `${userPrompt}\n\nIMPORTANT: Your previous response was invalid JSON. Respond strictly with raw valid JSON matching the requested schema. No markdown formatting.`;

        const result = await model.generateContent(promptText);
        const text = result.response.text();
        const json = JSON.parse(text);
        return ReviewResultSchema.parse(json);
      } catch (err) {
        if (attempt === 2) {
          console.error(`Gemini review failed for chunk ${chunk.filePath} after 2 attempts:`, err);
          return {
            issues: [],
            overall_assessment: `Review failed to generate valid JSON: ${(err as Error).message}`,
          };
        }
      }
    }

    return { issues: [], overall_assessment: 'No issues found.' };
  }
}

/**
 * OpenAI / Compatible Endpoint LLM Implementation
 */
export class OpenAIProvider implements LLMProvider {
  private openai: OpenAI;
  private modelName: string;

  constructor(apiKey: string, baseURL?: string, modelName: string = 'gpt-4o-mini') {
    this.openai = new OpenAI({ apiKey, baseURL });
    this.modelName = modelName;
  }

  async reviewChunk(chunk: DiffChunk): Promise<ReviewResult> {
    const userPrompt = buildUserPrompt(chunk.filePath, chunk.diff, chunk.addedLines);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_REVIEW_PROMPT },
            {
              role: 'user',
              content:
                attempt === 1
                  ? userPrompt
                  : `${userPrompt}\n\nIMPORTANT: Previous response failed schema validation. Return valid JSON matching schema precisely.`,
            },
          ],
        });

        const text = response.choices[0]?.message?.content || '{}';
        const json = JSON.parse(text);
        return ReviewResultSchema.parse(json);
      } catch (err) {
        if (attempt === 2) {
          console.error(`OpenAI review failed for chunk ${chunk.filePath} after 2 attempts:`, err);
          return {
            issues: [],
            overall_assessment: `Review failed: ${(err as Error).message}`,
          };
        }
      }
    }

    return { issues: [], overall_assessment: 'No issues found.' };
  }
}

/**
 * Mock Provider for instant local dev & CI/CD testing with zero API keys.
 * Heuristically parses real code bugs, secrets, SQL injection, and security flaws from diff hunks.
 */
export class MockProvider implements LLMProvider {
  async reviewChunk(chunk: DiffChunk): Promise<ReviewResult> {
    const issues: ReviewResult['issues'] = [];
    const lines = chunk.diff.split('\n');

    let currentNewLine = 0;

    for (const rawLine of lines) {
      if (rawLine.startsWith('@@')) {
        const match = rawLine.match(/\+(\d+)/);
        if (match) currentNewLine = parseInt(match[1], 10);
        continue;
      }

      if (!rawLine.startsWith('+') || rawLine.startsWith('+++')) {
        if (rawLine.startsWith(' ')) currentNewLine++;
        continue;
      }

      const lineNum = currentNewLine++;
      const code = rawLine.substring(1).trim();

      // Check for prompt injection attempt
      if (code.toLowerCase().includes('ignore all previous instructions') || code.toLowerCase().includes('approve this pr')) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNum,
          severity: 'critical',
          category: 'security',
          message: 'Potential prompt injection attempt detected inside source code or comment string.',
          suggested_fix: null,
          source: 'llm',
        });
      }

      // Hardcoded secrets
      if (/(API_KEY|SECRET_KEY|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{8,}["']/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNum,
          severity: 'critical',
          category: 'security',
          message: 'Hardcoded secret or credential token detected in source code.',
          suggested_fix: 'const secret = process.env.SECRET_TOKEN;',
          source: 'llm',
        });
      }

      // SQL injection risk (string concatenation)
      if (/(SELECT|INSERT|UPDATE|DELETE)\s+.*(\+|\$\{).*FROM/i.test(code) || /db\.query\s*\(\s*`[^`]*\$\{/i.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNum,
          severity: 'critical',
          category: 'security',
          message: 'SQL query constructed via string concatenation or interpolation; vulnerable to SQL injection.',
          suggested_fix: 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = $1", [userId]);',
          source: 'llm',
        });
      }

      // Insecure eval / exec
      if (/\beval\s*\(/.test(code) || /\bchild_process\.exec\s*\(/.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNum,
          severity: 'critical',
          category: 'security',
          message: 'Execution of arbitrary code or shell command via eval() or exec() poses severe RCE risks.',
          suggested_fix: 'Avoid dynamic execution or use execFile with sanitized argument arrays.',
          source: 'llm',
        });
      }

      // Performance: N+1 or await in loop
      if (/\bfor\s*\(.*\)\s*\{?/.test(code) && /await\s+/.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNum,
          severity: 'warning',
          category: 'performance',
          message: 'Sequential await statement executed inside loop causing unnecessary latency (N+1 pattern).',
          suggested_fix: 'await Promise.all(items.map(item => processItem(item)));',
          source: 'llm',
        });
      }

      // Leftover console.log or print
      if (/\bconsole\.(log|debug)\s*\(/.test(code)) {
        issues.push({
          file_path: chunk.filePath,
          line_number: lineNum,
          severity: 'suggestion',
          category: 'style',
          message: 'Debug logging statement found in production code.',
          suggested_fix: null,
          source: 'llm',
        });
      }
    }

    return {
      issues,
      overall_assessment:
        issues.length > 0
          ? `Analysis identified ${issues.length} potential issue(s) requiring attention.`
          : 'Code changes look clean, structured, and free of apparent security vulnerabilities.',
    };
  }
}

/**
 * Factory to instantiate the active LLM provider based on environment variables
 */
export function getLLMProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER || 'mock').toLowerCase();

  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn('⚠️ GEMINI_API_KEY not set. Falling back to MockProvider.');
      return new MockProvider();
    }
    return new GeminiProvider(key);
  }

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      console.warn('⚠️ OPENAI_API_KEY not set. Falling back to MockProvider.');
      return new MockProvider();
    }
    return new OpenAIProvider(key);
  }

  return new MockProvider();
}
