import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';

export interface CleanupResult {
  success: boolean;
  timestamp: string;
  durationMs: number;
  recordsDeleted: {
    conversations: number;
    messages: number;
    memories: number;
    eventReminders: number;
  };
}

export class DataRetentionService {
  /**
   * Identifies all expired records (conversations, memories, event reminders)
   * and permanently removes them to maintain optimal database storage.
   */
  async cleanupAllExpired(): Promise<CleanupResult> {
    const startTime = Date.now();
    const now = new Date();

    logger.info('Starting scheduled data retention cleanup', { cutoffTime: now.toISOString() });

    try {
      // 1. Identify expired conversations
      const expiredConversations = await prisma.conversation.findMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
        select: { id: true },
      });

      const conversationIds = expiredConversations.map((c) => c.id);
      let deletedMessagesCount = 0;
      let deletedConversationsCount = 0;

      if (conversationIds.length > 0) {
        // Cascade cleanup child records (messages, tool executions, agent steps, agent runs)
        const deletedMessages = await prisma.message.deleteMany({
          where: { conversationId: { in: conversationIds } },
        });
        deletedMessagesCount = deletedMessages.count;

        await prisma.toolExecution.deleteMany({
          where: { conversationId: { in: conversationIds } },
        });

        const agentRuns = await prisma.agentRun.findMany({
          where: { conversationId: { in: conversationIds } },
          select: { id: true },
        });
        const agentRunIds = agentRuns.map((r) => r.id);

        if (agentRunIds.length > 0) {
          await prisma.agentStep.deleteMany({
            where: { agentRunId: { in: agentRunIds } },
          });
          await prisma.agentRun.deleteMany({
            where: { id: { in: agentRunIds } },
          });
        }

        const convDeleteResult = await prisma.conversation.deleteMany({
          where: { id: { in: conversationIds } },
        });
        deletedConversationsCount = convDeleteResult.count;
      }

      // 2. Cleanup expired memories
      const memoryDeleteResult = await prisma.memory.deleteMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
      });

      // 3. Cleanup expired event reminders
      const reminderDeleteResult = await prisma.eventReminder.deleteMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
      });

      const durationMs = Date.now() - startTime;

      const result: CleanupResult = {
        success: true,
        timestamp: now.toISOString(),
        durationMs,
        recordsDeleted: {
          conversations: deletedConversationsCount,
          messages: deletedMessagesCount,
          memories: memoryDeleteResult.count,
          eventReminders: reminderDeleteResult.count,
        },
      };

      logger.info('Completed data retention cleanup', { ...result });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error('Data retention cleanup failed', err);
      return {
        success: false,
        timestamp: now.toISOString(),
        durationMs,
        recordsDeleted: {
          conversations: 0,
          messages: 0,
          memories: 0,
          eventReminders: 0,
        },
      };
    }
  }
}

export const dataRetentionService = new DataRetentionService();
