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
  IntermediateStatusUpdate,
} from '@jarvis/shared';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { startSseStream } from './streamingClient';

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

  /**
   * Diagnoses exact step and root cause when Brain backend returns an error or non-JSON response
   */
  private async parseResponseError(res: Response, endpoint: string, stepName: string): Promise<Error> {
    const status = res.status;
    let rawText = '';
    try {
      rawText = await res.text();
    } catch {
      rawText = '';
    }

    // 1. Try parsing structured ApiResponse JSON
    try {
      const json = JSON.parse(rawText) as ApiResponse<unknown>;
      if (json && json.error) {
        const code = json.error.code || `HTTP_${status}`;
        const msg = json.error.message || 'Unknown backend error';
        return new Error(`[Step: ${stepName} · ${code}]\n${msg}`);
      }
    } catch {
      // Not valid JSON
    }

    // 2. Identify Vercel Gateway Timeout (504)
    if (status === 504 || rawText.includes('FUNCTION_INVOCATION_TIMEOUT')) {
      return new Error(
        `[Step: ${stepName} · 504 Gateway Timeout]\n` +
        `The cloud brain at brainofjarvis.vercel.app timed out while processing your request.\n` +
        `Cause: AI reasoning or voice synthesis exceeded Vercel's execution time limit (15s).`
      );
    }

    // 3. Identify Gateway/Server Unavailable (502/503)
    if (status === 502 || status === 503) {
      return new Error(
        `[Step: ${stepName} · ${status} Service Unavailable]\n` +
        `The cloud brain server is temporarily unreachable or undergoing deployment.`
      );
    }

    // 4. Identify Not Found (404)
    if (status === 404) {
      return new Error(
        `[Step: ${stepName} · 404 Not Found]\n` +
        `Route '${endpoint}' was not found at ${this.baseUrl}. Check server URL in Settings.`
      );
    }

    // 5. Clean text snippet fallback
    const cleanSnippet = rawText.replace(/<[^>]*>/g, '').trim().slice(0, 180);
    return new Error(
      `[Step: ${stepName} · HTTP ${status}]\n` +
      (cleanSnippet || res.statusText || 'Server returned an unhandled error response.')
    );
  }

  async sendChatMessage(
    message: string,
    conversationId?: string,
    speakResponse = false,
    phoneContext?: PhoneContext
  ): Promise<BrainResponse> {
    const url = `${this.baseUrl}/chat`;
    let res: Response;
    try {
      res = await fetch(url, {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[Step: Network Link · Connection Failed]\nUnable to reach Brain at ${this.baseUrl}.\nDetails: ${msg}`);
    }

    if (!res.ok) {
      throw await this.parseResponseError(res, '/chat', 'Cognitive Reasoning');
    }

    let json: ApiResponse<BrainResponse>;
    try {
      json = (await res.json()) as ApiResponse<BrainResponse>;
    } catch {
      throw new Error(`[Step: Response Parsing · Invalid JSON]\nServer at ${url} returned an invalid or non-JSON response.`);
    }

    if (!json.success || !json.data) {
      throw new Error(`[Step: Brain Engine · ${json.error?.code || 'ERROR'}]\n${json.error?.message || 'Failed to get Jarvis response'}`);
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
    const url = `${this.baseUrl}/voice`;
    let res: Response;
    try {
      res = await fetch(url, {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[Step: Network Link · Voice Uplink Failed]\nUnable to transmit audio to Brain at ${this.baseUrl}.\nDetails: ${msg}`);
    }

    if (!res.ok) {
      throw await this.parseResponseError(res, '/voice', 'Voice Pipeline & STT');
    }

    let json: ApiResponse<VoiceResponse>;
    try {
      json = (await res.json()) as ApiResponse<VoiceResponse>;
    } catch {
      throw new Error(`[Step: Response Parsing · Invalid Voice Response]\nServer at ${url} returned an invalid or non-JSON response.`);
    }

    if (!json.success || !json.data) {
      throw new Error(`[Step: Voice Synthesis & Logic · ${json.error?.code || 'ERROR'}]\n${json.error?.message || 'Unable to process voice audio'}`);
    }

    return json.data;
  }

  /**
   * Transmits voice audio and receives real-time SSE stream events:
   * - onTranscript: Fired as soon as STT completes (low latency UI update)
   * - onIntermediateStatus: Fired whenever Jarvis speaks an intermediate progress update
   * - returns Promise<VoiceResponse> with the final response payload
   */
  async sendVoiceAudioStream(params: {
    audioBase64: string;
    mimeType?: string;
    conversationId?: string;
    phoneContext?: PhoneContext;
    speakIntermediateStatus?: boolean;
    onTranscript?: (transcript: string) => void;
    onIntermediateStatus?: (status: IntermediateStatusUpdate) => void;
  }): Promise<VoiceResponse> {
    const streamUrl = `${this.baseUrl}/voice/stream`;
    const payload = {
      audioBase64: params.audioBase64,
      mimeType: params.mimeType || 'audio/m4a',
      conversationId: params.conversationId,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      phoneContext: params.phoneContext,
      speakIntermediateStatus: params.speakIntermediateStatus ?? true,
    };

    return new Promise<VoiceResponse>((resolve, reject) => {
      let finalResponse: VoiceResponse | null = null;
      let completed = false;

      startSseStream({
        url: streamUrl,
        body: payload,
        handlers: {
          onTranscript: (t) => {
            params.onTranscript?.(t);
          },
          onStatus: (st) => {
            params.onIntermediateStatus?.(st);
          },
          onFinalResponse: (resp) => {
            finalResponse = resp;
          },
          onDone: () => {
            if (completed) return;
            completed = true;
            if (finalResponse) {
              resolve(finalResponse);
            } else {
              this.sendVoiceAudio(
                params.audioBase64,
                params.mimeType,
                params.conversationId,
                params.phoneContext
              )
                .then(resolve)
                .catch(reject);
            }
          },
          onError: () => {
            if (completed) return;
            completed = true;
            // Fallback gracefully to non-streaming REST endpoint
            this.sendVoiceAudio(
              params.audioBase64,
              params.mimeType,
              params.conversationId,
              params.phoneContext
            )
              .then(resolve)
              .catch(reject);
          },
        },
      });
    });
  }

  /**
   * Transmits a chat message and streams real-time intermediate status and token events.
   */
  async sendChatMessageStream(params: {
    message: string;
    conversationId?: string;
    speakResponse?: boolean;
    speakIntermediateStatus?: boolean;
    phoneContext?: PhoneContext;
    onIntermediateStatus?: (status: IntermediateStatusUpdate) => void;
    onTextDelta?: (text: string) => void;
  }): Promise<BrainResponse> {
    const streamUrl = `${this.baseUrl}/chat/stream`;
    const payload = {
      message: params.message,
      conversationId: params.conversationId,
      speakResponse: params.speakResponse ?? false,
      speakIntermediateStatus: params.speakIntermediateStatus ?? true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      phoneContext: params.phoneContext,
    };

    return new Promise<BrainResponse>((resolve, reject) => {
      let finalResponse: BrainResponse | null = null;
      let completed = false;

      startSseStream({
        url: streamUrl,
        body: payload,
        handlers: {
          onStatus: (st) => {
            params.onIntermediateStatus?.(st);
          },
          onTextDelta: (delta) => {
            params.onTextDelta?.(delta);
          },
          onFinalResponse: (resp) => {
            finalResponse = resp as unknown as BrainResponse;
          },
          onDone: () => {
            if (completed) return;
            completed = true;
            if (finalResponse) {
              resolve(finalResponse);
            } else {
              this.sendChatMessage(
                params.message,
                params.conversationId,
                params.speakResponse,
                params.phoneContext
              )
                .then(resolve)
                .catch(reject);
            }
          },
          onError: () => {
            if (completed) return;
            completed = true;
            this.sendChatMessage(
              params.message,
              params.conversationId,
              params.speakResponse,
              params.phoneContext
            )
              .then(resolve)
              .catch(reject);
          },
        },
      });
    });
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

  async getUserProfile(userId?: string): Promise<{ id: string; name: string; preferences: Record<string, unknown> } | null> {
    try {
      const url = userId ? `${this.baseUrl}/user?userId=${encodeURIComponent(userId)}` : `${this.baseUrl}/user`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const json = (await res.json()) as ApiResponse<{ id: string; name: string; preferences: Record<string, unknown> }>;
      return json.data || null;
    } catch {
      return null;
    }
  }

  async updateUserProfile(data: { userId?: string; name?: string; preferences?: Record<string, unknown> }): Promise<{ id: string; name: string; preferences: Record<string, unknown> } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/user`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as ApiResponse<{ id: string; name: string; preferences: Record<string, unknown> }>;
      return json.data || null;
    } catch {
      return null;
    }
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

  // ── Music Session & Autoplay Endpoints ────────────────────────────────────

  async replenishMusicQueue(
    sessionId: string,
    count = 5
  ): Promise<import('@jarvis/shared').QueuedTrack[]> {
    try {
      await this.initializeUrl();
      const res = await fetch(`${this.baseUrl}/music/session/replenish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sessionId, count }),
      });
      const json = (await res.json()) as ApiResponse<{ queue: import('@jarvis/shared').QueuedTrack[] }>;
      return json.data?.queue || [];
    } catch {
      return [];
    }
  }

  async sendMusicPlaybackEvents(
    events: import('@jarvis/shared').PlaybackEvent[]
  ): Promise<boolean> {
    try {
      await this.initializeUrl();
      const res = await fetch(`${this.baseUrl}/music/session/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ events }),
      });
      const json = (await res.json()) as ApiResponse<{ processedCount: number }>;
      return Boolean(json.success);
    } catch {
      return false;
    }
  }

  async getIntegrations(): Promise<IntegrationItem[]> {
    try {
      await this.initializeUrl();
      const res = await fetch(`${this.baseUrl}/integrations`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return [];
      const json = (await res.json()) as ApiResponse<IntegrationItem[]>;
      return json.data || [];
    } catch {
      return [];
    }
  }

  async toggleIntegration(
    id: string,
    enabled: boolean,
    clearCredentials?: boolean
  ): Promise<ToggleIntegrationResult | null> {
    try {
      await this.initializeUrl();
      const res = await fetch(`${this.baseUrl}/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id, enabled, clearCredentials }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as ApiResponse<ToggleIntegrationResult>;
      return json.data || null;
    } catch {
      return null;
    }
  }

  async getGoogleAuthUrl(redirectScheme: string = 'jarvis://integrations'): Promise<{ authUrl: string } | null> {
    try {
      await this.initializeUrl();
      const res = await fetch(
        `${this.baseUrl}/integrations/google/auth-url?redirect=${encodeURIComponent(redirectScheme)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return null;
      const json = (await res.json()) as ApiResponse<{ authUrl: string }>;
      return json.data || null;
    } catch {
      return null;
    }
  }

  async disconnectIntegration(id: string): Promise<boolean> {
    try {
      await this.initializeUrl();
      const res = await fetch(`${this.baseUrl}/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id, action: 'disconnect' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async updateIntegrationPermissions(
    id: string,
    params: {
      policies?: Record<string, 'ALLOW' | 'ASK' | 'DENY'>;
      toolPolicies?: Record<string, 'ALLOW' | 'ASK' | 'DENY'>;
    } | Record<string, 'ALLOW' | 'ASK' | 'DENY'>
  ): Promise<boolean> {
    try {
      await this.initializeUrl();
      const bodyPayload =
        'policies' in params || 'toolPolicies' in params
          ? { id, action: 'updatePermissions', ...params }
          : { id, action: 'updatePermissions', policies: params };

      const res = await fetch(`${this.baseUrl}/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export type PermissionPolicy = 'ALLOW' | 'ASK' | 'DENY';

export interface IntegrationToolItem {
  id: string;
  name: string;
  description: string;
  actionType: 'READ' | 'WRITE' | 'EXTERNAL_ACTION' | 'DESTRUCTIVE';
  riskLevel: string;
  policy: PermissionPolicy;
}

export interface IntegrationItem {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  status: 'ENABLED' | 'CONFIG_REQUIRED' | 'DISABLED' | 'ERROR';
  authType: 'OAUTH' | 'TOKEN' | 'API_KEY' | 'NONE' | 'CUSTOM';
  isConfigured: boolean;
  connectedAccount: string | null;
  toolCount: number;
  permissions: string[];
  supportedActionTypes?: ('READ' | 'WRITE' | 'EXTERNAL_ACTION' | 'DESTRUCTIVE')[];
  policies?: Record<string, PermissionPolicy>;
  toolPolicies?: Record<string, PermissionPolicy>;
  tools?: IntegrationToolItem[];
  autoApprove?: {
    READ?: boolean;
    WRITE?: boolean;
    EXTERNAL_ACTION?: boolean;
    DESTRUCTIVE?: boolean;
  };
}

export interface ToggleIntegrationResult {
  id: string;
  enabled: boolean;
  status: 'ENABLED' | 'CONFIG_REQUIRED' | 'DISABLED' | 'ERROR';
  requiresAuth?: boolean;
  message?: string;
}

export const apiClient = new JarvisApiClient();

