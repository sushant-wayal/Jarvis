import { z } from 'zod';
import { subAgentRunner } from '../agents/sub-agent-runner';
import { JarvisTool } from './types';

export const delegateSubTaskTool: JarvisTool<{
  taskName: string;
  goal: string;
  initialContext?: string;
  budgetLimit?: number;
}> = {
  name: 'delegate_sub_task',
  description:
    'Delegate a specialized investigation or sub-task to an autonomous Sub-Agent with its own isolated tool budget (default 8 calls). Use this when comparing multiple repositories, investigating distinct modules, or running parallel research tracks before compiling your final master report.',
  category: 'PRODUCTIVITY',
  riskLevel: 'SAFE',
  requiresConfirmation: false,
  inputSchema: z.object({
    taskName: z
      .string()
      .describe(
        'Short identifier for the sub-task (e.g. "inspect_serenity_repo", "inspect_youtube_channel_repo")'
      ),
    goal: z
      .string()
      .min(5)
      .describe('Clear, detailed instructions of what the sub-agent should investigate and summarize'),
    initialContext: z
      .string()
      .optional()
      .describe(
        'Common discoveries, confirmed repository owners, repo names, branches, or shared facts discovered by the Master Agent, so the sub-agent does not waste tool calls repeating common discovery.'
      ),
    budgetLimit: z.coerce
      .number()
      .min(2)
      .max(10)
      .default(8)
      .describe('Tool call budget allocated to this sub-agent (default: 8, max: 10)'),
  }),
  execute: async (input, context) => {
    const result = await subAgentRunner.runSubAgent({
      taskName: input.taskName,
      goal: input.goal,
      initialContext: input.initialContext,
      toolContext: context,
      budgetLimit: input.budgetLimit,
    });

    return {
      taskName: result.taskName,
      success: result.success,
      summary: result.summary,
      toolCallsCount: result.toolCallsCount,
      durationMs: result.durationMs,
    };
  },
};
