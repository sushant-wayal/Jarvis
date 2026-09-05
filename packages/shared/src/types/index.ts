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

// ─── Phone Integration Types ────────────────────────────────────────────────

/** Normalized notification event captured from a messaging app */
export interface PhoneNotificationEvent {
  /** Unique ID (notification ID from OS or generated) */
  id: string;
  /** Friendly app name: 'whatsapp', 'instagram', 'telegram', 'sms', 'gmail', etc. */
  app: string;
  /** Android package name: 'com.whatsapp', etc. */
  packageName: string;
  /** Sender display name */
  sender: string;
  /** Message text — only populated when user permits content storage */
  content?: string;
  /** ISO timestamp */
  timestamp: string;
  /** Key identifying the conversation thread within the app */
  conversationKey?: string;
  /** Whether a direct reply action is available */
  canReply: boolean;
  /** Internal key for the RemoteInput reply action (native use only) */
  replyActionKey?: string;
  /** Thread / group ID if applicable */
  threadId?: string;
}

/** A contact resolved from the device address book */
export interface ResolvedContact {
  id: string;
  name: string;
  displayName: string;
  phoneNumbers: Array<{ number: string; label: string }>;
  emails?: Array<{ email: string; label: string }>;
}

/** Result of a contact lookup — may be a single match or ambiguous */
export interface ContactResolutionResult {
  /** Definite single match */
  contact?: ResolvedContact;
  /** Multiple candidates when the query is ambiguous */
  candidates?: ResolvedContact[];
  /** True when more than one contact matched */
  ambiguous: boolean;
  /** Human-readable error, if any */
  error?: string;
}

/** What the integration layer can do on this device right now */
export interface IntegrationCapabilities {
  contacts: boolean;
  phoneCall: boolean;
  sms: boolean;
  /** Requires APK build — not available in Expo Go */
  notificationListener: boolean;
  /** Requires APK build — not available in Expo Go */
  notificationReply: boolean;
  openApp: boolean;
}

export interface PhoneContactSummary {
  name: string;
  number: string;
  label?: string;
}

/** Lightweight snapshot of phone context sent from mobile to brain with every request */
export interface PhoneContext {
  /** Recent notifications captured since last sync (max 20) */
  recentNotifications: PhoneNotificationEvent[];
  capabilities: IntegrationCapabilities;
  timestamp: string;
  /** Lightweight list of phone contacts for contact resolution */
  contacts?: PhoneContactSummary[];
  /** Custom contact aliases configured by user (e.g. mom -> "Mom") */
  aliases?: Record<string, string>;
}

// ─── Jarvis Phone Action Descriptors ───────────────────────────────────────
// The brain generates these; the mobile app executes them natively.

export interface JarvisCallAction {
  type: 'CALL_CONTACT';
  contactName: string;
  /** Pre-resolved number if available from phone context */
  phoneNumber?: string;
}

export interface JarvisSendSmsAction {
  type: 'SEND_SMS';
  contactName: string;
  phoneNumber?: string;
  message: string;
}

export interface JarvisReplyToNotificationAction {
  type: 'REPLY_TO_NOTIFICATION';
  app: string;
  sender: string;
  conversationKey?: string;
  message: string;
  /** Original notification id for RemoteInput targeting */
  notificationId?: string;
}

export interface JarvisOpenAppAction {
  type: 'OPEN_APP';
  /** Friendly app name: 'whatsapp', 'instagram', etc. */
  app: string;
}

export interface JarvisOpenConversationAction {
  type: 'OPEN_CONVERSATION';
  app: string;
  conversationKey?: string;
  contactName?: string;
}

export type JarvisPhoneAction =
  | JarvisCallAction
  | JarvisSendSmsAction
  | JarvisReplyToNotificationAction
  | JarvisOpenAppAction
  | JarvisOpenConversationAction;

/** Result of executing a JarvisPhoneAction on the mobile side */
export interface ActionResult {
  success: boolean;
  /** True if a fallback strategy was used instead of the primary action */
  fallbackUsed?: boolean;
  /** Human-readable reason for fallback */
  fallbackReason?: string;
  /** Short message Jarvis can speak to confirm the result */
  message?: string;
  /** Error description if success is false */
  error?: string;
  /** True when capability requires APK build (not available in Expo Go) */
  requiresApkBuild?: boolean;
  /** When contact lookup is ambiguous, caller names for clarification */
  ambiguousCandidates?: string[];
}

// ────────────────────────────────────────────────────────────────────────────

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
  /** Phone action for the mobile app to execute after speaking the response */
  pendingPhoneAction?: JarvisPhoneAction;
  /** Scheduled time-based reminder for the phone's native AlarmManager */
  scheduledReminder?: ScheduledReminder;
}

export interface ScheduledReminder {
  taskId: string;
  title: string;
  scheduledFor: string;
  description?: string;
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
  pendingPhoneAction?: JarvisPhoneAction;
  scheduledReminder?: ScheduledReminder;
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
  userName?: string;
  conversationId: string;
  requestId: string;
  timezone: string;
  locale: string;
  location?: LocationContext;
  agentRunId?: string;
  stepNumber?: number;
  /** Phone context from the mobile device — injected per request */
  phoneContext?: PhoneContext;
}

export type EarbudEventType =
  | 'SINGLE_TAP'
  | 'DOUBLE_TAP'
  | 'TRIPLE_TAP'
  | 'LONG_PRESS'
  | 'MEDIA_PLAY'
  | 'MEDIA_PAUSE'
  | 'MEDIA_NEXT'
  | 'MEDIA_PREV';

export type EarbudAction =
  | 'TOGGLE_VOICE'
  | 'ACTIVATE_LISTENING'
  | 'STOP_OR_INTERRUPT'
  | 'READ_NOTIFICATIONS'
  | 'NONE';

export interface EarbudSettings {
  enabled: boolean;
  singleTapAction: EarbudAction;
  doubleTapAction: EarbudAction;
  playFeedbackChimes: boolean;
  autoSilenceStop: boolean;
  silenceThresholdSeconds: number;
  backgroundStandby: boolean;
}

export interface EarbudStatus {
  isStandbyActive: boolean;
  isConnected: boolean;
  lastEvent?: EarbudEventType;
  lastEventTimestamp?: number;
}

