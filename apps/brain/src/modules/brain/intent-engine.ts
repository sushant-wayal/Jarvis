import { IntentType } from '@jarvis/shared';
import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';

export interface ClassifiedIntent {
  intent: IntentType;
  confidence: number;
  entities: {
    expression?: string;
    searchQuery?: string;
    scheduleTime?: string;
    condition?: string;
    memoryContent?: string;
    targetTopic?: string;
    location?: string;
  };
  reason?: string;
}

export class IntentEngine {
  /**
   * Semantically classifies user intent and extracts parameters using LLM reasoning.
   * Adheres to Rule 37 & 38: The LLM is the sole semantic engine for intent and entity extraction.
   */
  async classify(message: string, recentContext = ''): Promise<ClassifiedIntent> {
    const trimmed = message.trim();
    if (!trimmed) {
      return {
        intent: 'CONVERSATION',
        confidence: 1.0,
        entities: {},
        reason: 'Empty message',
      };
    }

    const prompt = `You are Jarvis's primary intent and entity understanding engine.
Analyze the user's natural language request semantically, regardless of language (English, Hindi, Hinglish, colloquialisms), word order, or phrasing.

User Message: "${trimmed}"
${recentContext ? `Recent Context: "${recentContext.slice(-300)}"` : ''}

Categories:
- CONVERSATION: Casual greeting, chit-chat, thanks, opinion, general dialogue
- QUESTION: Explanations, factual inquiries, reasoning
- INFORMATION_LOOKUP: Date, time, current weather, static device info
- CALCULATION: Arithmetic, conversions, math expressions
- ACTION: Native device action (open app, media playback, call, message)
- TASK_CREATION: Reminders, scheduled tasks, alarms, to-dos
- TASK_QUERY: Inquiries about existing tasks or reminders
- MEMORY_UPDATE: User personal preference, fact, habit, rule to remember
- MEMORY_QUERY: Asking what Jarvis knows or remembers about the user
- SEARCH: External web search or news query
- NAVIGATION: Directions, routes, navigation
- PLANNING: Itinerary, day planning, advice
- REMINDER: Location-triggered reminders or notifications
- EVENT_CREATION: Trips, travel plans, calendar events
- LOCATION_QUERY: Asking about current location, city, state
- PROACTIVE_REQUEST: Asking for summary of notifications or messages

Extract relevant entities if present:
- expression: Math or calculation expression
- searchQuery: Clean search query without commanding words
- scheduleTime: Natural language or specified schedule time
- location: Mentioned city, place, or destination
- memoryContent: Pure personal fact or preference without command phrases

Respond strictly in valid JSON format:
{
  "intent": "CATEGORY",
  "confidence": 0.95,
  "entities": {
    "expression": "string or null",
    "searchQuery": "string or null",
    "scheduleTime": "string or null",
    "location": "string or null",
    "memoryContent": "string or null"
  },
  "reason": "brief semantic explanation"
}`;

    const models = Array.from(new Set([DEFAULT_MODEL, ...FAST_FALLBACK_MODELS]));

    for (const model of models) {
      try {
        const res = await aiClient.models.generateContent({
          model,
          contents: prompt,
        });

        const raw = res.text?.trim() || '{}';
        const cleanJson = raw
          .substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
          .replace(/:\s*undefined\b/g, ': null');
        if (!cleanJson) continue;

        const parsed = JSON.parse(cleanJson) as {
          intent?: IntentType;
          confidence?: number;
          entities?: ClassifiedIntent['entities'];
          reason?: string;
        };

        if (parsed.intent) {
          return {
            intent: parsed.intent,
            confidence: parsed.confidence ?? 0.9,
            entities: parsed.entities || {},
            reason: parsed.reason || 'LLM semantic classification',
          };
        }
      } catch (err) {
        logger.warn('IntentEngine LLM model attempt failed', { model, error: String(err) });
      }
    }

    return {
      intent: 'CONVERSATION',
      confidence: 0.7,
      entities: {},
      reason: 'Fallback to conversational intent after LLM timeout',
    };
  }
}

export const intentEngine = new IntentEngine();
