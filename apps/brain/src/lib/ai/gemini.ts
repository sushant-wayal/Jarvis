import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY || 'demo-api-key';

export const aiClient = new GoogleGenAI({
  apiKey,
});

export const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

// Verified high-speed production fallback models
export const FAST_FALLBACK_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-3.7-flash',
  'gemini-flash-latest',
];
