/**
 * Multi-Key Fallback Pool Manager
 * Distributes requests round-robin across multiple API keys,
 * automatically detects HTTP 429 / Quota limits, and fails over
 * seamlessly to backup keys with exponential cooldown.
 */

export interface KeyPoolOptions {
  keys: string[];
  cooldownMs?: number; // default 60,000ms (1 min)
}

export class KeyPool {
  private keys: string[];
  private currentIndex: number = 0;
  private cooldowns: Map<string, number> = new Map();
  private cooldownMs: number;

  constructor(options: KeyPoolOptions) {
    this.keys = Array.from(
      new Set(
        (options.keys || [])
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
      )
    );
    this.cooldownMs = options.cooldownMs ?? 60000;
  }

  get size(): number {
    return this.keys.length;
  }

  hasKeys(): boolean {
    return this.keys.length > 0;
  }

  getAllKeys(): string[] {
    return [...this.keys];
  }

  getActiveKeysCount(): number {
    const now = Date.now();
    return this.keys.filter((k) => {
      const until = this.cooldowns.get(k) || 0;
      return now >= until;
    }).length;
  }

  getNextKey(): string {
    if (this.keys.length === 0) {
      throw new Error('KeyPool is empty. No API keys configured.');
    }

    const now = Date.now();
    // Try to find the next key that is not on cooldown starting from currentIndex
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[idx];
      const cooldownUntil = this.cooldowns.get(key) || 0;
      if (now >= cooldownUntil) {
        this.cooldowns.delete(key);
        this.currentIndex = (idx + 1) % this.keys.length;
        return key;
      }
    }

    // If all keys are currently in cooldown, return the one that expires soonest
    let earliestKey = this.keys[0];
    let earliestTime = this.cooldowns.get(earliestKey) ?? Infinity;
    for (const key of this.keys) {
      const time = this.cooldowns.get(key) ?? Infinity;
      if (time < earliestTime) {
        earliestTime = time;
        earliestKey = key;
      }
    }
    return earliestKey;
  }

  markRateLimited(key: string, customCooldownMs?: number): void {
    const duration = customCooldownMs ?? this.cooldownMs;
    const cooldownUntil = Date.now() + duration;
    this.cooldowns.set(key, cooldownUntil);
  }

  isCooldown(key: string): boolean {
    const cooldownUntil = this.cooldowns.get(key) || 0;
    return Date.now() < cooldownUntil;
  }

  resetCooldowns(): void {
    this.cooldowns.clear();
  }
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export function parseKeysList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0 && !k.startsWith('#'));
}

export function getKeyPool(provider: 'groq' | 'gemini' | 'openai' | 'anthropic'): KeyPool {
  let keys: string[] = [];
  if (provider === 'groq') {
    keys = parseKeysList(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY);
  } else if (provider === 'gemini') {
    keys = parseKeysList(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY);
  } else if (provider === 'openai') {
    keys = parseKeysList(process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY);
  } else if (provider === 'anthropic') {
    keys = parseKeysList(process.env.ANTHROPIC_API_KEYS || process.env.ANTHROPIC_API_KEY);
  }
  return new KeyPool({ keys });
}
