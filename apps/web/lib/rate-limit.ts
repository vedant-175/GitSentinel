import { NextRequest, NextResponse } from 'next/server';
import { ensureRedisReady } from './queue';

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  degraded?: boolean;
}

/**
 * Resolves the client IP securely according to trusted proxy configuration.
 * When TRUST_PROXY is not enabled, headers like X-Forwarded-For and X-Real-IP are NOT trusted.
 */
export function getClientIp(req: NextRequest): string {
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';

  if (trustProxy) {
    const cfIp = req.headers.get('cf-connecting-ip');
    if (cfIp) return cfIp.trim();

    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) return parts[0];
    }

    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp.trim();
  }

  // If running in an environment that provides direct IP on Request
  const maybeIp = (req as unknown as { ip?: string }).ip;
  if (maybeIp) return maybeIp;

  // Fallback to loopback in direct connection mode
  return '127.0.0.1';
}

const inMemoryRateLimitMap = new Map<string, { count: number; expiresAt: number }>();
const inMemoryConcurrencyMap = new Map<string, number>();
const inMemoryBudgetMap = new Map<string, { count: number; expiresAt: number }>();

/**
 * Fixed-window rate limiter using Redis with seamless in-memory fallback
 * Default: 60 requests per 60 seconds
 *
 * Degradation strategy (Phase 3 Requirement 1 & 8):
 * - If Redis is unavailable or exhausted, seamlessly evaluates rate limits in-memory
 *   so serverless nodes remain resilient without crashing or dropping security boundaries.
 */
export async function rateLimit(
  identifier: string,
  limit = 60,
  windowSeconds = 60,
  failOpen = false
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;
  try {
    const redis = await ensureRedisReady();
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    const ttl = await redis.ttl(key);
    const reset = Math.max(ttl, 1);

    if (current > limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        reset,
      };
    }

    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - current),
      reset,
    };
  } catch (err) {
    // In-memory fallback if Redis is unavailable or exhausted
    const now = Date.now();
    const entry = inMemoryRateLimitMap.get(key);
    if (!entry || now > entry.expiresAt) {
      inMemoryRateLimitMap.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
      return { success: true, limit, remaining: limit - 1, reset: windowSeconds, degraded: true };
    }
    entry.count++;
    const remaining = Math.max(0, limit - entry.count);
    const reset = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    if (entry.count > limit) {
      return { success: false, limit, remaining: 0, reset, degraded: true };
    }
    return { success: true, limit, remaining, reset, degraded: true };
  }
}

/**
 * Generic API rate limiting helper
 */
export async function checkApiRateLimit(
  req: NextRequest,
  limit = 120,
  windowSeconds = 60,
  userId?: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const path = req.nextUrl.pathname;
  const clientKey = userId ? `user:${userId}` : `ip:${ip}`;
  const key = `${clientKey}:${path}`;

  // Safe read requests degrade gracefully (fail open) when Redis is unreachable.
  // Mutating requests fail safely (fail closed) with 503 Service Unavailable.
  const isSafeRead = ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  const result = await rateLimit(key, limit, windowSeconds, isSafeRead);

  if (!result.success) {
    if (result.degraded) {
      return NextResponse.json(
        {
          error: 'Service Unavailable',
          message: 'Rate limiting or queue storage is temporarily unavailable. Mutation aborted for safety.',
          retryAfter: result.reset,
        },
        {
          status: 503,
          headers: {
            'Retry-After': result.reset.toString(),
            'X-Degraded-Mode': 'redis-unavailable',
          },
        }
      );
    }

    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Rate limit exceeded. Please try again later.', retryAfter: result.reset },
      {
        status: 429,
        headers: {
          'Retry-After': result.reset.toString(),
          'X-RateLimit-Limit': result.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': result.reset.toString(),
        },
      }
    );
  }

  return null;
}

/**
 * Dedicated Rate Limiters for expensive operations (Requirement 4)
 */

// PR Review Rerun: 10 requests per minute
export async function checkReviewRerunRateLimit(
  req: NextRequest,
  userId?: string
): Promise<NextResponse | null> {
  return checkApiRateLimit(req, 10, 60, userId);
}

// Failed Review Retry: 10 requests per minute
export async function checkFailedReviewRetryRateLimit(
  req: NextRequest,
  userId?: string
): Promise<NextResponse | null> {
  return checkApiRateLimit(req, 10, 60, userId);
}

