import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KeyPool, maskApiKey, parseKeysList } from './keyPool.js';

describe('KeyPool Multi-Key Fallback Manager', () => {
  it('parses comma-separated keys correctly', () => {
    const raw = 'key1,  key2, key3, , #comment, key4 ';
    const keys = parseKeysList(raw);
    assert.deepEqual(keys, ['key1', 'key2', 'key3', 'key4']);
  });

  it('masks API keys securely', () => {
    assert.equal(maskApiKey('AIzaSyD-1234567890abcdef'), 'AIzaSy...cdef');
    assert.equal(maskApiKey('short'), '****');
  });

  it('rotates keys round-robin when healthy', () => {
    const pool = new KeyPool({ keys: ['k1', 'k2', 'k3'] });
    assert.equal(pool.size, 3);
    assert.equal(pool.getNextKey(), 'k1');
    assert.equal(pool.getNextKey(), 'k2');
    assert.equal(pool.getNextKey(), 'k3');
    assert.equal(pool.getNextKey(), 'k1');
  });

  it('skips rate-limited key and falls back to next available key', () => {
    const pool = new KeyPool({ keys: ['k1', 'k2', 'k3'], cooldownMs: 10000 });
    
    // k1 is active
    const first = pool.getNextKey();
    assert.equal(first, 'k1');

    // Mark k1 as rate-limited (429)
    pool.markRateLimited('k1');
    assert.equal(pool.isCooldown('k1'), true);
    assert.equal(pool.getActiveKeysCount(), 2);

    // Next requests should bypass k1 and use k2 and k3
    assert.equal(pool.getNextKey(), 'k2');
    assert.equal(pool.getNextKey(), 'k3');
    assert.equal(pool.getNextKey(), 'k2');
  });

  it('recovers key once cooldown expires', async () => {
    const pool = new KeyPool({ keys: ['k1', 'k2'], cooldownMs: 50 });
    pool.markRateLimited('k1', 50);
    assert.equal(pool.isCooldown('k1'), true);

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(pool.isCooldown('k1'), false);
    assert.equal(pool.getActiveKeysCount(), 2);
  });
});
