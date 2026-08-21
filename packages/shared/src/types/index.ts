export type JarvisState =
  | 'IDLE'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'PROCESSING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'INTERRUPTED'
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
  | 'GOAL'
  | 'CONSTRAINT'
  | 'HABIT'
  | 'CONTEXT';

export type IntentType =
  | 'CONVERSATION'
  | 'QUESTION'
  | 'INFORMATION_LOOKUP'
  | 'CALCULATION'
  | 'ACTION'
  | 'TASK_CREATION'
  | 'TASK_QUERY'
  | 'MEMORY_UPDATE'
  | 'MEMORY_QUERY'
  | 'SEARCH'
  | 'NAVIGATION'
  | 'PLANNING'
  | 'REMINDER'
  | 'EVENT_CREATION'
  | 'LOCATION_QUERY'
  | 'PROACTIVE_REQUEST'
  | 'UNKNOWN';

export type ToolCategory =
  | 'INFORMATION'
  | 'COMMUNICATION'
  | 'PRODUCTIVITY'
  | 'PERSONAL'
  | 'SYSTEM'
  | 'SEARCH'
  | 'FINANCE'
  | 'CALCULATION'
  | 'LOCATION';

export type ToolRiskLevel = 'SAFE' | 'LOW_RISK' | 'HIGH_RISK' | 'CRITICAL';

export type ResponseMode =
  | 'ANSWER'
  | 'ACTION'
  | 'CLARIFICATION'
  | 'CONFIRMATION'
  | 'PROGRESS'
  | 'ERROR';

export type AgentRunStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'EXECUTING'
  | 'WAITING_FOR_USER'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type AgentStepType =
  | 'THINK'
  | 'TOOL_CALL'
  | 'OBSERVATION'
  | 'RESPONSE'
  | 'WAIT'
  | 'CONFIRMATION';

export type AgentStepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export type TaskType = 'REMINDER' | 'SCHEDULED_TASK' | 'RECURRING_TASK' | 'CONDITIONAL_TASK';

export type TaskStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'DISMISSED';

export type EventTriggerType =
  | 'LOCATION_ENTER'
  | 'LOCATION_NEAR'
  | 'LOCATION_EXIT'
  | 'EVENT_ACTIVE'
  | 'EVENT_APPROACHING'
  | 'CONTEXT_MATCH';

export type UserEventType =
  | 'TRIP'
  | 'MEETING'
  | 'APPOINTMENT'
  | 'PLAN'
  | 'ACTIVITY'
  | 'DEADLINE'
  | 'PERSONAL_EVENT';

export type UserEventStatus =
  | 'PLANNED'
  | 'UPCOMING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED';

export type EventReminderStatus =
  | 'PENDING'
  | 'TRIGGERED'
  | 'ACKNOWLEDGED'
  | 'COMPLETED'
  | 'DISMISSED'
  | 'CANCELLED';

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
  expiresAt?: string;
  messageCount?: number;
  lastMessage?: string;
}

export interface MemoryItem {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  importance: number;
  confidence?: number;
  source?: string;
  lastReferencedAt?: string;
  expiresAt?: string;
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

export interface AgentStep {
  id: string;
  agentRunId: string;
  stepNumber: number;
  type: AgentStepType;
  status: AgentStepStatus;
  input?: unknown;
  output?: unknown;
  summary?: string;
  startedAt: string;
  completedAt?: string;
}

export interface AgentRun {
  id: string;
  userId: string;
  conversationId: string;
  status: AgentRunStatus;
  goal: string;
  steps: AgentStep[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface TaskItem {
  id: string;
  userId: string;
  type: TaskType;
  title: string;
  description?: string;
  status: TaskStatus;
  schedule?: string;
  condition?: string;
  timezone: string;
  nextRunAt?: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskExecutionItem {
  id: string;
  taskId: string;
  status: 'SUCCESS' | 'FAILED';
  result?: string;
  executedAt: string;
  durationMs: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  taskId?: string;
  title: string;
  body: string;
  deepLink?: string;
  status: NotificationStatus;
  createdAt: string;
}

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp?: string;
}

export interface LocationContext {
  latitude: number;
  longitude: number;
  accuracy?: number;
  country?: string;
  state?: string;
  city?: string;
  area?: string;
  knownPlace?: {
    id: string;
    name: string;
  };
  timestamp: string;
}

export interface KnownPlaceItem {
  id: string;
  userId: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserEventItem {
  id: string;
  userId: string;
  type: UserEventType;
  title: string;
  description?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  startAt?: string;
  endAt?: string;
  status: UserEventStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EventReminderItem {
  id: string;
  userId: string;
  eventId?: string;
  title: string;
  description?: string;
  triggerType: EventTriggerType;
  targetLocation?: string;
  targetLatitude?: number;
  targetLongitude?: number;
  radiusMeters?: number;
  isRecurring: boolean;
  status: EventReminderStatus;
  lastTriggeredAt?: string;
  cooldownMinutes: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
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
  mode?: ResponseMode;
  agentRunId?: string;
  pendingConfirmation?: {
    actionId: string;
    toolName: string;
    riskLevel: ToolRiskLevel;
    summary: string;
    payload: Record<string, unknown>;
  };
}

export interface VoiceResponse {
  transcript: string;
  response: string;
  audioBase64?: string;
  audioUrl?: string;
  conversationId: string;
  requestId: string;
  shouldSpeak: boolean;
  agentRunId?: string;
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
  location?: LocationContext;
  agentRunId?: string;
  stepNumber?: number;
}
