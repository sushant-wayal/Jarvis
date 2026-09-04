import { geminiPool } from './gemini-pool';

export { geminiPool } from './gemini-pool';

/**
 * Drop-in GoogleGenAI proxy that automatically rotates across the 10-key Gemini pool
 * and handles transparent 429/quota cooldowns and retries.
 */
export const aiClient = {
  models: {
    generateContent: (params: Parameters<typeof geminiPool.generateContent>[0]) => {
      return geminiPool.generateContent(params);
    },
  },
};

const envModel = process.env.GEMINI_MODEL?.trim();
// Automatically sanitize against non-existent models (e.g. gemini-3.5-flash)
export const DEFAULT_MODEL =
  envModel && !envModel.includes('3.5') && !envModel.includes('2.0')
    ? envModel
    : 'gemini-3-flash-preview';

// Verified high-speed production fallback models
export const FAST_FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-flash-lite-latest',
];

export function getGeminiPoolStats() {
  return geminiPool.getStats();
}
