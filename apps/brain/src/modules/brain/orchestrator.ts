import { BrainResponse, ToolContext } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { notificationService } from '@/modules/notifications/notification-service';
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
  /** Enable asynchronous background execution (Deep Work mode) */
  asyncMode?: boolean;
  /** Phone context snapshot from the mobile device */
  phoneContext?: import('@jarvis/shared').PhoneContext;
  /** Whether to speak intermediate progress / status aloud */
  speakIntermediateStatus?: boolean;
  /** Callback for real-time intermediate status updates */
  onProgress?: (update: import('@jarvis/shared').IntermediateStatusUpdate) => Promise<void> | void;
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

    // Check if this request qualifies for Asynchronous Deep Work mode
    const isDeepWork =
      Boolean(input.asyncMode) ||
      /(in the background|deep research|deep work|run in background|background research|background audit)/i.test(
        input.message
      );

    if (isDeepWork) {
      logger.info('Routing request to Asynchronous Deep Work pipeline', { requestId, conversationId });
      return this.dispatchDeepWork({
        input,
        userId,
        conversationId,
        timezone,
        locale,
        requestId,
        assembledContext,
      });
    }

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
      intent: classifiedIntent.intent,
      speakResponse: input.speakResponse,
      speakIntermediateStatus: input.speakIntermediateStatus,
      onProgress: input.onProgress,
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
            pendingConfirmation: brainResponse.pendingConfirmation,
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

  /**
   * Initiates an Asynchronous Deep Work execution loop in the background.
   * Immediately records the AgentRun, stores user message and acknowledgment,
   * fires the background worker, and returns a PROGRESS response to the caller.
   */
  private async dispatchDeepWork(params: {
    input: ProcessMessageInput;
    userId: string;
    conversationId: string;
    timezone: string;
    locale: string;
    requestId: string;
    assembledContext: import('./context-engine').AssembledContext;
  }): Promise<BrainResponse> {
    const { input, userId, conversationId, timezone, locale, requestId, assembledContext } = params;

    // 1. Create AgentRun record in EXECUTING status for full observability
    const agentRun = await prisma.agentRun.create({
      data: {
        userId,
        conversationId,
        status: 'EXECUTING',
        goal: input.message,
      },
    });

    // 2. Persist User Message
    const userCreatedAt = new Date();
    await prisma.message.create({
      data: {
        conversationId,
        role: 'USER',
        content: input.message,
        inputType: input.inputType || 'TEXT',
        createdAt: userCreatedAt,
      },
    });

    // 3. Formulate immediate acknowledgment
    const ackText = `I've started deep background investigation for: "${input.message}". I will analyze the repositories, dependencies, and architectural patterns, and notify you as soon as the report is ready.\n\nTracking Run ID: ${agentRun.id}`;

    // 4. Persist Assistant Acknowledgment Message
    await prisma.message.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: ackText,
        inputType: input.inputType || 'TEXT',
        createdAt: new Date(userCreatedAt.getTime() + 100),
        metadata: JSON.stringify({
          agentRunId: agentRun.id,
          mode: 'PROGRESS',
        }),
      },
    });

    // 5. Fire detached background work
    this.runDeepWorkInBackground({
      message: input.message,
      conversationId,
      userId,
      timezone,
      locale,
      requestId,
      agentRunId: agentRun.id,
      assembledContext,
      phoneContext: input.phoneContext,
    }).catch((err) => {
      logger.error('Unhandled error in background deep work execution', err, { agentRunId: agentRun.id });
    });

    // 6. Return immediate PROGRESS response to client
    return {
      text: ackText,
      shouldSpeak: Boolean(input.speakResponse),
      toolCalls: [],
      toolResults: [],
      conversationId,
      requestId,
      mode: 'PROGRESS',
      agentRunId: agentRun.id,
    };
  }

  /**
   * Executes the long-running ReAct agent loop in the background with an extended tool budget,
   * then updates the conversation history and dispatches push/in-app notifications.
   */
  private async runDeepWorkInBackground(params: {
    message: string;
    conversationId: string;
    userId: string;
    timezone: string;
    locale: string;
    requestId: string;
    agentRunId: string;
    assembledContext: import('./context-engine').AssembledContext;
    phoneContext?: import('@jarvis/shared').PhoneContext;
  }): Promise<void> {
    const { message, conversationId, userId, timezone, locale, requestId, agentRunId, assembledContext, phoneContext } = params;

    const toolContext: ToolContext = {
      userId,
      userName: assembledContext.userProfile.name || 'Sushant',
      conversationId,
      requestId,
      timezone,
      locale,
      agentRunId,
      phoneContext,
    };

    try {
      logger.info('Starting background deep work execution', { agentRunId, conversationId });

      // Run AgentPlanner with Deep Work budget (25 tool calls, 15 steps)
      const brainResponse = await agentPlanner.planAndExecute({
        message,
        context: assembledContext,
        toolContext,
        intent: 'PLANNING',
        maxToolCalls: 25,
        maxSteps: 15,
      });

      // Persist final assistant response
      await prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: brainResponse.text,
          inputType: 'TEXT',
          metadata: JSON.stringify({
            executedToolCalls: brainResponse.toolCalls,
            executedToolResults: brainResponse.toolResults,
            agentRunId,
            mode: 'ANSWER',
          }),
        },
      });

      // Renew conversation sliding TTL
      await this.renewConversationTtl(conversationId, message, brainResponse.text);

      // Deliver completion notification
      await notificationService.createNotification({
        userId,
        title: 'Deep Work Analysis Complete',
        body: `Completed research: "${message.slice(0, 60)}${message.length > 60 ? '...' : ''}"`,
        deepLink: `/chat?conversationId=${conversationId}`,
      });

      logger.info('Background deep work execution completed successfully', { agentRunId, conversationId });

      // Extract long-term memories
      memoryExtractor
        .extractAndStoreMemories(userId, message, brainResponse.text)
        .catch((e: unknown) => logger.warn('Memory extraction step warning', { error: String(e) }));
    } catch (err) {
      logger.error('Background deep work execution failed', err, { agentRunId, conversationId });

      const errorMessage = `I encountered an issue during background analysis: ${err instanceof Error ? err.message : String(err)}`;

      await prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: errorMessage,
          inputType: 'TEXT',
          metadata: JSON.stringify({
            agentRunId,
            mode: 'ERROR',
          }),
        },
      });

      await notificationService.createNotification({
        userId,
        title: 'Deep Work Task Failed',
        body: `Could not complete research: "${message.slice(0, 60)}${message.length > 60 ? '...' : ''}"`,
        deepLink: `/chat?conversationId=${conversationId}`,
      });
    }
  }
}

export const brainOrchestrator = new BrainOrchestrator();
