import { MemoryType } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';

export interface MemoryCandidate {
  userId: string;
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
  source?: string;
}

export class MemoryLifecycleService {
  /**
   * Evaluates memory candidate against existing knowledge to detect and resolve contradictions
   */
  async processCandidate(candidate: MemoryCandidate): Promise<void> {
    try {
      const existingMemories = await prisma.memory.findMany({
        where: {
          userId: candidate.userId,
          type: candidate.type,
        },
      });

      // Simple keyword / entity conflict detection
      const words = candidate.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      let conflictingMemoryId: string | null = null;

      for (const mem of existingMemories) {
        const memWords = mem.content.toLowerCase().split(/\s+/);
        const overlap = words.filter((w) => memWords.includes(w));
        // If significant topical overlap detected with high confidence new data
        if (overlap.length >= 2 && candidate.confidence >= 0.8) {
          conflictingMemoryId = mem.id;
          break;
        }
      }

      if (conflictingMemoryId) {
        logger.info('Updating existing conflicting memory with latest user knowledge', {
          conflictingMemoryId,
          newContent: candidate.content,
        });

        await prisma.memory.update({
          where: { id: conflictingMemoryId },
          data: {
            content: candidate.content,
            importance: candidate.importance,
            confidence: candidate.confidence,
            source: candidate.source || 'EXTRACTED_CONVERSATION',
            lastReferencedAt: new Date(),
          },
        });
      } else {
        await prisma.memory.create({
          data: {
            userId: candidate.userId,
            type: candidate.type,
            content: candidate.content,
            importance: candidate.importance,
            confidence: candidate.confidence,
            source: candidate.source || 'EXTRACTED_CONVERSATION',
            lastReferencedAt: new Date(),
          },
        });
      }
    } catch (err) {
      logger.warn('MemoryLifecycle processing error', { error: String(err) });
    }
  }

  /**
   * Cleans up expired memories
   */
  async cleanupExpired(): Promise<number> {
    const res = await prisma.memory.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
    return res.count;
  }
}

export const memoryLifecycleService = new MemoryLifecycleService();