// Configuration Mutation: 30 requests per minute
export async function checkConfigMutationRateLimit(
  identifier: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `config_mutation:${identifier}`;
  const result = await rateLimit(key, 30, 60);
  return {
    allowed: result.success,
    retryAfter: result.reset,
  };
}

// Issue Status Updates: 60 requests per minute
export async function checkIssueUpdateRateLimit(
  req: NextRequest,
  userId?: string
): Promise<NextResponse | null> {
  return checkApiRateLimit(req, 60, 60, userId);
}

/**
 * Distributed Concurrency Limiter (Phase 3 Requirement 1)
 * Limits concurrent in-flight AI requests per user or IP across all serverless instances.
 */
export async function acquireAIConcurrencySlot(
  identifier: string,
  maxConcurrent = 3,
  lockTtlSeconds = 60
): Promise<{ acquired: boolean; current: number; degraded?: boolean }> {
  const key = `ai:concurrency:${identifier}`;
  try {
    const redis = await ensureRedisReady();
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, lockTtlSeconds);
    }
    if (current > maxConcurrent) {
      await redis.decr(key);
      return { acquired: false, current };
    }
    return { acquired: true, current };
  } catch (err) {
    // In-memory fallback if Redis is unavailable or quota exhausted
    const current = (inMemoryConcurrencyMap.get(key) || 0) + 1;
    if (current > maxConcurrent) {
      return { acquired: false, current, degraded: true };
    }
    inMemoryConcurrencyMap.set(key, current);
    return { acquired: true, current, degraded: true };
  }
}

/**
 * Releases an acquired AI concurrency slot.
 */
export async function releaseAIConcurrencySlot(identifier: string): Promise<void> {
  const key = `ai:concurrency:${identifier}`;
  // Always clean up in-memory entry if present
  const memCount = inMemoryConcurrencyMap.get(key);
  if (memCount !== undefined) {
    if (memCount <= 1) {
      inMemoryConcurrencyMap.delete(key);
    } else {
      inMemoryConcurrencyMap.set(key, memCount - 1);
    }
  }

  try {
    const redis = await ensureRedisReady();
    const current = await redis.decr(key);
    if (current <= 0) {
      await redis.del(key);
    }
  } catch {
    // Non-fatal cleanup
  }
}

/**
 * User AI Request & Spending Budget Limiter (Phase 3 Requirement 1)
 * Enforces a daily request quota across AI operations to prevent financial exhaustion.
 */
export async function checkAIBudget(
  identifier: string,
  dailyLimit = 100
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number; degraded?: boolean }> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const key = `ai:budget:${identifier}:${dateStr}`;
  try {
    const redis = await ensureRedisReady();
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, 86400); // 24 hours
    }
    const ttl = await redis.ttl(key);
    const resetSeconds = Math.max(ttl, 1);

    if (current > dailyLimit) {
      return { allowed: false, remaining: 0, resetSeconds };
    }
    return { allowed: true, remaining: Math.max(0, dailyLimit - current), resetSeconds };
  } catch (err) {
    // In-memory fallback if Redis is unavailable or exhausted
    const now = Date.now();
    const entry = inMemoryBudgetMap.get(key);
    if (!entry || now > entry.expiresAt) {
      inMemoryBudgetMap.set(key, { count: 1, expiresAt: now + 86400 * 1000 });
      return { allowed: true, remaining: dailyLimit - 1, resetSeconds: 86400, degraded: true };
    }
    entry.count++;
    const remaining = Math.max(0, dailyLimit - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    if (entry.count > dailyLimit) {
      return { allowed: false, remaining: 0, resetSeconds, degraded: true };
    }
    return { allowed: true, remaining, resetSeconds, degraded: true };
  }
}

/**
 * Dedicated Rate Limiters for AI endpoints
 */

// AI Chatbot queries: 20 req/min for authenticated users; 5 req/min for IP
export async function checkAIChatRateLimit(
  req: NextRequest,
  userId?: string
): Promise<NextResponse | null> {
  const limit = userId ? 20 : 5;
  return checkApiRateLimit(req, limit, 60, userId);
}

// Single-file deep code review: 10 req/min for authenticated users
export async function checkAIReviewFileRateLimit(
  req: NextRequest,
  userId?: string
): Promise<NextResponse | null> {
  return checkApiRateLimit(req, 10, 60, userId);
}

// Public repository explorer: 15 req/min per IP
export async function checkPublicExploreRateLimit(
  req: NextRequest
): Promise<NextResponse | null> {
  return checkApiRateLimit(req, 15, 60);
}
