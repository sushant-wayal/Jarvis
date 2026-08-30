import { z } from 'zod';

export const PhoneNotificationEventSchema = z.object({
  id: z.string(),
  app: z.string(),
  packageName: z.string(),
  sender: z.string(),
  content: z.string().optional(),
  timestamp: z.string(),
  conversationKey: z.string().optional(),
  canReply: z.boolean(),
  replyActionKey: z.string().optional(),
  threadId: z.string().optional(),
});

export const IntegrationCapabilitiesSchema = z.object({
  contacts: z.boolean(),
  phoneCall: z.boolean(),
  sms: z.boolean(),
  notificationListener: z.boolean(),
  notificationReply: z.boolean(),
  openApp: z.boolean(),
});

export const PhoneContextSchema = z.object({
  recentNotifications: z.array(PhoneNotificationEventSchema).max(20),
  capabilities: IntegrationCapabilitiesSchema,
  timestamp: z.string(),
}).optional();

export const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(4000),
  conversationId: z.string().optional(),
  userId: z.string().optional().default('default-user'),
  timezone: z.string().optional().default('UTC'),
  locale: z.string().optional().default('en-US'),
  speakResponse: z.boolean().optional().default(false),
  deviceId: z.string().optional(),
  /** Phone context snapshot from the mobile device */
  phoneContext: PhoneContextSchema,
});

export type ChatRequest = z.input<typeof ChatRequestSchema>;

export const VoiceUploadSchema = z.object({
  audioBase64: z.string().min(1, 'Audio data required'),
  mimeType: z.string().optional().default('audio/m4a'),
  conversationId: z.string().optional(),
  userId: z.string().optional().default('default-user'),
  timezone: z.string().optional().default('UTC'),
  locale: z.string().optional().default('en-US'),
  deviceId: z.string().optional(),
  /** Phone context snapshot from the mobile device */
  phoneContext: PhoneContextSchema,
});

export type VoiceUploadRequest = z.input<typeof VoiceUploadSchema>;

export const CreateConversationSchema = z.object({
  title: z.string().optional().default('New Conversation'),
  userId: z.string().optional().default('default-user'),
  expiresAt: z.string().datetime().optional(),
  ttlDays: z.number().int().min(1).max(365).optional(),
});

export type CreateConversationRequest = z.input<typeof CreateConversationSchema>;

export const MemoryTypeEnum = z.enum([
  'FACT',
  'PREFERENCE',
  'PERSON',
  'PROJECT',
  'ROUTINE',
  'GOAL',
  'CONSTRAINT',
  'HABIT',
  'CONTEXT',
]);

export const CreateMemorySchema = z.object({
  userId: z.string().optional().default('default-user'),
  type: MemoryTypeEnum,
  content: z.string().min(1).max(2000),
  importance: z.number().int().min(1).max(5).default(3),
  confidence: z.number().min(0).max(1).optional().default(0.9),
  source: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  ttlDays: z.number().int().min(1).max(365).optional(),
});

export type CreateMemoryRequest = z.input<typeof CreateMemorySchema>;

export const TaskTypeEnum = z.enum([
  'REMINDER',
  'SCHEDULED_TASK',
  'RECURRING_TASK',
  'CONDITIONAL_TASK',
]);

export const TaskStatusEnum = z.enum([
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export const CreateTaskSchema = z.object({
  userId: z.string().optional().default('default-user'),
  type: TaskTypeEnum,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  schedule: z.string().optional(),
  condition: z.string().optional(),
  timezone: z.string().optional().default('UTC'),
  nextRunAt: z.string().datetime().optional(),
});

export type CreateTaskRequest = z.input<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: TaskStatusEnum.optional(),
  schedule: z.string().optional(),
  condition: z.string().optional(),
  nextRunAt: z.string().datetime().nullable().optional(),
});

export type UpdateTaskRequest = z.input<typeof UpdateTaskSchema>;

export const ConfirmActionSchema = z.object({
  actionId: z.string(),
  confirmed: z.boolean(),
  userId: z.string().optional().default('default-user'),
});

export type ConfirmActionRequest = z.input<typeof ConfirmActionSchema>;

export const LocationUpdateSchema = z.object({
  userId: z.string().optional().default('default-user'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
  altitude: z.number().optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  timestamp: z.string().optional(),
});

export type LocationUpdateRequest = z.input<typeof LocationUpdateSchema>;

export const CreateKnownPlaceSchema = z.object({
  userId: z.string().optional().default('default-user'),
  name: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(10).max(50000).optional().default(200),
});

export type CreateKnownPlaceRequest = z.input<typeof CreateKnownPlaceSchema>;

export const UserEventTypeEnum = z.enum([
  'TRIP',
  'MEETING',
  'APPOINTMENT',
  'PLAN',
  'ACTIVITY',
  'DEADLINE',
  'PERSONAL_EVENT',
]);

export const UserEventStatusEnum = z.enum([
  'PLANNED',
  'UPCOMING',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
]);

export const CreateUserEventSchema = z.object({
  userId: z.string().optional().default('default-user'),
  type: UserEventTypeEnum.optional().default('TRIP'),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  locationName: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  status: UserEventStatusEnum.optional().default('PLANNED'),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateUserEventRequest = z.input<typeof CreateUserEventSchema>;

export const UpdateUserEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  locationName: z.string().max(200).optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  status: UserEventStatusEnum.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateUserEventRequest = z.input<typeof UpdateUserEventSchema>;

export const EventTriggerTypeEnum = z.enum([
  'LOCATION_ENTER',
  'LOCATION_NEAR',
  'LOCATION_EXIT',
  'EVENT_ACTIVE',
  'EVENT_APPROACHING',
  'CONTEXT_MATCH',
]);

export const EventReminderStatusEnum = z.enum([
  'PENDING',
  'TRIGGERED',
  'ACKNOWLEDGED',
  'COMPLETED',
  'DISMISSED',
  'CANCELLED',
]);

export const CreateEventReminderSchema = z.object({
  userId: z.string().optional().default('default-user'),
  eventId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  triggerType: EventTriggerTypeEnum.optional().default('LOCATION_ENTER'),
  targetLocation: z.string().max(200).optional(),
  targetLatitude: z.number().min(-90).max(90).optional(),
  targetLongitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().min(10).max(100000).optional().default(5000),
  isRecurring: z.boolean().optional().default(false),
  cooldownMinutes: z.number().int().min(5).max(10080).optional().default(120),
  expiresAt: z.string().datetime().optional(),
});

export type CreateEventReminderRequest = z.input<typeof CreateEventReminderSchema>;

export const UpdateEventReminderSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: EventReminderStatusEnum.optional(),
  isRecurring: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export type UpdateEventReminderRequest = z.input<typeof UpdateEventReminderSchema>;

export const UserProfileSchema = z.object({
  name: z.string().min(1).max(100),
  preferredName: z.string().optional(),
  timezone: z.string().default('UTC'),
  locale: z.string().default('en-US'),
  preferredStyle: z.enum(['concise', 'detailed', 'technical']).default('concise'),
  autoSpeak: z.boolean().default(true),
  voiceSpeed: z.number().min(0.5).max(2.0).default(1.0),
  requireConfirmationForRisky: z.boolean().default(true),
  locationAwarenessEnabled: z.boolean().default(true),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
