import { ChatMessage, MemoryItem, TaskItem } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { memoryService } from '@/modules/memory/memory-service';
import { workingMemoryService } from '@/modules/memory/working-memory';

export interface ContextParams {
  userId: string;
  conversationId: string;
  currentMessage: string;
  timezone: string;
  locale: string;
  deviceId?: string;
}

export interface AssembledContext {
  userProfile: {
    id: string;
    name: string;
    preferences: Record<string, unknown>;
  };
  workingMemory: Record<string, unknown>;
  relevantMemories: MemoryItem[];
  recentHistory: ChatMessage[];
  activeTasks: TaskItem[];
  systemContextString: string;
}

export class ContextEngine {
  async assembleContext(params: ContextParams): Promise<AssembledContext> {
    const { userId, conversationId, currentMessage, timezone, locale } = params;

    // 1. Fetch user profile, working memory, long-term memory, and history in parallel
    const [user, memories, historyRecords, taskRecords] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      memoryService.getRelevantMemories(userId, currentMessage, 5),
      prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.task.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: { nextRunAt: 'asc' },
        take: 3,
      }),
    ]);

    const workingMem = workingMemoryService.getAll(userId);

    historyRecords.reverse();
    const recentHistory: ChatMessage[] = historyRecords.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role as ChatMessage['role'],
      content: m.content,
      inputType: m.inputType as ChatMessage['inputType'],
      createdAt: m.createdAt.toISOString(),
      metadata: m.metadata ? JSON.parse(m.metadata) : undefined,
    }));

    const activeTasks: TaskItem[] = taskRecords.map((t) => ({
      id: t.id,
      userId: t.userId,
      type: t.type as TaskItem['type'],
      title: t.title,
      description: t.description ?? undefined,
      status: t.status as TaskItem['status'],
      schedule: t.schedule ?? undefined,
      condition: t.condition ?? undefined,
      timezone: t.timezone,
      nextRunAt: t.nextRunAt?.toISOString(),
      lastRunAt: t.lastRunAt?.toISOString(),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    const userProfile = {
      id: user?.id || userId,
      name: user?.name || 'Sushant',
      preferences: user?.preferences ? JSON.parse(user.preferences) : {},
    };

    // 2. Compose structured, concise context string for the prompt
    let contextStr = `Current User: ${userProfile.name}\n`;
    contextStr += `Current Time: ${new Date().toLocaleString(locale, { timeZone: timezone })}\n`;
    contextStr += `Timezone: ${timezone}\n`;

    if (Object.keys(workingMem).length > 0) {
      contextStr += `\n[Active Task Working Memory]:\n${JSON.stringify(workingMem, null, 2)}\n`;
    }

    if (activeTasks.length > 0) {
      contextStr += `\n[Upcoming / Active Tasks]:\n` + activeTasks.map((t) => `- [${t.type}] ${t.title}${t.nextRunAt ? ` (Due: ${t.nextRunAt})` : ''}`).join('\n') + '\n';
    }

    if (memories.length > 0) {
      contextStr += `\n[Long-Term Knowledge & Preferences]:\n` + memories.map((m) => `- [${m.type}] ${m.content}`).join('\n') + '\n';
    }

    return {
      userProfile,
      workingMemory: workingMem,
      relevantMemories: memories,
      recentHistory,
      activeTasks,
      systemContextString: contextStr,
    };
  }
}

export const contextEngine = new ContextEngine();
