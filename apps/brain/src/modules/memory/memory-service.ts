import { MemoryItem, MemoryType } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';

export class MemoryService {
  async getRelevantMemories(userId: string, query?: string, limit = 5): Promise<MemoryItem[]> {
    try {
      const memories = await prisma.memory.findMany({
        where: { userId },
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: limit * 2,
      });

      if (!query || memories.length === 0) {
        return memories.slice(0, limit).map(this.mapToMemoryItem);
      }

      // Keyword & relevance ranking
      const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const ranked = memories.map((m) => {
        const contentLower = m.content.toLowerCase();
        let score = m.importance * 2;
        for (const word of queryWords) {
          if (contentLower.includes(word)) {
            score += 5;
          }
        }
        return { memory: m, score };
      });

      ranked.sort((a, b) => b.score - a.score);
      return ranked.slice(0, limit).map((r) => this.mapToMemoryItem(r.memory));
    } catch (err) {
      logger.error('Failed to fetch relevant memories', err, { userId });
      return [];
    }
  }

  async saveMemory(
    userId: string,
    type: MemoryType,
    content: string,
    importance = 3
  ): Promise<MemoryItem> {
    const existing = await prisma.memory.findFirst({
      where: {
        userId,
        content: { equals: content.trim() },
      },
    });

    if (existing) {
      const updated = await prisma.memory.update({
        where: { id: existing.id },
        data: { importance, updatedAt: new Date() },
      });
      return this.mapToMemoryItem(updated);
    }

    // Ensure User record exists in DB
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, name: 'Sushant' },
    });

    const created = await prisma.memory.create({
      data: {
        userId,
        type,
        content: content.trim(),
        importance,
      },
    });

    logger.info('Saved long-term memory', { userId, type, content });
    return this.mapToMemoryItem(created);
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
  }): MemoryItem {
    return {
      id: m.id,
      userId: m.userId,
      type: m.type as MemoryType,
      content: m.content,
      importance: m.importance,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }
}

export const memoryService = new MemoryService();
