import {
  AgentRun,
  ApiResponse,
  BrainResponse,
  ChatMessage,
  ConversationSummary,
  CreateEventReminderRequest,
  CreateTaskRequest,
  CreateUserEventRequest,
  EventReminderItem,
  HealthStatus,
  LocationContext,
  LocationUpdate,
  MemoryItem,
  NotificationItem,
  TaskItem,
  UpdateEventReminderRequest,
  UpdateTaskRequest,
  UpdateUserEventRequest,
  UserEventItem,
  VoiceResponse,
} from '@jarvis/shared';

// Direct IP address of the local Jarvis Brain backend
const DEFAULT_API_URL = 'http://192.168.1.71:3000/api/v1';

export class JarvisApiClient {
  private baseUrl: string = DEFAULT_API_URL;

  public setBaseUrl(url: string): void {
    this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  async checkHealth(): Promise<HealthStatus | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      const json = (await res.json()) as ApiResponse<HealthStatus>;
      return json.data || null;
    } catch {
      return null;
    }
  }

  async sendChatMessage(
    message: string,
    conversationId?: string,
    speakResponse = false
  ): Promise<BrainResponse> {
    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        message,
        conversationId,
        speakResponse,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      }),
    });

    const json = (await res.json()) as ApiResponse<BrainResponse>;
    if (!json.success || !json.data) {
      throw new Error(json.error?.message || 'Failed to get Jarvis response');
    }

    return json.data;
  }

  async sendMessage(params: {
    message: string;
    conversationId?: string;
    speakResponse?: boolean;
  }): Promise<BrainResponse> {
    return this.sendChatMessage(params.message, params.conversationId, params.speakResponse);
  }

  async sendVoiceAudio(
    audioBase64: string,
    mimeType = 'audio/m4a',
    conversationId?: string
  ): Promise<VoiceResponse> {
    const res = await fetch(`${this.baseUrl}/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType,
        conversationId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      }),
    });

    const json = (await res.json()) as ApiResponse<VoiceResponse>;
    if (!json.success || !json.data) {
      throw new Error(json.error?.message || 'Unable to process voice audio');
    }

    return json.data;
  }

  async synthesizeSpeech(text: string): Promise<{ audioBase64: string } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ text }),
      });

      const json = (await res.json()) as ApiResponse<{ audioBase64: string }>;
      if (json.success && json.data) {
        return json.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  async getConversations(): Promise<ConversationSummary[]> {
    const res = await fetch(`${this.baseUrl}/conversations`, {
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<ConversationSummary[]>;
    return json.data || [];
  }

  async getConversationMessages(id: string): Promise<ChatMessage[]> {
    const res = await fetch(`${this.baseUrl}/conversations/${id}`, {
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<{ messages: ChatMessage[] }>;
    return json.data?.messages || [];
  }

  async getMessages(id: string): Promise<ChatMessage[]> {
    return this.getConversationMessages(id);
  }

  async deleteConversation(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/conversations/${id}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
    return Boolean(json.data?.deleted);
  }

  async getMemories(): Promise<MemoryItem[]> {
    const res = await fetch(`${this.baseUrl}/memory`, {
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<MemoryItem[]>;
    return json.data || [];
  }

  async deleteMemory(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/memory?id=${id}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
    return Boolean(json.data?.deleted);
  }

  async getTasks(status?: string): Promise<TaskItem[]> {
    const url = status ? `${this.baseUrl}/tasks?status=${encodeURIComponent(status)}` : `${this.baseUrl}/tasks`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<TaskItem[]>;
    return json.data || [];
  }

  async createTask(data: CreateTaskRequest): Promise<TaskItem> {
    const res = await fetch(`${this.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as ApiResponse<TaskItem>;
    if (!json.success || !json.data) {
      throw new Error(json.error?.message || 'Failed to create task');
    }
    return json.data;
  }

  async updateTask(id: string, data: UpdateTaskRequest): Promise<TaskItem> {
    const res = await fetch(`${this.baseUrl}/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as ApiResponse<TaskItem>;
    if (!json.success || !json.data) {
      throw new Error(json.error?.message || 'Failed to update task');
    }
    return json.data;
  }

  async deleteTask(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/tasks/${id}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
    return Boolean(json.data?.deleted);
  }

  async getNotifications(): Promise<NotificationItem[]> {
    const res = await fetch(`${this.baseUrl}/notifications`, {
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<NotificationItem[]>;
    return json.data || [];
  }

  async dismissNotification(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = (await res.json()) as ApiResponse<{ dismissed: boolean }>;
    return Boolean(json.data?.dismissed);
  }

  async getAgentRun(id: string): Promise<AgentRun | null> {
    const res = await fetch(`${this.baseUrl}/agent/${id}`, {
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<AgentRun>;
    return json.data || null;
  }

  async confirmAction(actionId: string, confirmed: boolean): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ actionId, confirmed }),
    });
    const json = (await res.json()) as ApiResponse<{ confirmed: boolean }>;
    return Boolean(json.data?.confirmed);
  }

  // Location Awareness Endpoints
  async updateLocation(coords: LocationUpdate): Promise<LocationContext | null> {
    try {
      const res = await fetch(`${this.baseUrl}/location/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(coords),
      });
      const json = (await res.json()) as ApiResponse<LocationContext>;
      return json.data || null;
    } catch {
      return null;
    }
  }

  async getCurrentLocation(): Promise<LocationContext | null> {
    try {
      const res = await fetch(`${this.baseUrl}/location/current`, {
        headers: { Accept: 'application/json' },
      });
      const json = (await res.json()) as ApiResponse<LocationContext>;
      return json.data || null;
    } catch {
      return null;
    }
  }

  // Event & Reminders Endpoints
  async getEvents(status?: string): Promise<UserEventItem[]> {
    const url = status ? `${this.baseUrl}/events?status=${encodeURIComponent(status)}` : `${this.baseUrl}/events`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const json = (await res.json()) as ApiResponse<UserEventItem[]>;
    return json.data || [];
  }

  async createEvent(data: CreateUserEventRequest): Promise<UserEventItem> {
    const res = await fetch(`${this.baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as ApiResponse<UserEventItem>;
    if (!json.success || !json.data) throw new Error(json.error?.message || 'Failed to create event');
    return json.data;
  }

  async updateEvent(id: string, data: UpdateUserEventRequest): Promise<UserEventItem> {
    const res = await fetch(`${this.baseUrl}/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as ApiResponse<UserEventItem>;
    if (!json.success || !json.data) throw new Error(json.error?.message || 'Failed to update event');
    return json.data;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/events/${id}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
    return Boolean(json.data?.deleted);
  }

  async getEventReminders(status?: string): Promise<EventReminderItem[]> {
    const url = status ? `${this.baseUrl}/event-reminders?status=${encodeURIComponent(status)}` : `${this.baseUrl}/event-reminders`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const json = (await res.json()) as ApiResponse<EventReminderItem[]>;
    return json.data || [];
  }

  async createEventReminder(data: CreateEventReminderRequest): Promise<EventReminderItem> {
    const res = await fetch(`${this.baseUrl}/event-reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as ApiResponse<EventReminderItem>;
    if (!json.success || !json.data) throw new Error(json.error?.message || 'Failed to create event reminder');
    return json.data;
  }

  async updateEventReminder(id: string, data: UpdateEventReminderRequest): Promise<EventReminderItem> {
    const res = await fetch(`${this.baseUrl}/event-reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as ApiResponse<EventReminderItem>;
    if (!json.success || !json.data) throw new Error(json.error?.message || 'Failed to update event reminder');
    return json.data;
  }

  async deleteEventReminder(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/event-reminders/${id}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
    return Boolean(json.data?.deleted);
  }
}

export const apiClient = new JarvisApiClient();
