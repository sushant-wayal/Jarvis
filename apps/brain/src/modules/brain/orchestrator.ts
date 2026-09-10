import { BrainResponse, ToolContext } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { agentPlanner } from './agent-planner';
import { contextEngine } from './context-engine';
import { intentEngine } from './intent-engine';
import { memoryExtractor } from './memory-extractor';
import { ttlEngine } from './ttl-engine';

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
  /** Phone context snapshot from the mobile device */
  phoneContext?: import('@jarvis/shared').PhoneContext;
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
        phoneContext: input.phoneContext,
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
      userName: assembledContext.userProfile.name || 'Sushant',
      conversationId,
      requestId,
      timezone,
      locale,
      phoneContext: input.phoneContext,
    };

    // 5. Execute Agent Planner ReAct Loop
    const brainResponse = await agentPlanner.planAndExecute({
      message: input.message,
      context: assembledContext,
      toolContext,
    });

    brainResponse.shouldSpeak = Boolean(input.speakResponse);

    // 6. Non-blocking Database storage, sliding TTL renewal & async memory extraction
    const userCreatedAt = new Date();
    const assistantCreatedAt = new Date(userCreatedAt.getTime() + 100);

    Promise.all([
      prisma.message.create({
        data: {
          conversationId,
          role: 'USER',
          content: input.message,
          inputType: input.inputType || 'TEXT',
          createdAt: userCreatedAt,
        },
      }),
      prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: brainResponse.text,
          inputType: input.inputType || 'TEXT',
          createdAt: assistantCreatedAt,
          metadata: JSON.stringify({
            executedToolCalls: brainResponse.toolCalls,
            executedToolResults: brainResponse.toolResults,
            agentRunId: brainResponse.agentRunId,
            mode: brainResponse.mode,
          }),
        },
      }),
      this.renewConversationTtl(conversationId, input.message, brainResponse.text),
    ]).catch((e: unknown) => logger.warn('Background message save/TTL renewal warning', { error: String(e) }));

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
    const initialTtlDays = await ttlEngine.suggestConversationTtl(initialMessage || title);
    const expiresAt = ttlEngine.calculateExpiryDate(initialTtlDays);

    const newConv = await prisma.conversation.create({
      data: {
        userId,
        title,
        expiresAt,
      },
    });

    return newConv.id;
  }

  private async renewConversationTtl(conversationId: string, userMessage: string, assistantResponse: string): Promise<void> {
    try {
      const ttlDays = await ttlEngine.suggestConversationTtl(userMessage, assistantResponse);
      const expiresAt = ttlEngine.calculateExpiryDate(ttlDays);

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          expiresAt,
          updatedAt: new Date(),
        },
      });

      logger.info('Renewed conversation sliding TTL with LLM suggestion', { conversationId, ttlDays, expiresAt });
    } catch (err) {
      logger.warn('Failed to renew conversation TTL', { conversationId, error: String(err) });
    }
  }
}

export const brainOrchestrator = new BrainOrchestrator();
