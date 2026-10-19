export interface PaginationParams {
  cursor?: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: number | null;
  hasMore: boolean;
  total?: number;
}

/**
 * Extracts and clamps cursor and limit query parameters.
 * Default limit: 25, Max limit: 100.
 */
export function parsePaginationParams(
  reqUrl: string | URL,
  defaultLimit = 25,
  maxLimit = 100
): PaginationParams {
  const url = typeof reqUrl === 'string' ? new URL(reqUrl) : reqUrl;
  const rawLimit = url.searchParams.get('limit');
  const rawCursor = url.searchParams.get('cursor');

  const limitNum = rawLimit ? parseInt(rawLimit, 10) : defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, isNaN(limitNum) ? defaultLimit : limitNum));
  const cursor = rawCursor && !isNaN(parseInt(rawCursor, 10)) ? parseInt(rawCursor, 10) : undefined;

  return { limit, cursor };
}

/**
 * Transforms an over-fetched (limit + 1) item array into a paginated response
 * with stable deterministic cursor and hasMore boolean.
 */
export function paginateResults<T extends { id: number }>(
  items: T[],
  limit: number,
  total?: number
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  return {
    data,
    nextCursor,
    hasMore,
    ...(total !== undefined ? { total } : {}),
  };
}
