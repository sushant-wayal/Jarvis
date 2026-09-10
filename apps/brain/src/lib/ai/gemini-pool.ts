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

// Global cache for thought signatures required by Gemini 3+ across function calling turns
const thoughtSignatureCache = new Map<string, string>();

let isThoughtSignatureInterceptorInstalled = false;

/**
 * Patch @google/genai ApiClient to capture and re-inject thoughtSignature for Gemini 3 models.
 * Google Gemini 3 strictly requires thought_signature across multi-turn tool calling, but
 * the SDK currently strips this field during serialization/deserialization.
 */
function installThoughtSignatureInterceptor() {
  if (isThoughtSignatureInterceptorInstalled) return;

  try {
    const dummy = new GoogleGenAI({ apiKey: 'init-probe' });
    const proto = Object.getPrototypeOf((dummy as unknown as { apiClient: unknown }).apiClient);
    if (!proto || !proto.request || !proto.unaryApiCall) {
      return;
    }

    const origRequest = proto.request;
    const origUnaryApiCall = proto.unaryApiCall;

    proto.request = async function (req: { body?: string; [key: string]: unknown }) {
      if (req.body && typeof req.body === 'string') {
        try {
          const bodyObj = JSON.parse(req.body) as {
            contents?: Array<{
              role?: string;
              parts?: Array<{
                functionCall?: { id?: string; name?: string };
                thoughtSignature?: string;
                thought_signature?: string;
              }>;
            }>;
          };

          let modified = false;
          if (Array.isArray(bodyObj.contents)) {
            for (const content of bodyObj.contents) {
              if (content.role === 'model' && Array.isArray(content.parts)) {
                for (const part of content.parts) {
                  if (part.functionCall && !part.thoughtSignature && !part.thought_signature) {
                    const fc = part.functionCall;
                    const sig =
                      (fc.id && thoughtSignatureCache.get(fc.id)) ||
                      (fc.name && thoughtSignatureCache.get(fc.name)) ||
                      thoughtSignatureCache.get('__latest__');
                    if (sig) {
                      part.thoughtSignature = sig;
                      modified = true;
                      logger.info(`[Gemini3] Re-injected thoughtSignature for ${fc.name || 'tool'}`, {
                        callId: fc.id,
                        toolName: fc.name,
                      });
                    }
                  }
                }
              }
            }
          }

          if (modified) {
            req.body = JSON.stringify(bodyObj);
          }
        } catch (err) {
          logger.warn('[Gemini3] Error inspecting request body for thoughtSignature', { err });
        }
      }

      return origRequest.call(this, req);
    };

    proto.unaryApiCall = async function (url: unknown, requestInit: unknown, httpMethod: unknown) {
      const res = await origUnaryApiCall.call(this, url, requestInit, httpMethod);
      const origJson = res.json.bind(res);

      res.json = async function () {
        const data = await origJson();
        try {
          if (data && Array.isArray(data.candidates)) {
            for (const cand of data.candidates) {
              if (cand.content && Array.isArray(cand.content.parts)) {
                for (const part of cand.content.parts) {
                  const sig = part.thoughtSignature || part.thought_signature;
                  if (part.functionCall && sig) {
                    const fc = part.functionCall;
                    if (fc.id) thoughtSignatureCache.set(fc.id, sig);
                    if (fc.name) thoughtSignatureCache.set(fc.name, sig);
                    thoughtSignatureCache.set('__latest__', sig);
                    logger.info(`[Gemini3] Captured thoughtSignature for ${fc.name || 'tool'}`, {
                      callId: fc.id,
                      toolName: fc.name,
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          logger.warn('[Gemini3] Error capturing thoughtSignature from response', { e });
        }
        return data;
      };

      return res;
    };

    isThoughtSignatureInterceptorInstalled = true;
    logger.info('Installed Gemini 3 Thought Signature interceptor successfully');
  } catch (err) {
    logger.error('Failed to install Gemini 3 Thought Signature interceptor', err);
  }
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
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('resource exhausted')
  );
}

// Auto-install interceptor on module evaluation
installThoughtSignatureInterceptor();

export class GeminiKeyPoolManager {
  private slots: PoolSlot[] = [];
  private currentIndex = 0;
  private readonly defaultCooldownMs = 300_000; // 5 minutes cooldown on 429 or timeout

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

    // Deduplicate and filter out demo placeholder if other keys exist
    const uniqueKeys = Array.from(new Set(rawKeys));
    const validKeys = uniqueKeys.filter(
      (k) => k !== 'demo-api-key' && k !== 'your-gemini-api-key-here'
    );

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
    let attempts = 0;
    const maxAttempts = Math.min(candidates.length, 2); // Max 2 key attempts to prevent Vercel 15s timeout

    for (const slot of candidates) {
      if (attempts >= maxAttempts) {
        break;
      }
      attempts++;

      try {
        // Enforce 8s per-key timeout for balanced latency and resilience
        let timer: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Key ${slot.maskedKey} call timed out (8s limit)`)), 8000);
        });

        const result = await Promise.race([
          slot.client.models.generateContent(params),
          timeoutPromise,
        ]).finally(() => {
          if (timer) clearTimeout(timer);
        });

        slot.successCount++;
        // Clear past cooldown on successful response
        slot.cooldownUntil = 0;
        return result;
      } catch (err) {
        lastError = err;
        slot.failureCount++;

        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
        // If the model does not exist (404) or bad request (400), don't retry other keys
        if (msg.includes('not found') || msg.includes('404') || msg.includes('invalid_argument')) {
          logger.error(`Gemini call failed permanently for model ${params.model}`, {
            model: params.model,
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }

        if (isRateLimitError(err) || msg.includes('timed out')) {
          slot.cooldownUntil = Date.now() + this.defaultCooldownMs;
          logger.warn(`Gemini Key ${slot.maskedKey} rate limited or timed out. Cooling down for 60s.`, {
            maskedKey: slot.maskedKey,
            model: params.model,
            cooldownUntil: new Date(slot.cooldownUntil).toISOString(),
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }

        logger.warn(`Gemini call error on key ${slot.maskedKey}`, {
          maskedKey: slot.maskedKey,
          model: params.model,
          error: err instanceof Error ? err.message : String(err),
        });

        if (attempts < maxAttempts) {
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
