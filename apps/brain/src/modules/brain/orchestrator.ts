import { BrainResponse, ToolCall, ToolContext, ToolResult } from '@jarvis/shared';
import { aiClient, DEFAULT_MODEL } from '@/lib/ai/gemini';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { memoryService } from '@/modules/memory/memory-service';
import { toolRegistry } from '@/modules/tools/registry';
import { memoryExtractor } from './memory-extractor';
import { buildSystemPrompt } from './prompts';

export interface ProcessMessageInput {
  message: string;
  conversationId?: string;
  userId?: string;
  timezone?: string;
  locale?: string;
  inputType?: 'TEXT' | 'VOICE';
  speakResponse?: boolean;
  requestId: string;
}

export class BrainOrchestrator {
  async processMessage(input: ProcessMessageInput): Promise<BrainResponse> {
    const userId = input.userId || 'default-user';
    const timezone = input.timezone || 'UTC';
    const locale = input.locale || 'en-US';
    const requestId = input.requestId;

    // 1. Ensure user exists
    await this.ensureUserExists(userId);

    // 2. Load or create conversation
    const conversationId = await this.getOrCreateConversation(userId, input.conversationId, input.message);

    // 3. Store user message in DB
    await prisma.message.create({
      data: {
        conversationId,
        role: 'USER',
        content: input.message,
        inputType: input.inputType || 'TEXT',
      },
    });

    // 4. Load recent conversation history (last 10 messages)
    const historyMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    historyMessages.reverse();

    // 5. Retrieve relevant memories for user
    const memories = await memoryService.getRelevantMemories(userId, input.message, 5);

    // 6. Build composed system prompt
    const systemPrompt = buildSystemPrompt({ name: 'Sushant' }, memories);

    // 7. Tool context
    const toolContext: ToolContext = {
      userId,
      conversationId,
      requestId,
      timezone,
      locale,
    };

    // 8. Gemini function declarations
    const toolsConfig = toolRegistry.getGeminiFunctionDeclarations();

    const executedToolCalls: ToolCall[] = [];
    const executedToolResults: ToolResult[] = [];
    let finalText = '';

    try {
      // Build conversation contents for Gemini SDK
      const contents: Array<{ role: string; parts: Array<{ text?: string }> }> = [
        { role: 'user', parts: [{ text: `[SYSTEM CONTEXT]\n${systemPrompt}` }] },
        { role: 'model', parts: [{ text: 'Understood. I am Jarvis.' }] },
      ];

      for (const msg of historyMessages) {
        if (msg.role === 'USER') {
          contents.push({ role: 'user', parts: [{ text: msg.content }] });
        } else if (msg.role === 'ASSISTANT') {
          contents.push({ role: 'model', parts: [{ text: msg.content }] });
        }
      }

      // First LLM turn with tool calling
      const response = await aiClient.models.generateContent({
        model: DEFAULT_MODEL,
        contents,
        config: {
          tools: [{ functionDeclarations: toolsConfig }],
        },
      });

      // Check if Gemini invoked any function calls
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
        for (const fc of functionCalls) {
          const fcName = fc.name || '';
          if (!fcName) continue;

          const toolCall: ToolCall = {
            id: `call_${Math.random().toString(36).substring(2, 9)}`,
            name: fcName,
            input: (fc.args as Record<string, unknown>) || {},
          };
          executedToolCalls.push(toolCall);

          const tool = toolRegistry.getTool(fcName);
          if (tool) {
            const toolRes = await tool.execute(toolCall.input, toolContext);
            executedToolResults.push(toolRes);

            // Feed tool result back to LLM
            contents.push({
              role: 'model',
              parts: [{ text: `Called tool ${fcName}` }],
            });
            contents.push({
              role: 'user',
              parts: [
                {
                  text: `[TOOL RESULT for ${fcName}]: ${JSON.stringify(toolRes.output)}`,
                },
              ],
            });
          }
        }

        // Second LLM turn to synthesize final answer with tool outputs
        const finalResponse = await aiClient.models.generateContent({
          model: DEFAULT_MODEL,
          contents,
        });

        finalText = finalResponse.text?.trim() || 'Done.';
      } else {
        finalText = response.text?.trim() || "I'm sorry, I couldn't process that right now.";
      }
    } catch (err) {
      logger.error('Gemini execution error, using fallback logic', err, { requestId });
      finalText = await this.fallbackOrchestration(input.message, toolContext, executedToolCalls, executedToolResults);
    }

