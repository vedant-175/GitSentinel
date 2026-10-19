import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBackoffWithJitter,
  isTransientGitHubError,
  isTransientLLMError,
  isTransientPostgresError,
  isTransientRedisError,
  withRetry,
} from './retry.js';

describe('Controlled Retries with Exponential Backoff + Jitter (Phase 3 Requirement 5)', () => {
  it('computeBackoffWithJitter calculates bounded delay with minimum jitter floor', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const delay = computeBackoffWithJitter(attempt, 100, 2000, 2);
      assert.ok(delay >= 20, `Delay (${delay}) must be >= 20ms floor`);
      assert.ok(delay <= 2000, `Delay (${delay}) must not exceed maxDelayMs (2000ms)`);
    }
  });

  describe('Error Classification: Transient vs Deterministic', () => {
    it('isTransientGitHubError identifies retryable vs non-retryable GitHub errors', () => {
      // Retryable
      assert.equal(isTransientGitHubError({ status: 429 }), true, '429 is retryable');
      assert.equal(isTransientGitHubError({ status: 500 }), true, '500 is retryable');
      assert.equal(isTransientGitHubError({ status: 502 }), true, '502 is retryable');
      assert.equal(isTransientGitHubError({ status: 503 }), true, '503 is retryable');
      assert.equal(isTransientGitHubError({ code: 'ECONNRESET' }), true, 'ECONNRESET is retryable');
      assert.equal(isTransientGitHubError({ code: 'ETIMEDOUT' }), true, 'ETIMEDOUT is retryable');
      assert.equal(
        isTransientGitHubError({ status: 403, message: 'API rate limit exceeded' }),
        true,
        '403 rate limit is retryable'
      );

      // Non-retryable
      assert.equal(isTransientGitHubError({ status: 401, message: 'Bad credentials' }), false, '401 is fatal');
      assert.equal(isTransientGitHubError({ status: 403, message: 'Resource not accessible by integration' }), false, '403 auth is fatal');
      assert.equal(isTransientGitHubError({ status: 404, message: 'Not Found' }), false, '404 is fatal');
      assert.equal(isTransientGitHubError({ status: 422, message: 'Validation Failed' }), false, '422 is fatal');
      assert.equal(isTransientGitHubError({ status: 400, message: 'Bad Request' }), false, '400 is fatal');
    });

    it('isTransientLLMError identifies retryable vs non-retryable LLM errors', () => {
      // Retryable
      assert.equal(isTransientLLMError({ status: 429 }), true);
      assert.equal(isTransientLLMError({ message: 'Overloaded' }), true);
      assert.equal(isTransientLLMError({ status: 503 }), true);
      assert.equal(isTransientLLMError({ message: 'rate limit reached' }), true);

      // Non-retryable
      assert.equal(isTransientLLMError({ status: 401, message: 'Invalid API key provided' }), false);
      assert.equal(isTransientLLMError({ message: 'Maximum context length exceeded' }), false);
      assert.equal(isTransientLLMError({ status: 400, message: 'Invalid schema' }), false);
    });

    it('isTransientPostgresError identifies retryable vs non-retryable DB errors', () => {
      // Retryable
      assert.equal(isTransientPostgresError({ code: '40P01' }), true, 'Deadlock is retryable');
      assert.equal(isTransientPostgresError({ code: '40001' }), true, 'Serialization failure is retryable');
      assert.equal(isTransientPostgresError({ code: 'P2024' }), true, 'Prisma connection pool timeout is retryable');

      // Non-retryable
      assert.equal(isTransientPostgresError({ code: 'P2002' }), false, 'Unique constraint is non-retryable');
      assert.equal(isTransientPostgresError({ code: 'P2003' }), false, 'FK constraint is non-retryable');
      assert.equal(isTransientPostgresError({ code: 'P2025' }), false, 'Record not found is non-retryable');
    });

    it('isTransientRedisError identifies retryable vs non-retryable Redis errors', () => {
      assert.equal(isTransientRedisError({ code: 'NR_CLOSED' }), true);
      assert.equal(isTransientRedisError({ code: 'ECONNRESET' }), true);
      assert.equal(isTransientRedisError({ message: 'Connection is closed' }), true);
      assert.equal(isTransientRedisError({ message: 'ERR wrong number of arguments' }), false);
    });
  });

  describe('withRetry Execution Engine', () => {
    it('retries transient failures and succeeds when resolved', async () => {
      let attempts = 0;
      const retryDelays: number[] = [];

      const result = await withRetry(
        async (attempt) => {
          attempts = attempt;
          if (attempt < 2) {
            const err = new Error('Gateway Timeout');
            (err as any).status = 504;
            throw err;
          }
          return 'success-value';
        },
        {
          maxRetries: 3,
          initialDelayMs: 30,
          maxDelayMs: 100,
          isRetryable: isTransientGitHubError,
          onRetry: (_err, _attempt, delayMs) => {
            retryDelays.push(delayMs);
          },
        }
      );

      assert.equal(result, 'success-value');
      assert.equal(attempts, 2, 'Should succeed on attempt 2');
      assert.equal(retryDelays.length, 2, 'Should record 2 retry delays');
    });

    it('does NOT retry non-retryable deterministic errors (e.g. 401 Unauthorized)', async () => {
      let attempts = 0;

      await assert.rejects(
        async () => {
          await withRetry(
            async (attempt) => {
              attempts = attempt;
              const err = new Error('Bad credentials');
              (err as any).status = 401;
              throw err;
            },
            {
              maxRetries: 3,
              initialDelayMs: 30,
              isRetryable: isTransientGitHubError,
            }
          );
        },
        (err: any) => {
          assert.equal(err.status, 401);
          return true;
        }
      );

      assert.equal(attempts, 0, 'Fatal error must fail on first attempt without retrying');
    });
  });
});
