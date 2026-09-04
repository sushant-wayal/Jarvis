import {
  AgentRun,
  ActionResult,
  ApiResponse,
  BrainResponse,
  ChatMessage,
  ConversationSummary,
  CreateEventReminderRequest,
  CreateMemoryRequest,
  CreateTaskRequest,
  CreateUserEventRequest,
  EventReminderItem,
  HealthStatus,
  JarvisPhoneAction,
  KnownPlaceItem,
  LocationContext,
  LocationUpdate,
  MemoryItem,
  NotificationItem,
  PhoneContext,
  TaskItem,
  UpdateEventReminderRequest,
  UpdateTaskRequest,
  UpdateUserEventRequest,
  UserEventItem,
  VoiceResponse,
} from '@jarvis/shared';

import AsyncStorage from '@react-native-async-storage/async-storage';

// Production Jarvis Brain backend on Vercel (overridable via EXPO_PUBLIC_JARVIS_API_URL)
const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_JARVIS_API_URL || 'https://brainofjarvis.vercel.app/api/v1';
const SERVER_URL_STORAGE_KEY = 'jarvis:brain_server_url';

export class JarvisApiClient {
  private baseUrl: string = DEFAULT_API_URL;
  private urlLoaded = false;

  public async initializeUrl(): Promise<string> {
    if (this.urlLoaded) return this.baseUrl;
    try {
      const saved = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY);
      if (saved && saved.trim()) {
        this.baseUrl = saved.trim().endsWith('/') ? saved.trim().slice(0, -1) : saved.trim();
      }
    } catch {
      // Fallback to default
    }
    this.urlLoaded = true;
    return this.baseUrl;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    void AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, this.baseUrl).catch(() => {});
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
    speakResponse = false,
    phoneContext?: PhoneContext
  ): Promise<BrainResponse> {
    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        message,
        conversationId,
        speakResponse,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        phoneContext,
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
    phoneContext?: PhoneContext;
  }): Promise<BrainResponse> {
    return this.sendChatMessage(
      params.message,
      params.conversationId,
      params.speakResponse,
      params.phoneContext
    );
  }

  async sendVoiceAudio(
    audioBase64: string,
    mimeType = 'audio/m4a',
    conversationId?: string,
    phoneContext?: PhoneContext
  ): Promise<VoiceResponse> {
    const res = await fetch(`${this.baseUrl}/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType,
        conversationId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        phoneContext,
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

  async createMemory(data: CreateMemoryRequest): Promise<MemoryItem> {
    const res = await fetch(`${this.baseUrl}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as ApiResponse<MemoryItem>;
    if (!json.success || !json.data) {
      throw new Error(json.error?.message || 'Failed to create memory');
    }
    return json.data;
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

  /** Report result of a phone action back to the brain for conversational recovery. */
  async reportPhoneActionResult(params: {
    conversationId: string;
    action: JarvisPhoneAction;
    result: ActionResult;
  }): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/phone/action-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(params),
      });
    } catch {
      // Non-critical — brain will handle next message without result context
    }
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

  async getKnownPlaces(): Promise<KnownPlaceItem[]> {
    try {
      const res = await fetch(`${this.baseUrl}/location/places`, {
        headers: { Accept: 'application/json' },
      });
      const json = (await res.json()) as ApiResponse<KnownPlaceItem[]>;
      return json.data || [];
    } catch {
      return [];
    }
  }

  async deleteKnownPlace(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/location/places/${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
      return Boolean(json.data?.deleted);
    } catch {
      return false;
    }
  }
}

export const apiClient = new JarvisApiClient();
