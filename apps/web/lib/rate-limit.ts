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
  const requestWithIp = req as NextRequest & { ip?: string };
  if (requestWithIp.ip) return requestWithIp.ip;

  // Fallback to loopback in direct connection mode
  return '127.0.0.1';
}

/**
 * Fixed-window rate limiter using Redis
 * Default: 60 requests per 60 seconds
 *
 * Degradation strategy (Phase 3 Requirement 8):
 * - If failOpen is true (safe read operations), degraded mode allows the request through.
 * - If failOpen is false (mutations/critical operations), failed evaluation denies the request (fail closed/safe).
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
    console.warn('Rate limit evaluation failed (Redis unavailable):', (err as Error).message);
    if (failOpen) {
      // Non-critical operations degrade gracefully: allow request through
      return {
        success: true,
        limit,
        remaining: limit,
        reset: windowSeconds,
        degraded: true,
      };
    }
    // Critical mutating operations fail closed / safely
    return {
      success: false,
      limit,
      remaining: 0,
      reset: windowSeconds,
      degraded: true,
    };
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
