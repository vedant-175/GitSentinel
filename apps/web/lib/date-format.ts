const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Deterministically format a date string or Date object into 'MMM DD, YYYY' (e.g. 'Oct 18, 2026').
 * This avoids SSR vs Client locale discrepancies (e.g., DD/MM/YYYY vs MM/DD/YYYY) that trigger React hydration errors.
 */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return 'recent';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!d || isNaN(d.getTime())) return 'recent';

  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

/**
 * Deterministically format a time string or Date object into 'HH:MM:SS' (24-hour clock).
 */
export function formatTime(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!d || isNaN(d.getTime())) return '';

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Deterministically format a date & time string or Date object into 'MMM DD, YYYY HH:MM:SS'.
 */
export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!d || isNaN(d.getTime())) return '';

  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Deterministically format a timestamp into Indian Standard Time (IST, UTC+5:30)
 * Example output: 'Nov 18, 2026 14:32:15'
 */
export function formatISTDateTime(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!d || isNaN(d.getTime())) return '';

  // UTC time in ms
  const utcMs = d.getTime();
  // IST is UTC + 5 hours 30 minutes
  const istDate = new Date(utcMs + 5.5 * 3600 * 1000);

  const month = MONTHS[istDate.getUTCMonth()];
  const day = istDate.getUTCDate();
  const year = istDate.getUTCFullYear();
  const hours = String(istDate.getUTCHours()).padStart(2, '0');
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
  return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format date into relative time string like '2 hours ago', '1 day ago', etc.
 */
export function formatTimeAgo(input: string | Date | null | undefined): string {
  if (!input) return 'recently';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!d || isNaN(d.getTime())) return 'recently';

  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return formatDate(d);
}
