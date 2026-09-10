import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';

export class TtlEngine {
  private readonly MIN_TTL_DAYS = 1;
  private readonly MAX_TTL_DAYS = 365;

  /**
   * Suggests dynamic TTL in days for a conversation based on its topic, urgency, and lifespan
   */
  async suggestConversationTtl(userMessage: string, assistantResponse?: string): Promise<number> {
    const modelsToTry = Array.from(new Set([DEFAULT_MODEL, ...FAST_FALLBACK_MODELS]));
    const prompt = `You are Jarvis's data lifecycle analyzer. Determine how many days this conversation should be retained before expiring (Time-To-Live).

User Message: "${userMessage}"
${assistantResponse ? `Assistant Response: "${assistantResponse.slice(0, 300)}"` : ''}

Lifespan Guidelines:
- Quick answers, simple calculations, weather lookups, transient chit-chat: 1 to 3 days
- Upcoming weekly schedules, trip planning, event arrangements: 7 to 14 days
- Multi-step tasks, ongoing research, active projects, technical troubleshooting: 14 to 60 days
- Deep personal brainstorming, key strategic plans: 60 to 90 days

Respond strictly with a single integer between 1 and 365 representing the number of days to keep this conversation active.
Example output: 7`;

    for (const model of modelsToTry) {
      try {
        const response = await aiClient.models.generateContent({
          model,
          contents: prompt,
        });

        const text = response.text?.trim() || '';
        const match = text.match(/\d+/);
        if (match) {
          const days = parseInt(match[0], 10);
          if (!isNaN(days)) {
            return this.clamp(days);
          }
        }
      } catch (err) {
        logger.warn(`LLM conversation TTL estimation failed on model ${model}`, { error: String(err) });
      }
    }

    return this.heuristicConversationTtl(userMessage);
  }

  /**
   * Suggests dynamic TTL in days for a memory item based on its type and content
   */
  async suggestMemoryTtl(content: string, type: string): Promise<number> {
    const modelsToTry = Array.from(new Set([DEFAULT_MODEL, ...FAST_FALLBACK_MODELS]));
    const prompt = `You are Jarvis's memory lifecycle analyzer. Determine how many days this memory should be kept in active storage before expiring.

Memory Type: ${type}
Memory Content: "${content}"

Lifespan Guidelines:
- Permanent personal identity, allergies, dietary constraints, core relationships: 180 to 365 days
- Long-term preferences, coding styles, general habits: 90 to 180 days
- Active projects, ongoing goals, current workplace: 30 to 90 days
- Seasonal routines, short-term schedules, temporary constraints: 7 to 30 days

Respond strictly with a single integer between 1 and 365 representing the number of days.
Example output: 60`;

    for (const model of modelsToTry) {
      try {
        const response = await aiClient.models.generateContent({
          model,
          contents: prompt,
        });

        const text = response.text?.trim() || '';
        const match = text.match(/\d+/);
        if (match) {
          const days = parseInt(match[0], 10);
          if (!isNaN(days)) {
            return this.clamp(days);
          }
        }
      } catch (err) {
        logger.warn(`LLM memory TTL estimation failed on model ${model}`, { error: String(err) });
      }
    }

    return this.heuristicMemoryTtl(content, type);
  }

  /**
   * Calculates expiration Date object from TTL in days
   */
  calculateExpiryDate(ttlDays: number): Date {
    const clamped = this.clamp(ttlDays);
    return new Date(Date.now() + clamped * 24 * 60 * 60 * 1000);
  }

  private clamp(days: number): number {
    return Math.max(this.MIN_TTL_DAYS, Math.min(this.MAX_TTL_DAYS, days));
  }

  private heuristicConversationTtl(message: string): number {
    const lower = message.toLowerCase();
    if (lower.includes('project') || lower.includes('build') || lower.includes('architecture') || lower.includes('design')) {
      return 30;
    }
    if (lower.includes('trip') || lower.includes('travel') || lower.includes('flight') || lower.includes('hotel') || lower.includes('weekend') || lower.includes('plan')) {
      return 14;
    }
    if (lower.includes('task') || lower.includes('remind') || lower.includes('todo')) {
      return 7;
    }
    return 3;
  }

  private heuristicMemoryTtl(content: string, type: string): number {
    const upperType = type.toUpperCase();
    if (upperType === 'PERSON' || upperType === 'CONSTRAINT' || upperType === 'PREFERENCE') {
      return 180;
    }
    if (upperType === 'PROJECT' || upperType === 'GOAL') {
      return 60;
    }
    if (upperType === 'ROUTINE' || upperType === 'HABIT') {
      return 30;
    }
    return 90;
  }
}

export const ttlEngine = new TtlEngine();
