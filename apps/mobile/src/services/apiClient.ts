import {
  ApiResponse,
  BrainResponse,
  ChatMessage,
  ConversationSummary,
  HealthStatus,
  MemoryItem,
  VoiceResponse,
} from '@jarvis/shared';

const DEFAULT_API_URL = process.env.EXPO_PUBLIC_JARVIS_API_URL || 'http://localhost:3000/api/v1';

export class JarvisApiClient {
  private baseUrl: string = DEFAULT_API_URL;

  public setBaseUrl(url: string) {
    this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  async checkHealth(): Promise<HealthStatus | null> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(4000) });
      const json = (await res.json()) as ApiResponse<HealthStatus>;
      return json.data;
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
      headers: { 'Content-Type': 'application/json' },
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

  async sendVoiceAudio(
    audioBase64: string,
    mimeType = 'audio/m4a',
    conversationId?: string
  ): Promise<VoiceResponse> {
    const res = await fetch(`${this.baseUrl}/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  async getConversations(): Promise<ConversationSummary[]> {
    const res = await fetch(`${this.baseUrl}/conversations`);
    const json = (await res.json()) as ApiResponse<ConversationSummary[]>;
    return json.data || [];
  }

  async getConversationMessages(id: string): Promise<ChatMessage[]> {
    const res = await fetch(`${this.baseUrl}/conversations/${id}`);
    const json = (await res.json()) as ApiResponse<{ messages: ChatMessage[] }>;
    return json.data?.messages || [];
  }

  async deleteConversation(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/conversations/${id}`, { method: 'DELETE' });
    const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
    return Boolean(json.data?.deleted);
  }

  async getMemories(): Promise<MemoryItem[]> {
    const res = await fetch(`${this.baseUrl}/memory`);
    const json = (await res.json()) as ApiResponse<MemoryItem[]>;
    return json.data || [];
  }

  async deleteMemory(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/memory?id=${id}`, { method: 'DELETE' });
    const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
    return Boolean(json.data?.deleted);
  }
}

export const apiClient = new JarvisApiClient();
