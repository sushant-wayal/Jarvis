import { MusicContextSnapshot } from './music-types';
import { prisma } from '@/lib/db/prisma';
import { memoryService } from '@/modules/memory/memory-service';
import { logger } from '@/lib/logging/logger';

export class MusicContextProvider {
  /**
   * Builds a rich contextual snapshot from existing Jarvis capabilities.
   * Degrades gracefully if any or all contextual signals are unavailable.
   */
  async getContextSnapshot(
    userId: string,
    conversationId?: string,
    timezone = 'UTC'
  ): Promise<MusicContextSnapshot> {
    const snapshot: MusicContextSnapshot = {};

    try {
      // 1. Time Signal
      const now = new Date();
      snapshot.currentTime = now.toISOString();

      try {
        const localHour = parseInt(
          new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            hour12: false,
            timeZone: timezone,
          }).format(now),
          10
        );

        if (localHour >= 5 && localHour < 12) {
          snapshot.timeOfDay = 'morning';
        } else if (localHour >= 12 && localHour < 17) {
          snapshot.timeOfDay = 'afternoon';
        } else if (localHour >= 17 && localHour < 22) {
          snapshot.timeOfDay = 'evening';
        } else {
          snapshot.timeOfDay = 'night';
        }
      } catch {
        const utcHour = now.getUTCHours();
        snapshot.timeOfDay =
          utcHour >= 5 && utcHour < 12
            ? 'morning'
            : utcHour >= 12 && utcHour < 17
            ? 'afternoon'
            : utcHour >= 17 && utcHour < 22
            ? 'evening'
            : 'night';
      }

      // 2. Parallel fetch for Location, Music Memories, and Recent Conversation
      const [locationRec, memories, recentMessages] = await Promise.all([
        prisma.userLocationState
          .findUnique({ where: { userId } })
          .catch(() => null),
        memoryService
          .getRelevantMemories(userId, 'music songs artists genre listening habit', 4)
          .catch(() => []),
        conversationId
          ? prisma.message
              .findMany({
                where: { conversationId },
                orderBy: { createdAt: 'desc' },
                take: 3,
              })
              .catch(() => [])
          : Promise.resolve([]),
      ]);

      // Populate location context
      if (locationRec) {
        const parts = [locationRec.area, locationRec.city, locationRec.state].filter(Boolean);
        if (parts.length > 0) {
          snapshot.location = parts.join(', ');
        }
      }

      // Populate relevant music memories
      if (memories && memories.length > 0) {
        snapshot.relevantMemories = memories.map((m) => m.content);
      }

      // Populate conversation context cues
      if (recentMessages && recentMessages.length > 0) {
        snapshot.conversationContext = recentMessages
          .reverse()
          .map((m) => `${m.role}: ${m.content}`)
          .join(' | ');
      }
    } catch (err) {
      logger.warn('Failed to compile complete music context snapshot, continuing with partial', {
        userId,
        err,
      });
    }

    return snapshot;
  }
}

export const musicContextProvider = new MusicContextProvider();