    // Clean up any remaining AI fluff or disclaimers
    finalText = this.sanitizeResponse(finalText);

    // 9. Store assistant message in DB
    await prisma.message.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: finalText,
        inputType: 'TEXT',
        metadata: JSON.stringify({ executedToolCalls, requestId }),
      },
    });

    // 10. Extract potential long-term memories in background
    memoryExtractor.extractAndStoreMemories(userId, input.message, finalText).catch(() => {});

    return {
      text: finalText,
      shouldSpeak: Boolean(input.speakResponse || input.inputType === 'VOICE'),
      toolCalls: executedToolCalls,
      toolResults: executedToolResults,
      conversationId,
      requestId,
    };
  }

  private async fallbackOrchestration(
    message: string,
    context: ToolContext,
    executedToolCalls: ToolCall[],
    executedToolResults: ToolResult[]
  ): Promise<string> {
    const msgLower = message.toLowerCase();

    if (msgLower.includes('weather')) {
      const tool = toolRegistry.getTool('weather');
      if (tool) {
        const res = await tool.execute({ location: 'Mumbai' }, context);
        executedToolCalls.push({ id: 'fallback_1', name: 'weather', input: { location: 'Mumbai' } });
        executedToolResults.push(res);
        const data = res.output as { temperatureC: number; condition: string; recommendation: string };
        return `It's currently ${data.temperatureC}°C and ${data.condition.toLowerCase()}. ${data.recommendation}`;
      }
    }

    if (msgLower.includes('time')) {
      const tool = toolRegistry.getTool('current_time');
      if (tool) {
        const res = await tool.execute({}, context);
        executedToolCalls.push({ id: 'fallback_2', name: 'current_time', input: {} });
        executedToolResults.push(res);
        const data = res.output as { formatted: string };
        return `It is currently ${data.formatted}.`;
      }
    }

    if (msgLower.includes('date') || msgLower.includes('today')) {
      const tool = toolRegistry.getTool('date_time');
      if (tool) {
        const res = await tool.execute({}, context);
        executedToolCalls.push({ id: 'fallback_3', name: 'date_time', input: {} });
        executedToolResults.push(res);
        const data = res.output as { date: string };
        return `Today is ${data.date}.`;
      }
    }

    // Math expression fallback matching
    const mathMatch = message.match(/(\d+\s*(?:percent of|\%|plus|minus|times|divided by|\+|\-|\*|\/)\s*\d+)/i) ||
      message.match(/(\d+\s*[\+\-\*\/\%]\s*\d+)/);

    if (mathMatch || msgLower.includes('calculate') || msgLower.includes('percent')) {
      const expr = mathMatch ? mathMatch[1] : message.replace(/[^0-9+\-*/.%]/g, ' ').trim();
      const tool = toolRegistry.getTool('calculator');
      if (tool && expr) {
        const res = await tool.execute({ expression: expr }, context);
        executedToolCalls.push({ id: 'fallback_4', name: 'calculator', input: { expression: expr } });
        executedToolResults.push(res);
        if (res.success && res.output) {
          const data = res.output as { result: number };
          return `${data.result}.`;
        }
      }
    }

    return "I couldn't process that request right now. Please try again.";
  }

  private sanitizeResponse(text: string): string {
    return text
      .replace(/^As an AI language model,\s*/i, '')
      .replace(/^Certainly!\s*/i, '')
      .replace(/^Sure,\s*/i, '')
      .trim();
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
