import { z } from 'zod';

export const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(4000),
  conversationId: z.string().optional(),
  userId: z.string().optional().default('default-user'),
  timezone: z.string().optional().default('UTC'),
  locale: z.string().optional().default('en-US'),
  speakResponse: z.boolean().optional().default(false),
  deviceId: z.string().optional(),
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
});

export type VoiceUploadRequest = z.input<typeof VoiceUploadSchema>;

export const CreateConversationSchema = z.object({
  title: z.string().optional().default('New Conversation'),
  userId: z.string().optional().default('default-user'),
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

export const UserProfileSchema = z.object({
  name: z.string().min(1).max(100),
  preferredName: z.string().optional(),
  timezone: z.string().default('UTC'),
  locale: z.string().default('en-US'),
  preferredStyle: z.enum(['concise', 'detailed', 'technical']).default('concise'),
  autoSpeak: z.boolean().default(true),
  voiceSpeed: z.number().min(0.5).max(2.0).default(1.0),
  requireConfirmationForRisky: z.boolean().default(true),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
