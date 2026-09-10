import { MemoryType } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { aiClient, DEFAULT_MODEL } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';
import { memoryService } from '@/modules/memory/memory-service';
import { privacyMasker } from './privacy-masker';

export class MemoryExtractor {
  async extractAndStoreMemories(
    userId: string,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    if (!userMessage.trim()) {
      return;
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const verifiedUserName = user?.name || 'Sushant';

      // Mask any PII before LLM extraction
      const { maskedText: maskedUserMsg } = privacyMasker.mask(userMessage);
      const { maskedText: maskedAssistantResp } = privacyMasker.mask(assistantResponse);

      const prompt = `You are a memory extraction engine for personal AI assistant Jarvis.
Verified User Profile:
- Known Name: "${verifiedUserName}"

User message: "${maskedUserMsg}"
Assistant response (context only): "${maskedAssistantResp}"

Instructions:
1. Determine if the USER explicitly stated any persistent personal fact, preference, habit, allergy, rule, or persona detail about themselves in first-person that should be saved in long-term memory.
2. CRITICAL GROUND TRUTH & IDENTITY BOUNDARIES:
   - GROUND TRUTH COMES ONLY FROM THE USER: NEVER extract user facts, identity, or preferences inferred from the Assistant's response, tool outputs, contact book results, or external data.
   - QUESTIONS ARE NOT FACTS: Casual questions or queries (e.g. "what is mom's phone number", "where is John") state NO facts about the user.
   - NEVER INFER IDENTITY FROM CONTACTS: If the conversation mentions a third-party contact (e.g. "Darshan's mom", "Rahul's brother"), NEVER infer that the user is that person!
   - IDENTITY PROTECTION: The user is "${verifiedUserName}". NEVER extract a memory claiming the user has a different name unless the user explicitly said "Call me [Name]" or "My name is [Name]".
   - DO NOT save temporary plans, casual chatter, or current tasks (e.g. "I am going to the store", "What is the weather").

3. Output format:
If a persistent long-term memory is found, respond strictly with a JSON array:
[
  {
    "type": "FACT" | "PREFERENCE" | "PERSON" | "PROJECT" | "ROUTINE",
    "content": "Concise description of the long-term memory",
    "importance": 1-5,
    "ttlDays": number (1 to 365 days; e.g. 180-365 for core rules/habits/allergies, 30-90 for projects, 7-30 for seasonal routines)
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
        ttlDays?: number;
      }>;

      for (const item of items) {
        if (item.content && item.type) {
          await memoryService.saveMemory(
            userId,
            item.type,
            item.content,
            item.importance || 3,
            item.ttlDays,
            undefined,
            'EXTRACTED_CONVERSATION'
          );
          logger.info('Memory Extractor stored new memory via lifecycle', { userId, memory: item });
        }
      }
    } catch (err) {
      logger.warn('Memory extraction step completed without additions', { error: String(err) });
    }
  }
}

export const memoryExtractor = new MemoryExtractor();
