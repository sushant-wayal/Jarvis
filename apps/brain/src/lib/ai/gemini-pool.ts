import { GoogleGenAI } from '@google/genai';
import { logger } from '@/lib/logging/logger';

export interface PoolSlot {
  key: string;
  maskedKey: string;
  client: GoogleGenAI;
  cooldownUntil: number;
  failureCount: number;
  successCount: number;
}

export interface PoolStats {
  totalKeys: number;
  activeKeys: number;
  cooldownKeys: number;
  totalSuccess: number;
  totalFailures: number;
}

/**
 * Mask an API key for safe logging (e.g. AIzaSy...9xZ)
 */
function maskKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/**
 * Detect if an error is related to quota, rate-limiting, or 429
 */
function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = (err as { status?: number; statusCode?: number })?.status || (err as { statusCode?: number })?.statusCode;

  return (
    status === 429 ||
    status === 503 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('resource exhausted')
  );
}

export class GeminiKeyPoolManager {
  private slots: PoolSlot[] = [];
  private currentIndex = 0;
  private readonly defaultCooldownMs = 60_000; // 60 seconds cooldown on 429

  constructor() {
    this.refreshKeys();
  }

  /**
   * Parse all configured Gemini API keys from environment variables
   */
  public parseApiKeys(): string[] {
    const rawKeys: string[] = [];

    // 1. Check GEMINI_API_KEYS (comma, newline, or semicolon delimited)
    const multiKeys = process.env.GEMINI_API_KEYS;
    if (multiKeys) {
      const split = multiKeys.split(/[\n,;]+/).map((k) => k.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      rawKeys.push(...split);
    }

    // 2. Check single GEMINI_API_KEY
    const singleKey = process.env.GEMINI_API_KEY?.trim();
    if (singleKey) {
      rawKeys.push(singleKey);
    }

    // 3. Check numbered keys GEMINI_API_KEY_1 .. GEMINI_API_KEY_20
    for (let i = 1; i <= 20; i++) {
      const numberedKey = process.env[`GEMINI_API_KEY_${i}`]?.trim();
      if (numberedKey) {
        rawKeys.push(numberedKey);
      }
    }

    // Deduplicate and filter out demo placeholder if real keys exist
    const uniqueKeys = Array.from(new Set(rawKeys));
    const validKeys = uniqueKeys.filter((k) => k !== 'demo-api-key' && k !== 'your-gemini-api-key-here');

    if (validKeys.length > 0) {
      return validKeys;
    }

    return uniqueKeys.length > 0 ? uniqueKeys : ['demo-api-key'];
  }

  /**
   * Refresh pool slots from current environment
   */
  public refreshKeys(): void {
    const keys = this.parseApiKeys();
    this.slots = keys.map((key) => ({
      key,
      maskedKey: maskKey(key),
      client: new GoogleGenAI({ apiKey: key }),
      cooldownUntil: 0,
      failureCount: 0,
      successCount: 0,
    }));

    logger.info(`Initialized Gemini Key Pool with ${this.slots.length} key(s)`, {
      totalKeys: this.slots.length,
      keys: this.slots.map((s) => s.maskedKey),
    });
  }

  /**
   * Get operational metrics for the key pool
   */
  public getStats(): PoolStats {
    const now = Date.now();
    let activeKeys = 0;
    let cooldownKeys = 0;
    let totalSuccess = 0;
    let totalFailures = 0;

    for (const slot of this.slots) {
      if (slot.cooldownUntil > now) {
        cooldownKeys++;
      } else {
        activeKeys++;
      }
      totalSuccess += slot.successCount;
      totalFailures += slot.failureCount;
    }

    return {
      totalKeys: this.slots.length,
      activeKeys,
      cooldownKeys,
      totalSuccess,
      totalFailures,
    };
  }

  /**
   * Pick candidate slots prioritizing healthy (non-cooldown) keys in round-robin order
   */
  private getCandidateSlots(): PoolSlot[] {
    if (this.slots.length === 0) {
      this.refreshKeys();
    }

    const now = Date.now();
    const healthySlots = this.slots.filter((s) => s.cooldownUntil <= now);

    if (healthySlots.length > 0) {
      // Rotate round-robin starting from currentIndex
      const startIndex = this.currentIndex % healthySlots.length;
      this.currentIndex = (this.currentIndex + 1) % 1_000_000;
      
      return [
        ...healthySlots.slice(startIndex),
        ...healthySlots.slice(0, startIndex),
      ];
    }

    // All slots are on cooldown: order by least remaining cooldown time
    return [...this.slots].sort((a, b) => a.cooldownUntil - b.cooldownUntil);
  }

  /**
   * Execute content generation with automatic failover and key rotation
   */
  public async generateContent(
    params: Parameters<GoogleGenAI['models']['generateContent']>[0]
  ): Promise<ReturnType<GoogleGenAI['models']['generateContent']>> {
    const candidates = this.getCandidateSlots();
    let lastError: unknown = null;

    for (const slot of candidates) {
      try {
        const result = await slot.client.models.generateContent(params);
        slot.successCount++;
        // Clear past cooldown on successful response
        slot.cooldownUntil = 0;
        return result;
      } catch (err) {
        lastError = err;
        slot.failureCount++;

        if (isRateLimitError(err)) {
          slot.cooldownUntil = Date.now() + this.defaultCooldownMs;
          logger.warn(`Gemini Key ${slot.maskedKey} hit rate limit (429/quota). Cooling down for 60s.`, {
            maskedKey: slot.maskedKey,
            model: params.model,
            cooldownUntil: new Date(slot.cooldownUntil).toISOString(),
            error: err instanceof Error ? err.message : String(err),
          });
          // Continue to try the next key in the pool
          continue;
        }

        logger.warn(`Gemini call error on key ${slot.maskedKey}`, {
          maskedKey: slot.maskedKey,
          model: params.model,
          error: err instanceof Error ? err.message : String(err),
        });

        // If it's a structural or general error, try one more key just in case it was a transient provider issue
        if (candidates.length > 1) {
          continue;
        } else {
          throw err;
        }
      }
    }

    throw lastError || new Error('All Gemini API keys exhausted in pool');
  }
}

export const geminiPool = new GeminiKeyPoolManager();
