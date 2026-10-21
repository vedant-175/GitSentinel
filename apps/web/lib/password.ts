import crypto from 'node:crypto';

/**
 * Securely hashes a password using PBKDF2 with SHA-512 and a random salt.
 * Native to Node.js, zero external dependencies, memory and timing attack safe.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plain text password against a stored hash string.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !password) return false;
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, originalHash] = parts;
    const originalBuffer = Buffer.from(originalHash, 'hex');
    const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
    return crypto.timingSafeEqual(originalBuffer, derivedKey);
  } catch {
    return false;
  }
}
