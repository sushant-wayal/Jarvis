import { BrainResponse, ToolContext } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { agentPlanner } from './agent-planner';
import { contextEngine } from './context-engine';
import { intentEngine } from './intent-engine';
import { memoryExtractor } from './memory-extractor';

export interface ProcessMessageInput {
  message: string;
  conversationId?: string;
  userId?: string;
  timezone?: string;
  locale?: string;
  inputType?: 'TEXT' | 'VOICE';
  speakResponse?: boolean;
  requestId: string;
  deviceId?: string;
}

export class BrainOrchestrator {
  async processMessage(input: ProcessMessageInput): Promise<BrainResponse> {
    const userId = input.userId || 'default-user';
    const timezone = input.timezone || 'UTC';
    const locale = input.locale || 'en-US';
    const requestId = input.requestId;

    // 1. Ensure user exists
    await this.ensureUserExists(userId);

    // 2. Resolve Conversation
    const conversationId = await this.getOrCreateConversation(userId, input.conversationId, input.message);

    // 3. Fast Intent Classification & Assembled Context
    const [classifiedIntent, assembledContext] = await Promise.all([
      intentEngine.classify(input.message),
      contextEngine.assembleContext({
        userId,
        conversationId,
        currentMessage: input.message,
        timezone,
        locale,
        deviceId: input.deviceId,
      }),
    ]);

    logger.info('Message Intent Classified', {
      requestId,
      intent: classifiedIntent.intent,
      confidence: classifiedIntent.confidence,
    });

    // 4. Tool Execution Context
    const toolContext: ToolContext = {
      userId,
      conversationId,
      requestId,
      timezone,
      locale,
    };

    // 5. Execute Agent Planner ReAct Loop
    const brainResponse = await agentPlanner.planAndExecute({
      message: input.message,
      context: assembledContext,
      toolContext,
    });

    brainResponse.shouldSpeak = Boolean(input.speakResponse);

    // 6. Non-blocking Database storage & async memory extraction
    Promise.all([
      prisma.message.create({
        data: {
          conversationId,
          role: 'USER',
          content: input.message,
          inputType: input.inputType || 'TEXT',
        },
      }),
      prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: brainResponse.text,
          inputType: input.inputType || 'TEXT',
          metadata: JSON.stringify({
            executedToolCalls: brainResponse.toolCalls,
            executedToolResults: brainResponse.toolResults,
            agentRunId: brainResponse.agentRunId,
            mode: brainResponse.mode,
          }),
        },
      }),
    ]).catch((e: unknown) => logger.warn('Background message save warning', { error: String(e) }));

    // 7. Extract long-term memories in background without blocking response
    memoryExtractor
      .extractAndStoreMemories(userId, input.message, brainResponse.text)
      .catch((e: unknown) => logger.warn('Memory extraction step completed', { error: String(e) }));

    return brainResponse;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          name: 'Sushant',
        },
      });
    }
  }

  private async getOrCreateConversation(userId: string, conversationId?: string, initialMessage?: string): Promise<string> {
    if (conversationId) {
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (conv) return conv.id;
    }

    const title = initialMessage ? initialMessage.slice(0, 30) + (initialMessage.length > 30 ? '...' : '') : 'New Conversation';
    const newConv = await prisma.conversation.create({
      data: {
        userId,
        title,
      },
    });

    return newConv.id;
  }
}

export const brainOrchestrator = new BrainOrchestrator();
