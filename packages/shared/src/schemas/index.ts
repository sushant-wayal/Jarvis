import { z } from 'zod';

export const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(4000),
  conversationId: z.string().optional(),
  userId: z.string().optional().default('default-user'),
  timezone: z.string().optional().default('UTC'),
  locale: z.string().optional().default('en-US'),
  speakResponse: z.boolean().optional().default(false),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const VoiceUploadSchema = z.object({
  audioBase64: z.string().min(1, 'Audio data required'),
  mimeType: z.string().optional().default('audio/m4a'),
  conversationId: z.string().optional(),
  userId: z.string().optional().default('default-user'),
  timezone: z.string().optional().default('UTC'),
  locale: z.string().optional().default('en-US'),
});

export type VoiceUploadRequest = z.infer<typeof VoiceUploadSchema>;

export const CreateConversationSchema = z.object({
  title: z.string().optional().default('New Conversation'),
  userId: z.string().optional().default('default-user'),
});

export type CreateConversationRequest = z.infer<typeof CreateConversationSchema>;

export const CreateMemorySchema = z.object({
  userId: z.string().optional().default('default-user'),
  type: z.enum(['FACT', 'PREFERENCE', 'PERSON', 'PROJECT', 'ROUTINE', 'CONTEXT']),
  content: z.string().min(1).max(2000),
  importance: z.number().int().min(1).max(5).default(3),
});

export type CreateMemoryRequest = z.infer<typeof CreateMemorySchema>;

export const UserProfileSchema = z.object({
  name: z.string().min(1).max(100),
  timezone: z.string().default('UTC'),
  preferredStyle: z.enum(['concise', 'detailed', 'technical']).default('concise'),
  autoSpeak: z.boolean().default(true),
  voiceSpeed: z.number().min(0.5).max(2.0).default(1.0),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
