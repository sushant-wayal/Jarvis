import { BrainResponse, ToolCall, ToolContext, ToolResult } from '@jarvis/shared';
import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
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
  private fallbackModels = [DEFAULT_MODEL, ...FAST_FALLBACK_MODELS];

  private async generateWithFallback(params: {
    systemInstruction?: string;
    contents: Array<{ role: string; parts: Array<{ text?: string; inlineData?: Record<string, unknown> }> }>;
    toolsConfig?: Array<Record<string, unknown>>;
  }) {
    const uniqueModels = Array.from(new Set(this.fallbackModels));
    let lastError: unknown = null;

    for (const model of uniqueModels) {
      try {
        const config: Record<string, unknown> = {};
        if (params.systemInstruction) {
          config.systemInstruction = params.systemInstruction;
        }
        if (params.toolsConfig && params.toolsConfig.length > 0) {
          config.tools = [{ functionDeclarations: params.toolsConfig }];
        }

        const response = await aiClient.models.generateContent({
          model,
          contents: params.contents as never,
          config: Object.keys(config).length > 0 ? (config as never) : undefined,
        });
        return response;
      } catch (err) {
        lastError = err;
        logger.warn(`Model ${model} failed, trying next fallback model`, {
          model,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    throw lastError || new Error('All fallback models failed');
  }

  async processMessage(input: ProcessMessageInput): Promise<BrainResponse> {
    const userId = input.userId || 'default-user';
    const timezone = input.timezone || 'UTC';
    const locale = input.locale || 'en-US';
    const requestId = input.requestId;

    // 1. Ensure user exists first
    await this.ensureUserExists(userId);

    // 2. Resolve conversation & relevant memories
    const [conversationId, memories] = await Promise.all([
      this.getOrCreateConversation(userId, input.conversationId, input.message),
      memoryService.getRelevantMemories(userId, input.message, 5),
    ]);

    // 3. Load recent history before inserting current turn
    const historyMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    historyMessages.reverse();

    // 4. Save current user message to database
    await prisma.message.create({
      data: {
        conversationId,
        role: 'USER',
        content: input.message,
        inputType: input.inputType || 'TEXT',
      },
    });

    // 5. Build system prompt
    const systemPrompt = buildSystemPrompt({ name: 'Sushant' }, memories);

    // 6. Tool context
    const toolContext: ToolContext = {
      userId,
      conversationId,
      requestId,
      timezone,
      locale,
    };

    // 7. Gemini function declarations
    const toolsConfig = toolRegistry.getGeminiFunctionDeclarations();

    const executedToolCalls: ToolCall[] = [];
    const executedToolResults: ToolResult[] = [];
    let finalText = '';

    try {
      // Build conversation contents for Gemini SDK (strictly alternating user/model turns ending in user)
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      for (const msg of historyMessages) {
        if (msg.role === 'USER') {
          // Avoid consecutive user turns
          if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
            contents.push({ role: 'user', parts: [{ text: msg.content }] });
          }
        } else if (msg.role === 'ASSISTANT') {
          // Only add model turn if preceded by a user turn
          if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
            contents.push({ role: 'model', parts: [{ text: msg.content }] });
          }
        }
      }

      // If last turn is a user turn, add dummy model response or remove it to append current turn
      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
      }

      // ALWAYS append the current user query as the final turn
      contents.push({ role: 'user', parts: [{ text: input.message }] });

      // First LLM turn with tool calling
      const response = await this.generateWithFallback({
        systemInstruction: systemPrompt,
        contents,
        toolsConfig: toolsConfig as never,
      });

      // Check if Gemini invoked any function calls
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
        let requiresComplexSynthesis = false;

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

            // Web search or failed tools require LLM synthesis
            if (fcName === 'web_search' || !toolRes.success) {
              requiresComplexSynthesis = true;
            }

            // Feed tool result back to contents in case 2nd turn is needed
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

        // Fast-Path: Deterministic tools format instantly without 2nd 2000ms LLM roundtrip!
        if (!requiresComplexSynthesis && executedToolResults.length > 0 && executedToolResults[0].success) {
          finalText = this.formatDirectToolOutput(executedToolCalls[0].name, executedToolResults[0].output);
        } else {
          // Second LLM turn for complex web search synthesis
          const finalResponse = await this.generateWithFallback({
            systemInstruction: systemPrompt,
            contents,
          });
          finalText = finalResponse.text?.trim() || 'Done.';
        }
      } else {
        finalText = response.text?.trim() || "I'm sorry, I couldn't process that right now.";
      }
    } catch (err) {
      logger.error('Gemini execution error, using fallback logic', err, { requestId });
      finalText = this.getHeuristicFallbackResponse(input.message, executedToolResults);
    }

    // 8. Clean up voice-unfriendly text
    finalText = this.sanitizeVoiceResponse(finalText);

    // 9. Non-blocking Database storage & async memory extraction
    Promise.all([
      prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: finalText,
          inputType: input.inputType || 'TEXT',
          metadata: JSON.stringify({
            executedToolCalls,
            executedToolResults,
          }),
        },
      }),
      ...executedToolCalls.map((call, i) => {
        const res = executedToolResults[i];
        return prisma.toolExecution.create({
          data: {
            conversationId,
            toolName: call.name,
            input: JSON.stringify(call.input),
            output: res ? JSON.stringify(res.output) : '{}',
            status: res?.success ? 'SUCCESS' : 'FAILED',
            durationMs: res?.durationMs || 0,
          },
        });
      }),
    ]).catch((e: unknown) => logger.warn('Background message save warning', { error: String(e) }));

    // 10. Asynchronously extract and save memories without blocking response
    memoryExtractor
      .extractAndStoreMemories(userId, input.message, finalText)
      .catch((e: unknown) => logger.warn('Memory extraction step completed without additions', { error: String(e) }));

    return {
      text: finalText,
      conversationId,
      toolCalls: executedToolCalls,
      toolResults: executedToolResults,
      shouldSpeak: Boolean(input.speakResponse),
      requestId,
    };
  }

  private formatDirectToolOutput(toolName: string, rawOutput: unknown): string {
    if (!rawOutput || typeof rawOutput !== 'object') {
      return String(rawOutput || 'Done.');
    }
    const output = rawOutput as Record<string, unknown>;
    if (toolName === 'calculator') {
      return `${output.result}.`;
    }
    if (toolName === 'current_time' || toolName === 'date_time') {
      if (typeof output.formatted === 'string') return output.formatted;
      if (typeof output.time === 'string') return `It is ${output.time}.`;
    }
    if (toolName === 'weather') {
      if (typeof output.summary === 'string') return output.summary;
    }
    if ('result' in output) {
      return `${output.result}`;
    }
    return JSON.stringify(output);
  }

  private getHeuristicFallbackResponse(userMessage: string, toolResults: ToolResult[]): string {
    if (toolResults.length > 0) {
      const last = toolResults[toolResults.length - 1];
      if (last.success && last.output) {
        if (typeof last.output === 'object' && 'result' in last.output) {
          return `${last.output.result}`;
        }
        return JSON.stringify(last.output);
      }
    }

    // Direct math evaluator fallback for queries like "49 into 193", "25 * 4", "100 divided by 5"
    const mathMatch = userMessage.match(/(\d+(?:\.\d+)?)\s*(?:into|times|multiplied by|\*|x|\+|\-|\/|divided by)\s*(\d+(?:\.\d+)?)/i);
    if (mathMatch) {
      const num1 = parseFloat(mathMatch[1]);
      const num2 = parseFloat(mathMatch[2]);
      const msg = userMessage.toLowerCase();
      if (msg.includes('into') || msg.includes('times') || msg.includes('multiplied') || msg.includes('*') || msg.includes('x')) {
        return `${num1 * num2}.`;
      }
      if (msg.includes('+') || msg.includes('plus') || msg.includes('add')) {
        return `${num1 + num2}.`;
      }
      if (msg.includes('-') || msg.includes('minus') || msg.includes('subtract')) {
        return `${num1 - num2}.`;
      }
      if (msg.includes('/') || msg.includes('divided')) {
        return `${num2 !== 0 ? num1 / num2 : 'Error: division by zero'}.`;
      }
    }

    const msg = userMessage.toLowerCase();
    if (msg.includes('time')) {
      return `The current time is ${new Date().toLocaleTimeString()}.`;
    }
    if (msg.includes('date')) {
      return `Today is ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
    }

    return "I am here. How can I help you, Sushant?";
  }

  private sanitizeVoiceResponse(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/```[\s\S]*?```/g, 'Code output provided.')
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
