import { describe, expect, it } from 'vitest';
import { toolRegistry } from '../modules/tools/registry';
import { delegateSubTaskTool } from '../modules/tools/sub-agent-tool';
import { subAgentRunner } from '../modules/agents/sub-agent-runner';

describe('Sub-Agent Delegation & Multi-Agent Coordination', () => {
  it('delegateSubTaskTool parses and validates input schemas with sensible defaults', () => {
    const parsed = delegateSubTaskTool.inputSchema.parse({
      taskName: 'inspect_serenity_repo',
      goal: 'Inspect the serenity repository layout and main dependencies',
      initialContext: 'Discovered owner: sushant-wayal, repo: serenity, branch: main',
    });

    expect(parsed.taskName).toBe('inspect_serenity_repo');
    expect(parsed.goal).toContain('serenity');
    expect(parsed.initialContext).toBe('Discovered owner: sushant-wayal, repo: serenity, branch: main');
    expect(parsed.budgetLimit).toBe(8); // Default 8 calls
  });

  it('delegateSubTaskTool enforces budget limits between 2 and 10', () => {
    // Budget limit bounded to max 10 per Rule 13
    expect(() =>
      delegateSubTaskTool.inputSchema.parse({
        taskName: 'test',
        goal: 'test goal that is valid length',
        budgetLimit: 99,
      })
    ).toThrow();

    expect(() =>
      delegateSubTaskTool.inputSchema.parse({
        taskName: 'test',
        goal: 'test goal that is valid length',
        budgetLimit: 1,
      })
    ).toThrow();
  });

  it('delegate_sub_task is registered in ToolRegistry', () => {
    const tool = toolRegistry.getTool('delegate_sub_task');
    expect(tool).toBeDefined();
    expect(tool?.category).toBe('PRODUCTIVITY');
    expect(tool?.riskLevel).toBe('SAFE');
    expect(tool?.requiresConfirmation).toBe(false);
  });

  it('ToolRegistry can exclude delegate_sub_task to prevent recursive sub-agent loops', () => {
    const allDeclarations = toolRegistry.getGeminiFunctionDeclarations();
    expect(allDeclarations.some((d) => d.name === 'delegate_sub_task')).toBe(true);

    const subAgentDeclarations = toolRegistry.getGeminiFunctionDeclarations({
      excludeTools: ['delegate_sub_task'],
    });
    expect(subAgentDeclarations.some((d) => d.name === 'delegate_sub_task')).toBe(false);
  });

  it('subAgentRunner executes an isolated sub-agent task and returns synthesized summary', async () => {
    const dummyContext = {
      userId: 'test-user',
      userName: 'Sushant',
      conversationId: 'test-conv-subagent',
      requestId: 'test-req-subagent',
      timezone: 'UTC',
      locale: 'en-US',
    };

    const result = await subAgentRunner.runSubAgent({
      taskName: 'calculate_sub_task',
      goal: 'Use calculator to calculate (25 * 40) + 500 and summarize the arithmetic result',
      toolContext: dummyContext,
      budgetLimit: 4,
    });

    expect(result.taskName).toBe('calculate_sub_task');
    expect(result.success).toBe(true);
    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(10);
    // Ensure it did not return a 1-word reply
    expect(['done', 'done.', 'ok', 'finished']).not.toContain(result.summary.toLowerCase().trim());
  }, 45000);
});
