import { MemoryItem, MemoryType } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { ttlEngine } from '@/modules/brain/ttl-engine';
import { memoryLifecycleService } from './memory-lifecycle';

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
