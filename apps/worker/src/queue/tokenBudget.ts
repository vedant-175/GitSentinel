import { Redis } from 'ioredis';

export const DEFAULT_DAILY_TOKEN_BUDGET = parseInt(
  process.env.DAILY_TOKEN_BUDGET || '500000',
  10
);

/**
 * Returns today's UTC date key component (YYYY-MM-DD)
 */
export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Checks if the installation has remaining daily token quota.
 */
export async function checkDailyTokenBudget(
  redis: Redis,
  installationId: number | string,
  budgetLimit: number = DEFAULT_DAILY_TOKEN_BUDGET
): Promise<{ allowed: boolean; currentTokens: number; limit: number }> {
  const dateStr = getUtcDateString();
  const key = `token_budget:${installationId}:${dateStr}`;
  const raw = await redis.get(key);
  const currentTokens = raw ? parseInt(raw, 10) : 0;

  return {
    allowed: currentTokens < budgetLimit,
    currentTokens,
    limit: budgetLimit,
  };
}

/**
 * Records tokens consumed by an installation today, with 48h TTL.
 */
export async function recordDailyTokens(
  redis: Redis,
  installationId: number | string,
  tokensConsumed: number
): Promise<number> {
  if (tokensConsumed <= 0) return 0;
  const dateStr = getUtcDateString();
  const key = `token_budget:${installationId}:${dateStr}`;

  const luaScript = `
    local current = redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))
    if tonumber(current) == tonumber(ARGV[1]) then
      redis.call('EXPIRE', KEYS[1], 172800) -- 48 hours TTL
    end
    return current
  `;

  const newTotal = await redis.eval(luaScript, 1, key, tokensConsumed);
  return Number(newTotal);
}

/**
 * Reserves estimated tokens for a chunk from the installation's daily budget (Item 16).
 * Atomically checks if current + estimatedTokens <= limit.
 * If within budget, increments the daily counter and returns { allowed: true, reserved: estimatedTokens }.
 * If exceeding budget, does NOT increment and returns { allowed: false, reserved: 0 }.
 */
export async function reserveChunkTokenBudget(
  redis: Redis,
  installationId: number | string,
  estimatedTokens: number,
  budgetLimit: number = DEFAULT_DAILY_TOKEN_BUDGET
): Promise<{ allowed: boolean; currentTokens: number; limit: number; reserved: number }> {
  if (estimatedTokens <= 0) {
    const check = await checkDailyTokenBudget(redis, installationId, budgetLimit);
    return { ...check, reserved: 0 };
  }

  const dateStr = getUtcDateString();
  const key = `token_budget:${installationId}:${dateStr}`;

  const luaScript = `
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    local estimated = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    if (current + estimated) > limit then
      return {0, current, limit}
    end
    local newTotal = redis.call('INCRBY', KEYS[1], estimated)
    if tonumber(newTotal) == estimated then
      redis.call('EXPIRE', KEYS[1], 172800) -- 48 hours TTL
    end
    return {1, newTotal, limit}
  `;

  const result = (await redis.eval(
    luaScript,
    1,
    key,
    estimatedTokens,
    budgetLimit
  )) as [number, number, number];

  const allowedFlag = Number(result[0]);
  const current = Number(result[1]);
  const limit = Number(result[2]);

  return {
    allowed: allowedFlag === 1,
    currentTokens: current,
    limit,
    reserved: allowedFlag === 1 ? estimatedTokens : 0,
  };
}

/**
 * Reconciles the chunk's daily token budget reservation with the actual token usage from the API response (Item 16).
 * Adjusts counter by (actualTokens - estimatedTokens).
 */
export async function reconcileChunkTokenBudget(
  redis: Redis,
  installationId: number | string,
  estimatedTokens: number,
  actualTokens: number
): Promise<number> {
  const delta = actualTokens - estimatedTokens;
  if (delta === 0) return 0;

  const dateStr = getUtcDateString();
  const key = `token_budget:${installationId}:${dateStr}`;

  const luaScript = `
    local delta = tonumber(ARGV[1])
    local current = redis.call('INCRBY', KEYS[1], delta)
    if tonumber(current) < 0 then
      redis.call('SET', KEYS[1], '0')
      current = 0
    end
    return current
  `;

  const newTotal = await redis.eval(luaScript, 1, key, delta);
  return Number(newTotal);
}

