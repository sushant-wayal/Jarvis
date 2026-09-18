import { MemoryItem, MemoryType } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';
import { ttlEngine } from '@/modules/brain/ttl-engine';
import { memoryLifecycleService } from './memory-lifecycle';

export class MemoryService {
  async getRelevantMemories(userId: string, query?: string, limit = 5): Promise<MemoryItem[]> {
    try {
      const now = new Date();
      const rawMemories = await prisma.memory.findMany({
        where: {
          userId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: Math.max(limit * 6, 50),
      });

      // In-memory deduplication across types/variations
      const normalize = (t: string) =>
        t
          .toLowerCase()
          .trim()
          .replace(/^the\s+/i, '')
          .replace(/[.!?]+$/, '')
          .trim();

      const seen = new Set<string>();
      const memories: typeof rawMemories = [];
      for (const m of rawMemories) {
        const norm = normalize(m.content);
        if (!seen.has(norm)) {
          seen.add(norm);
          memories.push(m);
        }
      }

      if (!query || memories.length === 0 || memories.length <= limit) {
        return memories.slice(0, limit).map(this.mapToMemoryItem);
      }

      // Semantic LLM ranking: Select memories conceptually relevant to the user request
      try {
        const prompt = `You are a memory relevance ranker for personal AI assistant Jarvis.
User context / message: "${query}"

Available user memories:
${JSON.stringify(memories.slice(0, 30).map((m, idx) => ({ index: idx, type: m.type, content: m.content })), null, 2)}

Instructions:
Select up to ${limit} most relevant memories for the user's situation. Understand conceptual synonyms (e.g. food restrictions relate to allergies; work relates to job/tech stack).
Respond strictly in JSON array of index numbers in order of relevance: [0, 1, ...]`;

        const modelsToTry = [FAST_FALLBACK_MODELS[0] || 'gemini-flash-lite-latest', DEFAULT_MODEL];
        for (const model of modelsToTry) {
          try {
            const res = await aiClient.models.generateContent({
              model,
              contents: prompt,
            });
            const text = res.text?.trim() || '';
            const cleanJson = text.substring(text.indexOf('['), text.lastIndexOf(']') + 1);
            if (cleanJson) {
              const indices = JSON.parse(cleanJson) as number[];
              if (Array.isArray(indices) && indices.length > 0) {
                const selected = indices
                  .filter((i) => typeof i === 'number' && i >= 0 && i < memories.length)
                  .slice(0, limit)
                  .map((i) => memories[i]);
                if (selected.length > 0) {
                  return selected.map(this.mapToMemoryItem);
                }
              }
            }
          } catch {
            // Try next model
          }
        }
      } catch (err) {
        logger.warn('Semantic memory ranking fallback to importance order', { err: String(err) });
      }

      return memories.slice(0, limit).map(this.mapToMemoryItem);
    } catch (err) {
      logger.error('Failed to fetch relevant memories', err, { userId });
      return [];
    }
  }

  async saveMemory(
    userId: string,
    type: MemoryType,
    content: string,
    importance = 3,
    ttlDays?: number,
    expiresAt?: Date,
    source = 'USER_EXPLICIT'
  ): Promise<MemoryItem> {
    const trimmedContent = content.trim();

    // Ensure User record exists in DB
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, name: 'Sushant' },
    });

    const result = await memoryLifecycleService.processCandidate({
      userId,
      type,
      content: trimmedContent,
      importance,
      confidence: 0.95,
      source,
      ttlDays,
      expiresAt,
    });

    if (result.memoryId) {
      const memory = await prisma.memory.findUnique({ where: { id: result.memoryId } });
      if (memory) {
        return this.mapToMemoryItem(memory);
      }
    }

    // Fallback if rejected or discarded: find latest memory of this type or create stub
    const latest = await prisma.memory.findFirst({
      where: { userId, type },
      orderBy: { updatedAt: 'desc' },
    });

    if (latest) {
      return this.mapToMemoryItem(latest);
    }

    return {
      id: 'rejected-candidate',
      userId,
      type,
      content: trimmedContent,
      importance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    try {
      await prisma.memory.deleteMany({
        where: { id: memoryId, userId },
      });
      return true;
    } catch {
      return false;
    }
  }

  async clearAllMemories(userId: string): Promise<number> {
    const deleted = await prisma.memory.deleteMany({
      where: { userId },
    });
    return deleted.count;
  }

  private mapToMemoryItem(m: {
    id: string;
    userId: string;
    type: string;
    content: string;
    importance: number;
    createdAt: Date;
    updatedAt: Date;
    expiresAt?: Date | null;
  }): MemoryItem {
    return {
      id: m.id,
      userId: m.userId,
      type: m.type as MemoryType,
      content: m.content,
      importance: m.importance,
      expiresAt: m.expiresAt ? m.expiresAt.toISOString() : undefined,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }
}

export const memoryService = new MemoryService();
