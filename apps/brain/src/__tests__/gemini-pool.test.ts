import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiKeyPoolManager } from '../lib/ai/gemini-pool';

describe('GeminiKeyPoolManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('correctly parses comma-separated keys from GEMINI_API_KEYS', () => {
    process.env.GEMINI_API_KEYS = 'key1, key2, key3, key4';
    delete process.env.GEMINI_API_KEY;

    const manager = new GeminiKeyPoolManager();
    const keys = manager.parseApiKeys();

    expect(keys).toEqual(['key1', 'key2', 'key3', 'key4']);
    expect(manager.getStats().totalKeys).toBe(4);
  });

  it('combines numbered GEMINI_API_KEY_1..N with GEMINI_API_KEY', () => {
    delete process.env.GEMINI_API_KEYS;
    process.env.GEMINI_API_KEY = 'single_key';
    process.env.GEMINI_API_KEY_1 = 'numbered_1';
    process.env.GEMINI_API_KEY_2 = 'numbered_2';

    const manager = new GeminiKeyPoolManager();
    const keys = manager.parseApiKeys();

    expect(keys).toContain('single_key');
    expect(keys).toContain('numbered_1');
    expect(keys).toContain('numbered_2');
    expect(keys.length).toBe(3);
  });

  it('deduplicates keys and excludes placeholders when real keys are present', () => {
    process.env.GEMINI_API_KEYS = 'keyA, keyB, demo-api-key, keyA';

    const manager = new GeminiKeyPoolManager();
    const keys = manager.parseApiKeys();

    expect(keys).toEqual(['keyA', 'keyB']);
  });

  it('provides pool statistics correctly', () => {
    process.env.GEMINI_API_KEYS = 'k1, k2, k3';
    const manager = new GeminiKeyPoolManager();
    const stats = manager.getStats();

    expect(stats.totalKeys).toBe(3);
    expect(stats.activeKeys).toBe(3);
    expect(stats.cooldownKeys).toBe(0);
    expect(stats.totalSuccess).toBe(0);
    expect(stats.totalFailures).toBe(0);
  });

  it('fails over to next available key when a 429 rate limit error occurs', async () => {
    process.env.GEMINI_API_KEYS = 'fail_key, success_key';
    const manager = new GeminiKeyPoolManager();

    // Mock slots' GoogleGenAI clients
    const slots = (manager as unknown as { slots: Array<{ client: { models: { generateContent: unknown } }; cooldownUntil: number }> }).slots;
    
    // First client throws 429
    slots[0].client.models.generateContent = vi.fn().mockRejectedValue(new Error('429 Too Many Requests: Resource Exhausted'));
    
    // Second client succeeds
    slots[1].client.models.generateContent = vi.fn().mockResolvedValue({
      text: 'Response from healthy key',
    });

    const result = await manager.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: 'Hello',
    });

    expect(result).toEqual({ text: 'Response from healthy key' });
    expect(slots[0].cooldownUntil).toBeGreaterThan(Date.now());
    
    const stats = manager.getStats();
    expect(stats.cooldownKeys).toBe(1);
    expect(stats.activeKeys).toBe(1);
    expect(stats.totalFailures).toBe(1);
    expect(stats.totalSuccess).toBe(1);
  });
});
