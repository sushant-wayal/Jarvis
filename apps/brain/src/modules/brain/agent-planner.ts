import {
  AgentRunStatus,
  BrainResponse,
  ResponseMode,
  ToolCall,
  ToolContext,
  ToolResult,
} from '@jarvis/shared';
import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { toolRegistry } from '@/modules/tools/registry';
import { AssembledContext } from './context-engine';

export interface PlanAndExecuteOptions {
  message: string;
  context: AssembledContext;
  toolContext: ToolContext;
  maxSteps?: number;
  maxToolCalls?: number;
}

export class AgentPlanner {
  private fallbackModels = [DEFAULT_MODEL, ...FAST_FALLBACK_MODELS];
  private defaultMaxSteps = 10;
  private defaultMaxToolCalls = 8;

  async planAndExecute(options: PlanAndExecuteOptions): Promise<BrainResponse> {
    const { message, context, toolContext } = options;
    const maxSteps = options.maxSteps || this.defaultMaxSteps;
    const maxToolCalls = options.maxToolCalls || this.defaultMaxToolCalls;

    const startTime = Date.now();
    let stepCount = 0;
    let totalToolCalls = 0;
    const executedToolCalls: ToolCall[] = [];
    const executedToolResults: ToolResult[] = [];
    let finalText = '';
    let responseMode: ResponseMode = 'ANSWER';

    // 1. Create AgentRun record in database for observability
    const agentRun = await prisma.agentRun.create({
      data: {
        userId: toolContext.userId,
        conversationId: toolContext.conversationId,
        status: 'EXECUTING',
        goal: message,
      },
    });

    toolContext.agentRunId = agentRun.id;

    // 2. Build conversation history contents
    const contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }> }> = [];

    for (const msg of context.recentHistory) {
      if (msg.role === 'USER') {
        if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
          contents.push({ role: 'user', parts: [{ text: msg.content }] });
        }
      } else if (msg.role === 'ASSISTANT') {
        if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
          contents.push({ role: 'model', parts: [{ text: msg.content }] });
        }
      }
    }

    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
    }

    contents.push({ role: 'user', parts: [{ text: message }] });

    const toolsConfig = toolRegistry.getGeminiFunctionDeclarations();

    try {
      // 3. Autonomous Multi-Step ReAct Loop
      while (stepCount < maxSteps) {
        stepCount++;
        toolContext.stepNumber = stepCount;

        // Call Gemini with tools and system instruction
        const response = await this.generateWithFallback({
          systemInstruction: `You are Jarvis, a proactive, capable personal AI operating layer.
${context.systemContextString}

Guidelines:
1. Speak concisely and clearly. Deliver answers directly.
2. Use tools whenever external calculation, live information, reminders, or memory actions are needed.
3. Combine multiple tools in sequence if required to fully satisfy the user's goal.
4. If a calculation is requested, return the concise mathematical result.
5. If creating a reminder or task, confirm once completed with date/time.`,
          contents: contents as never,
          toolsConfig: toolsConfig as never,
        });

        const functionCalls = response.functionCalls;

        // No more tool calls -> Final Assistant Answer
        if (!functionCalls || functionCalls.length === 0) {
          finalText = response.text?.trim() || 'Done.';
          responseMode = 'ANSWER';

          await prisma.agentStep.create({
            data: {
              agentRunId: agentRun.id,
              stepNumber: stepCount,
              type: 'RESPONSE',
              status: 'COMPLETED',
              summary: 'Generated final response',
              output: JSON.stringify({ text: finalText }),
            },
          });

          break;
        }

        // Process Tool Calls
        let allDeterministicFastPath = true;

        for (const fc of functionCalls) {
          const fcName = fc.name || '';
          if (!fcName) continue;

          totalToolCalls++;
          if (totalToolCalls > maxToolCalls) {
            logger.warn('Agent reached max tool calls limit', { totalToolCalls });
            break;
          }

          const toolCall: ToolCall = {
            id: `call_${Math.random().toString(36).substring(2, 9)}`,
            name: fcName,
            input: (fc.args as Record<string, unknown>) || {},
          };
          executedToolCalls.push(toolCall);

          const tool = toolRegistry.getTool(fcName);
          if (!tool) continue;

          // Check if action requires confirmation
          if (tool.requiresConfirmation || tool.riskLevel === 'CRITICAL' || tool.riskLevel === 'HIGH_RISK') {
            await prisma.agentRun.update({
              where: { id: agentRun.id },
              data: { status: 'WAITING_FOR_USER' },
            });

            return {
              text: `I prepared this action: ${tool.name}. Would you like me to proceed?`,
              shouldSpeak: true,
              toolCalls: [toolCall],
              toolResults: [],
              conversationId: toolContext.conversationId,
              requestId: toolContext.requestId,
              mode: 'CONFIRMATION',
              agentRunId: agentRun.id,
              pendingConfirmation: {
                actionId: toolCall.id,
                toolName: tool.name,
                riskLevel: tool.riskLevel,
                summary: `Execute ${tool.name} with ${JSON.stringify(toolCall.input)}`,
                payload: toolCall.input,
              },
            };
          }

          // Record step
          const stepRecord = await prisma.agentStep.create({
            data: {
              agentRunId: agentRun.id,
              stepNumber: stepCount,
              type: 'TOOL_CALL',
              status: 'RUNNING',
              input: JSON.stringify(toolCall.input),
              summary: `Executing tool ${fcName}`,
            },
          });

          // Execute tool
          const toolRes = await tool.execute(toolCall.input, toolContext);
          executedToolResults.push(toolRes);

          await prisma.agentStep.update({
            where: { id: stepRecord.id },
            data: {
              status: toolRes.success ? 'COMPLETED' : 'FAILED',
              output: JSON.stringify(toolRes.output),
              completedAt: new Date(),
            },
          });

          if (fcName === 'web_search' || !toolRes.success) {
            allDeterministicFastPath = false;
          }

          // Feed observation back to model
          contents.push({
            role: 'model',
            parts: [{ text: `Called tool ${fcName}` }],
          });
          contents.push({
            role: 'user',
            parts: [{ text: `[OBSERVATION for ${fcName}]: ${JSON.stringify(toolRes.output)}` }],
          });
        }

        // Fast path for single-step deterministic tools (calculator, date/time)
        if (allDeterministicFastPath && stepCount === 1 && executedToolResults.length > 0 && executedToolResults[0].success) {
          finalText = this.formatDirectOutput(executedToolCalls[0].name, executedToolResults[0].output);
          responseMode = 'ACTION';
          break;
        }
      }

      // If loop finished due to step limit
      if (!finalText) {
        finalText = 'Task processed.';
      }

      // Update AgentRun to COMPLETED
      await prisma.agentRun.update({
        where: { id: agentRun.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    } catch (err) {
      logger.error('AgentPlanner error during execution', err, { agentRunId: agentRun.id });
      finalText = this.getFallbackAnswer(message, executedToolResults);

      await prisma.agentRun.update({
        where: { id: agentRun.id },
        data: {
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
    }

    return {
      text: finalText,
      conversationId: toolContext.conversationId,
      toolCalls: executedToolCalls,
      toolResults: executedToolResults,
      shouldSpeak: true,
      requestId: toolContext.requestId,
      mode: responseMode,
      agentRunId: agentRun.id,
    };
  }

  private formatDirectOutput(toolName: string, rawOutput: unknown): string {
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
    if (toolName === 'task_create') {
      return `Done. I've scheduled "${output.title}".`;
    }
    if (toolName === 'memory_create') {
      return `I will remember that.`;
    }
    if ('result' in output) {
      return `${output.result}`;
    }
    return JSON.stringify(output);
  }

  private getFallbackAnswer(message: string, toolResults: ToolResult[]): string {
    if (toolResults.length > 0) {
      const last = toolResults[toolResults.length - 1];
      if (last.success && last.output && typeof last.output === 'object' && 'result' in last.output) {
        return `${(last.output as Record<string, unknown>).result}`;
      }
    }

    const mathMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:into|times|multiplied by|\*|x|\+|\-|\/|divided by)\s*(\d+(?:\.\d+)?)/i);
    if (mathMatch) {
      const num1 = parseFloat(mathMatch[1]);
      const num2 = parseFloat(mathMatch[2]);
      const msg = message.toLowerCase();
      if (msg.includes('into') || msg.includes('times') || msg.includes('multiplied') || msg.includes('*') || msg.includes('x')) {
        return `${num1 * num2}.`;
      }
      if (msg.includes('+') || msg.includes('plus')) return `${num1 + num2}.`;
      if (msg.includes('-') || msg.includes('minus')) return `${num1 - num2}.`;
      if (msg.includes('/') || msg.includes('divided')) return `${num2 !== 0 ? num1 / num2 : 'Error'}.`;
    }

    return 'I have completed your request.';
  }

  private async generateWithFallback(params: {
    systemInstruction?: string;
    contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }> }>;
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
        logger.warn(`Model ${model} failed in planner, trying next fallback model`, {
          model,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    throw lastError || new Error('All fallback models failed in agent planner');
  }
}

export const agentPlanner = new AgentPlanner();
