import { ChatMessage, LocationContext, MemoryItem, PhoneContext, TaskItem, UserEventItem } from '@jarvis/shared';
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
  phoneContext?: PhoneContext;
}

export interface AssembledContext {
  userProfile: {
    id: string;
    name: string;
    preferences: Record<string, unknown>;
  };
  location?: LocationContext;
  workingMemory: Record<string, unknown>;
  relevantMemories: MemoryItem[];
  recentHistory: ChatMessage[];
  activeTasks: TaskItem[];
  upcomingEvents: UserEventItem[];
  phoneContext?: PhoneContext;
  systemContextString: string;
}

export class ContextEngine {
  async assembleContext(params: ContextParams): Promise<AssembledContext> {
    const { userId, conversationId, currentMessage, timezone, locale } = params;

    // 1. Fetch user profile, location, working memory, memories, history, and events in parallel
    const [user, locationRec, memories, historyRecords, taskRecords, eventRecords] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.userLocationState.findUnique({ where: { userId } }),
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
      prisma.userEvent.findMany({
        where: { userId, status: { in: ['PLANNED', 'UPCOMING', 'ACTIVE'] } },
        orderBy: { createdAt: 'desc' },
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

    const upcomingEvents: UserEventItem[] = eventRecords.map((e) => ({
      id: e.id,
      userId: e.userId,
      type: e.type as UserEventItem['type'],
      title: e.title,
      description: e.description ?? undefined,
      locationName: e.locationName ?? undefined,
      latitude: e.latitude ?? undefined,
      longitude: e.longitude ?? undefined,
      radiusMeters: e.radiusMeters ?? undefined,
      startAt: e.startAt?.toISOString(),
      endAt: e.endAt?.toISOString(),
      status: e.status as UserEventItem['status'],
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));

    let locationContext: LocationContext | undefined;
    if (locationRec) {
      locationContext = {
        latitude: locationRec.latitude,
        longitude: locationRec.longitude,
        accuracy: locationRec.accuracy ?? undefined,
        city: locationRec.city ?? undefined,
        state: locationRec.state ?? undefined,
        country: locationRec.country ?? undefined,
        area: locationRec.area ?? undefined,
        timestamp: locationRec.updatedAt.toISOString(),
      };
    }

    const userProfile = {
      id: user?.id || userId,
      name: user?.name || 'Sushant',
      preferences: user?.preferences ? JSON.parse(user.preferences) : {},
    };

    // 2. Compose structured, concise context string for the prompt
    let contextStr = `Current User: ${userProfile.name}\n`;
    contextStr += `Current Time: ${new Date().toLocaleString(locale, { timeZone: timezone })}\n`;
    contextStr += `Timezone: ${timezone}\n`;

    if (locationContext && (locationContext.city || locationContext.state)) {
      contextStr += `Current User Location: ${[locationContext.city, locationContext.state, locationContext.country].filter(Boolean).join(', ')}\n`;
    }

    if (upcomingEvents.length > 0) {
      contextStr += `\n[Active & Upcoming Plans / Trips]:\n` +
        upcomingEvents.map((e) => `- [${e.status}] ${e.title}${e.locationName ? ` in ${e.locationName}` : ''}`).join('\n') + '\n';
    }

    if (Object.keys(workingMem).length > 0) {
      contextStr += `\n[Active Task Working Memory]:\n${JSON.stringify(workingMem, null, 2)}\n`;
    }

    if (activeTasks.length > 0) {
      contextStr += `\n[Upcoming / Active Tasks]:\n` +
        activeTasks.map((t) => `- [${t.type}] ${t.title}${t.nextRunAt ? ` (Due: ${t.nextRunAt})` : ''}`).join('\n') + '\n';
    }

    if (memories.length > 0) {
      contextStr += `\n[Long-Term Knowledge & Preferences]:\n` +
        memories.map((m) => `- [${m.type}] ${m.content}`).join('\n') + '\n';
    }

    if (params.phoneContext) {
      const { capabilities, recentNotifications } = params.phoneContext;
      contextStr += `\n[Phone & Messaging Context]:\n`;
      contextStr += `- Device Capabilities: Calls=${capabilities.phoneCall ? 'Yes' : 'No'}, SMS=${capabilities.sms ? 'Yes' : 'No'}, Contacts=${capabilities.contacts ? 'Yes' : 'No'}, NotificationListener=${capabilities.notificationListener ? 'Active' : 'Inactive (Expo Go)'}\n`;
      
      if (params.phoneContext.aliases && Object.keys(params.phoneContext.aliases).length > 0) {
        contextStr += `- Contact Aliases Configured: ${JSON.stringify(params.phoneContext.aliases)}\n`;
      }
      if (params.phoneContext.contacts && params.phoneContext.contacts.length > 0) {
        contextStr += `- Contacts Loaded: ${params.phoneContext.contacts.length} contacts synchronized from device (use 'lookup_contact' to query).\n`;
      }

      if (recentNotifications.length > 0) {
        contextStr += `- Recent Notifications / Messages:\n`;
        for (const notif of recentNotifications.slice(0, 10)) {
          const time = new Date(notif.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
          contextStr += `  • [${notif.app}] from "${notif.sender}" (${time}): ${notif.content || '[content hidden]'}\n`;
        }
      }
    }

    return {
      userProfile,
      location: locationContext,
      workingMemory: workingMem,
      relevantMemories: memories,
      recentHistory,
      activeTasks,
      upcomingEvents,
      phoneContext: params.phoneContext,
      systemContextString: contextStr,
    };
  }
}

export const contextEngine = new ContextEngine();
