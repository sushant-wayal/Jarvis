import { ToolContext } from '@jarvis/shared';
import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { toolRegistry } from '@/modules/tools/registry';

export interface SubAgentTaskInput {
  taskName: string;
  goal: string;
  initialContext?: string;
  toolContext: ToolContext;
  budgetLimit?: number;
}

export interface SubAgentTaskOutput {
  taskName: string;
  success: boolean;
  summary: string;
  toolCallsCount: number;
  stepsCount: number;
  durationMs: number;
  error?: string;
}

export class SubAgentRunner {
  private fallbackModels = [DEFAULT_MODEL, ...FAST_FALLBACK_MODELS];

  async runSubAgent(input: SubAgentTaskInput): Promise<SubAgentTaskOutput> {
    const startTime = Date.now();
    const { taskName, goal, initialContext, toolContext } = input;
    const maxToolCalls = Math.min(input.budgetLimit || 8, 10);
    const maxSteps = 8;

    logger.info('Starting Sub-Agent execution', {
      taskName,
      goal,
      hasInitialContext: Boolean(initialContext),
      maxToolCalls,
      parentAgentRunId: toolContext.agentRunId,
    });

    const systemInstruction = `You are a dedicated, specialized Sub-Agent in the Jarvis AI system.
You have been delegated a focused technical investigation by the Master Agent.

Your Delegated Sub-Task: "${taskName}"
Your Goal: "${goal}"

Operational Directives:
1. Focus strictly and exclusively on achieving this goal.
2. The Master Agent may provide shared discoveries or common context. Use this context immediately and do NOT repeat common discovery calls (e.g. re-listing user repositories).
3. You have access to tools (such as GitHub, Web Search, etc.). Use them to inspect code, discover files, examine dependencies, and retrieve technical facts.
4. You have a budget of up to ${maxToolCalls} tool calls. Be targeted and efficient.
5. When you have completed your investigation, synthesize a comprehensive, well-structured markdown report of your findings for the Master Agent. Include key file paths, code snippets, architectural patterns, and dependencies.
6. NEVER reply with single-word replies like "Done." or "Finished.". Provide the actual substantive report.`;

    // Filter out delegation tool to prevent recursion
    const toolsConfig = toolRegistry.getGeminiFunctionDeclarations({
      excludeTools: ['delegate_sub_task', 'agent_delegate_sub_task'],
    });

    const initialUserPrompt = [
      `Begin sub-task investigation: ${goal}`,
      initialContext
        ? `\n[SHARED CONTEXT & PRELIMINARY DISCOVERIES FROM MASTER AGENT]:\n${initialContext}\n(Note: Leverage these preliminary discoveries directly to avoid redundant tool calls).`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const contents: Array<{
      role: string;
      parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }>;
    }> = [
      {
        role: 'user',
        parts: [{ text: initialUserPrompt }],
      },
    ];

    let stepCount = 0;
    let totalToolCalls = 0;
    let finalSummary = '';

    try {
      while (stepCount < maxSteps) {
        stepCount++;

        const response = await this.generateWithFallback({
          systemInstruction,
          contents: contents as never,
          toolsConfig: toolsConfig as never,
        });

        const functionCalls = response.functionCalls;

        // If no function calls, sub-agent provided its summary text
        if (!functionCalls || functionCalls.length === 0) {
          finalSummary = response.text?.trim() || '';
          if (
            finalSummary &&
            !['done', 'done.', 'finished', 'finished.', 'ok', 'completed'].includes(
              finalSummary.toLowerCase().trim()
            )
          ) {
            break;
          }
          // If empty or terse, force synthesis
          finalSummary = await this.synthesizeReport({
            taskName,
            goal,
            contents,
            systemInstruction,
            agentRunId: toolContext.agentRunId,
          });
          break;
        }

        // Record model turn
        contents.push({
          role: 'model',
          parts: functionCalls.map((fc) => ({
            functionCall: {
              name: fc.name || '',
              args: (fc.args as Record<string, unknown>) || {},
            },
          })),
        });

        // Execute tool calls
        const responseParts: Array<{ functionResponse: { name: string; response: Record<string, unknown> } }> = [];

        for (const fc of functionCalls) {
          const fcName = fc.name || '';
          if (!fcName) continue;

          totalToolCalls++;
          if (totalToolCalls > maxToolCalls) {
            break;
          }

          const tool = toolRegistry.getTool(fcName);
          if (!tool) continue;

          // Record step in database under parent agent run if present
          let stepRecordId: string | undefined;
          if (toolContext.agentRunId) {
            try {
              const step = await prisma.agentStep.create({
                data: {
                  agentRunId: toolContext.agentRunId,
                  stepNumber: 100 + totalToolCalls,
                  type: 'TOOL_CALL',
                  status: 'RUNNING',
                  input: JSON.stringify(fc.args || {}),
                  summary: `[Sub-Agent: ${taskName}] Executing ${fcName}`,
                },
              });
              stepRecordId = step.id;
            } catch {
              // Ignore DB step logging failure
            }
          }

          const toolRes = await tool.execute((fc.args as Record<string, unknown>) || {}, toolContext);

          if (stepRecordId) {
            await prisma.agentStep.update({
              where: { id: stepRecordId },
              data: {
                status: toolRes.success ? 'COMPLETED' : 'FAILED',
                output: JSON.stringify(toolRes.output || { success: false, error: toolRes.error }),
                completedAt: new Date(),
              },
            }).catch(() => {});
          }

          const outputPayload: Record<string, unknown> =
            typeof toolRes.output === 'object' && toolRes.output !== null
              ? { ...(toolRes.output as Record<string, unknown>) }
              : { result: toolRes.output ?? toolRes.error };

          const remaining = maxToolCalls - totalToolCalls;
          if (remaining <= 2 && remaining > 0) {
            outputPayload._budgetNotice = `[RUNWAY NOTICE: You have ${remaining} tool call(s) remaining. Conclude your investigation and prepare your report.]`;
          }

          responseParts.push({
            functionResponse: {
              name: fcName,
              response: outputPayload,
            },
          });
        }

        if (responseParts.length > 0) {
          contents.push({
            role: 'user',
            parts: responseParts,
          });
        }

        if (totalToolCalls >= maxToolCalls) {
          finalSummary = await this.synthesizeReport({
            taskName,
            goal,
            contents,
            systemInstruction,
            agentRunId: toolContext.agentRunId,
          });
          break;
        }
      }

      if (!finalSummary) {
        finalSummary = await this.synthesizeReport({
          taskName,
          goal,
          contents,
          systemInstruction,
          agentRunId: toolContext.agentRunId,
        });
      }

      // Record final sub-agent outcome in parent agent run
      if (toolContext.agentRunId) {
        await prisma.agentStep.create({
          data: {
            agentRunId: toolContext.agentRunId,
            stepNumber: 200 + totalToolCalls,
            type: 'OBSERVATION',
            status: 'COMPLETED',
            summary: `[Sub-Agent: ${taskName}] Completed report (${totalToolCalls} tool calls)`,
            output: JSON.stringify({ summary: finalSummary }),
          },
        }).catch(() => {});
      }

      const durationMs = Date.now() - startTime;
      logger.info('Sub-Agent completed successfully', {
        taskName,
        totalToolCalls,
        durationMs,
      });

      return {
        taskName,
        success: true,
        summary: finalSummary,
        toolCallsCount: totalToolCalls,
        stepsCount: stepCount,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Sub-Agent execution failed', err, { taskName });

      return {
        taskName,
        success: false,
        summary: `Sub-agent "${taskName}" failed during execution: ${errorMsg}`,
        toolCallsCount: totalToolCalls,
        stepsCount: stepCount,
        durationMs,
        error: errorMsg,
      };
    }
  }

  private async synthesizeReport(params: {
    taskName: string;
    goal: string;
    contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }> }>;
    systemInstruction: string;
    agentRunId?: string;
  }): Promise<string> {
    const directive = `[SYSTEM DIRECTIVE: SYNTHESIZE SUB-AGENT REPORT]:
Your investigation of "${params.taskName}" is complete.
Goal was: "${params.goal}".
Do NOT call any more tools.
Synthesize a comprehensive, technical markdown summary of your findings for the Master Agent.
Include:
- Overview of findings
- Architecture / layout discovered
- Key dependencies and entry points
- Recommendations or potential gotchas
Never reply with simple confirmations like "Done." or "OK.". Deliver the full technical summary.`;

    const synthesisContents = [
      ...params.contents,
      {
        role: 'user',
        parts: [{ text: directive }],
      },
    ];

    try {
      const response = await this.generateWithFallback({
        systemInstruction: params.systemInstruction,
        contents: synthesisContents,
        toolsConfig: [],
      });

      const text = response.text?.trim() || '';
      if (text) return text;
    } catch (err) {
      logger.error('Sub-Agent synthesis failed', err, { taskName: params.taskName });
    }

    return `Completed investigation for ${params.taskName}. Context and tool results gathered.`;
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
        logger.warn(`Model ${model} failed in sub-agent runner, trying next fallback`, {
          model,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    throw lastError || new Error('All models failed in sub-agent execution');
  }
}

export const subAgentRunner = new SubAgentRunner();
