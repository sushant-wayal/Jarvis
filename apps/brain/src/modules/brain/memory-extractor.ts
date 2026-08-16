import { MemoryType } from '@jarvis/shared';
import { aiClient, DEFAULT_MODEL } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';
import { memoryService } from '@/modules/memory/memory-service';

export class MemoryExtractor {
  async extractAndStoreMemories(userId: string, userMessage: string, assistantResponse: string): Promise<void> {
    // Quick heuristic filtering before calling AI extractor
    const triggerWords = ['prefer', 'call me', 'my name', 'i like', 'i hate', 'my timezone', 'always', 'never', 'remember that'];
    const messageLower = userMessage.toLowerCase();
    const matchesTrigger = triggerWords.some((word) => messageLower.includes(word));

    if (!matchesTrigger && userMessage.length < 15) {
      return;
    }

    try {
      const prompt = `Analyze this user interaction and determine if the user stated any long-term fact, preference, rule, or persona detail that should be saved in long-term memory for future conversations.

User message: "${userMessage}"
Assistant response: "${assistantResponse}"

Do NOT save temporary plans, casual questions, or current tasks (e.g. "I'm going to the gym tomorrow", "What is the weather").
ONLY extract persistent long-term facts/preferences (e.g. "I prefer to be called Sushant", "I am allergic to peanuts", "I prefer concise answers").

If a long-term memory is found, respond strictly with a valid JSON array of objects:
[
  {
    "type": "FACT" | "PREFERENCE" | "PERSON" | "PROJECT" | "ROUTINE",
    "content": "Description of long-term memory",
    "importance": 1-5
  }
]

If NO long-term memory is present, respond with: []`;

      const response = await aiClient.models.generateContent({
        model: DEFAULT_MODEL,
        contents: prompt,
      });

      const text = response.text?.trim() || '[]';
      const cleanJson = text.substring(text.indexOf('['), text.lastIndexOf(']') + 1);
      if (!cleanJson || cleanJson === '[]') return;

      const items = JSON.parse(cleanJson) as Array<{
        type: MemoryType;
        content: string;
        importance?: number;
      }>;

      for (const item of items) {
        if (item.content && item.type) {
          await memoryService.saveMemory(userId, item.type, item.content, item.importance || 3);
          logger.info('Memory Extractor stored new memory', { userId, memory: item });
        }
      }
    } catch (err) {
      logger.warn('Memory extraction step completed without additions', { error: String(err) });
    }
  }
}

export const memoryExtractor = new MemoryExtractor();
