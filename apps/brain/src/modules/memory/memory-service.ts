import { MemoryItem, MemoryType } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { ttlEngine } from '@/modules/brain/ttl-engine';

export class MemoryService {
  async getRelevantMemories(userId: string, query?: string, limit = 5): Promise<MemoryItem[]> {
    try {
      const now = new Date();
      const memories = await prisma.memory.findMany({
        where: {
          userId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: limit * 2,
      });

      if (!query || memories.length === 0) {
        return memories.slice(0, limit).map(this.mapToMemoryItem);
      }

      // Keyword & relevance ranking
      const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const ranked = memories.map((m: { content: string; importance: number; id: string; userId: string; type: string; createdAt: Date; updatedAt: Date; expiresAt: Date | null }) => {
        const contentLower = m.content.toLowerCase();
        let score = m.importance * 2;
        for (const word of queryWords) {
          if (contentLower.includes(word)) {
            score += 5;
          }
        }
        return { memory: m, score };
      });

      ranked.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
      return ranked.slice(0, limit).map((r: { memory: { id: string; userId: string; type: string; content: string; importance: number; createdAt: Date; updatedAt: Date; expiresAt: Date | null }; score: number }) => this.mapToMemoryItem(r.memory));
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
    expiresAt?: Date
  ): Promise<MemoryItem> {
    const trimmedContent = content.trim();

    // Determine dynamic expiry date
    let finalExpiresAt: Date;
    if (expiresAt) {
      finalExpiresAt = expiresAt;
    } else if (ttlDays !== undefined && ttlDays > 0) {
      finalExpiresAt = ttlEngine.calculateExpiryDate(ttlDays);
    } else {
      const suggestedDays = await ttlEngine.suggestMemoryTtl(trimmedContent, type);
      finalExpiresAt = ttlEngine.calculateExpiryDate(suggestedDays);
    }

    const existing = await prisma.memory.findFirst({
      where: {
        userId,
        content: { equals: trimmedContent },
      },
    });

    if (existing) {
      // Whenever record is updated, renew its TTL and updatedAt
      const updated = await prisma.memory.update({
        where: { id: existing.id },
        data: {
          importance,
          expiresAt: finalExpiresAt,
          updatedAt: new Date(),
        },
      });
      logger.info('Updated existing memory and renewed TTL', { userId, memoryId: existing.id, expiresAt: finalExpiresAt });
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
        content: trimmedContent,
        importance,
        expiresAt: finalExpiresAt,
      },
    });

    logger.info('Saved long-term memory with TTL', { userId, type, content: trimmedContent, expiresAt: finalExpiresAt });
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
