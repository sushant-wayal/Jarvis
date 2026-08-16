export type JarvisState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'THINKING'
  | 'SPEAKING'
  | 'ERROR'
  | 'OFFLINE';

export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export type InputType = 'TEXT' | 'VOICE';

export type MemoryType =
  | 'FACT'
  | 'PREFERENCE'
  | 'PERSON'
  | 'PROJECT'
  | 'ROUTINE'
  | 'CONTEXT';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  requestId: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  inputType: InputType;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationSummary {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastMessage?: string;
}

export interface MemoryItem {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  importance: number;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface BrainResponse {
  text: string;
  shouldSpeak: boolean;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  conversationId: string;
  requestId: string;
  audioBase64?: string;
  audioUrl?: string;
}

export interface VoiceResponse {
  transcript: string;
  response: string;
  audioBase64?: string;
  audioUrl?: string;
  conversationId: string;
  requestId: string;
  shouldSpeak: boolean;
}

export interface HealthStatus {
  status: 'operational' | 'degraded' | 'down';
  timestamp: string;
  services: {
    database: boolean;
    aiProvider: boolean;
    sttProvider: boolean;
    ttsProvider: boolean;
  };
  version: string;
}

export interface ToolContext {
  userId: string;
  conversationId: string;
  requestId: string;
  timezone: string;
  locale: string;
}
