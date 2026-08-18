import { IntentType } from '@jarvis/shared';
import { aiClient, DEFAULT_MODEL } from '@/lib/ai/gemini';
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
   * Fast rule-based classifier for sub-10ms deterministic intents
   */
  classifyFast(message: string): ClassifiedIntent | null {
    const msg = message.trim().toLowerCase();

    // 1. Math / Calculation queries
    const mathRegex = /(\d+(?:\.\d+)?)\s*(?:into|times|multiplied by|\*|x|\+|\-|\/|divided by|percentage of|% of|\^)\s*(\d+(?:\.\d+)?)/i;
    if (mathRegex.test(msg) || /^what is \d+/i.test(msg) || /^calculate /i.test(msg)) {
      return {
        intent: 'CALCULATION',
        confidence: 0.98,
        entities: { expression: message },
        reason: 'Matched arithmetic pattern',
      };
    }

    // 2. Date & Time queries
    if (/^(what time is it|current time|what is the time|tell me the time|today's date|what is the date|what day is it)/i.test(msg)) {
      return {
        intent: 'INFORMATION_LOOKUP',
        confidence: 0.99,
        entities: { targetTopic: 'datetime' },
        reason: 'Matched time/date query pattern',
      };
    }

    // 3. Location queries
    if (/^(where am i|what is my location|what city am i in|what's my current location|current location)/i.test(msg)) {
      return {
        intent: 'LOCATION_QUERY',
        confidence: 0.98,
        entities: { targetTopic: 'location' },
        reason: 'Matched current location query',
      };
    }

    // 4. Weather queries
    if (/weather|temperature|forecast|rain today|will it rain/i.test(msg)) {
      return {
        intent: 'INFORMATION_LOOKUP',
        confidence: 0.95,
        entities: { targetTopic: 'weather' },
        reason: 'Matched weather query pattern',
      };
    }

    // 5. Location-triggered or event-based reminders
    if (/^(when i reach|when i am in|when i get to|when i'm in|when i'm at|when i arrive at)/i.test(msg)) {
      const locMatch = msg.match(/(?:when i reach|when i am in|when i get to|when i'm in|when i'm at|when i arrive at)\s+([^,]+)/i);
      return {
        intent: 'REMINDER',
        confidence: 0.96,
        entities: {
          location: locMatch ? locMatch[1].trim() : undefined,
          scheduleTime: message,
        },
        reason: 'Matched location-triggered reminder pattern',
      };
    }

    // 6. Future trips / Events
    if (/^(i'm going to|i am going to|i am visiting|i'm visiting|planning a trip to)\s+([^.]+)/i.test(msg)) {
      const locMatch = msg.match(/(?:going to|visiting|trip to)\s+([a-zA-Z\s]+?)(?:\s+next|\s+this|\s+tomorrow|\s+in|$)/i);
      return {
        intent: 'EVENT_CREATION',
        confidence: 0.94,
        entities: {
          location: locMatch ? locMatch[1].trim() : undefined,
        },
        reason: 'Matched future trip / event creation pattern',
      };
    }

    // 7. Time-based Reminder / Scheduled Task creation
    if (/^(remind me|set a reminder|schedule a task|wake me up|alert me)/i.test(msg)) {
      return {
        intent: 'TASK_CREATION',
        confidence: 0.95,
        entities: { scheduleTime: message },
        reason: 'Matched reminder creation trigger',
      };
    }

    // 8. Memory updates
    if (/^(remember that|never forget that|my favorite|i prefer|note down that|save this preference)/i.test(msg)) {
      return {
        intent: 'MEMORY_UPDATE',
        confidence: 0.96,
        entities: { memoryContent: message.replace(/^(remember that|never forget that|note down that)\s*/i, '') },
        reason: 'Matched explicit memory storage trigger',
      };
    }

    // 9. Search queries
    if (/^(search for|look up|google|find latest|who won|current news)/i.test(msg)) {
      return {
        intent: 'SEARCH',
        confidence: 0.92,
        entities: { searchQuery: message.replace(/^(search for|look up|google)\s*/i, '') },
        reason: 'Matched search command trigger',
      };
    }

    return null;
  }

  /**
   * Comprehensive intent classification combining fast heuristics and structured AI classification
   */
  async classify(message: string, recentContext = ''): Promise<ClassifiedIntent> {
    const fast = this.classifyFast(message);
    if (fast) {
      return fast;
    }

    // AI Classification for ambiguous queries
    try {
      const prompt = `Classify the user's primary intent into exactly one category:
CONVERSATION, QUESTION, INFORMATION_LOOKUP, CALCULATION, ACTION, TASK_CREATION, TASK_QUERY, MEMORY_UPDATE, MEMORY_QUERY, SEARCH, NAVIGATION, PLANNING, REMINDER, EVENT_CREATION, LOCATION_QUERY, PROACTIVE_REQUEST, UNKNOWN.

User message: "${message}"
Recent context: "${recentContext.slice(-200)}"

Respond in pure JSON with format:
{"intent": "CATEGORY", "confidence": 0.95, "reason": "brief explanation"}`;

      const res = await aiClient.models.generateContent({
        model: DEFAULT_MODEL,
        contents: prompt,
      });

      const raw = res.text?.trim() || '{}';
      const cleanJson = raw.replace(/^```json/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleanJson) as { intent?: IntentType; confidence?: number; reason?: string };

      if (parsed.intent) {
        return {
          intent: parsed.intent,
          confidence: parsed.confidence || 0.85,
          entities: {},
          reason: parsed.reason,
        };
      }
    } catch (err) {
      logger.warn('IntentEngine fallback to CONVERSATION', { error: String(err) });
    }

    return {
      intent: 'CONVERSATION',
      confidence: 0.7,
      entities: {},
      reason: 'Default conversational fallback',
    };
  }
}

export const intentEngine = new IntentEngine();
