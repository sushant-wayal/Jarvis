import { MusicContextSnapshot, MusicIntent } from './music-types';
import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';

export interface ExpandedMusicSoundscape {
  isAmbientOrActivity: boolean;
  primaryQuery: string;
  candidateQueries: string[];
  targetEnergy: 'low' | 'medium' | 'high';
  preferredGenres: string[];
  penalizedGenres: string[];
  explanation: string;
}

// In-memory cache for fast repeated resolution (e.g. queue replenishments within a session)
const soundscapeCache = new Map<string, { result: ExpandedMusicSoundscape; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class MusicIntentExpander {
  /**
   * Semantically analyzes and expands user music intentions, activities, and vibes
   * into optimized music catalog search queries and acoustic constraints using the LLM.
   *
   * Adheres to Rule 37 & 38: The LLM is the sole semantic engine for understanding natural
   * language requests and mapping human activity/mood into soundscape search parameters.
   */
  async expandMusicIntent(
    intent: MusicIntent,
    context?: MusicContextSnapshot
  ): Promise<ExpandedMusicSoundscape> {
    const rawQuery = (intent.query || '').trim();
    const rawActivity = (intent.activity || '').trim();
    const rawMood = (intent.mood || '').trim();
    const rawGenre = (intent.genre || '').trim();
    const rawLang = (intent.language || '').trim();
    const rawArtist = (intent.artist || '').trim();

    // Cache key based on input parameters
    const cacheKey = `${rawQuery}|${rawActivity}|${rawMood}|${rawGenre}|${rawLang}|${rawArtist}|${context?.timeOfDay || ''}`.toLowerCase();
    const cached = soundscapeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const prompt = `You are Jarvis's AI music soundscape specialist.
Analyze the user's music playback request semantically.
User Request:
- Query: "${rawQuery}"
- Activity: "${rawActivity}"
- Mood: "${rawMood}"
- Genre: "${rawGenre}"
- Language: "${rawLang}"
- Artist: "${rawArtist}"
- Time: "${context?.timeOfDay || ''}"

Tasks:
1. If this is an explicit track or artist (e.g. "Blinding Lights", "Arijit Singh") without activity/vibe:
   Set isAmbientOrActivity: false, primaryQuery: "${rawQuery || rawArtist}", candidateQueries: []
2. If this is an ambient, activity, mood, or vibe request (e.g. "chess", "study", "workout", "sleep", "chill", "focus"):
   Set isAmbientOrActivity: true.
   - Chess / study / focus needs calm instrumental or piano or lofi with ZERO loud rap/party/vocals.
   - Workout needs high energy BPM.
   - Sleep needs soft ambient sounds.
   Formulate best search queries for streaming music catalogs (e.g. "deep focus instrumental", "lofi study beats", "workout motivation hits").

Respond strictly in pure JSON format:
{
  "isAmbientOrActivity": boolean,
  "primaryQuery": string,
  "candidateQueries": string[],
  "targetEnergy": "low" | "medium" | "high",
  "preferredGenres": string[],
  "penalizedGenres": string[],
  "explanation": string
}`;

    const modelsToTry = Array.from(new Set(['gemini-flash-lite-latest', DEFAULT_MODEL]));

    for (const model of modelsToTry) {
      try {
        const response = await aiClient.models.generateContent({
          model,
          contents: prompt,
        });

        const text = response.text?.trim() || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const parsed = JSON.parse(jsonMatch[0]) as Partial<ExpandedMusicSoundscape>;
        const energyRaw = (parsed.targetEnergy || '').toLowerCase().trim();
        const targetEnergy: 'low' | 'medium' | 'high' =
          energyRaw === 'low' ? 'low' : energyRaw === 'high' ? 'high' : 'medium';

        const result: ExpandedMusicSoundscape = {
          isAmbientOrActivity: Boolean(parsed.isAmbientOrActivity),
          primaryQuery: (parsed.primaryQuery || rawQuery || 'trending hits').trim(),
          candidateQueries: Array.isArray(parsed.candidateQueries) ? parsed.candidateQueries : [],
          targetEnergy,
          preferredGenres: Array.isArray(parsed.preferredGenres) ? parsed.preferredGenres : [],
          penalizedGenres: Array.isArray(parsed.penalizedGenres) ? parsed.penalizedGenres : [],
          explanation: parsed.explanation || 'LLM music intent analysis',
        };

        soundscapeCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        logger.info('Expanded music intent with LLM', {
          rawQuery,
          activity: rawActivity,
          primaryQuery: result.primaryQuery,
          isAmbientOrActivity: result.isAmbientOrActivity,
          targetEnergy: result.targetEnergy,
        });
        return result;
      } catch (err) {
        logger.warn('Failed LLM call for expandMusicIntent with model', { model, err: String(err) });
      }
    }

    // Clean fallback if all LLM models fail or time out
    const fallbackEnergy: 'low' | 'medium' | 'high' = intent.energy || 'medium';
    const fallbackPrimary = rawQuery || (rawArtist ? `${rawArtist} hits` : 'trending hits');

    const fallbackResult: ExpandedMusicSoundscape = {
      isAmbientOrActivity: Boolean(rawActivity || rawMood || intent.energy),
      primaryQuery: fallbackPrimary,
      candidateQueries: [fallbackPrimary],
      targetEnergy: fallbackEnergy,
      preferredGenres: intent.genre ? [intent.genre] : [],
      penalizedGenres: [],
      explanation: 'Fallback music intent expansion',
    };

    return fallbackResult;
  }
}

export const musicIntentExpander = new MusicIntentExpander();
export const expandMusicIntent = (intent: MusicIntent, context?: MusicContextSnapshot) =>
  musicIntentExpander.expandMusicIntent(intent, context);
