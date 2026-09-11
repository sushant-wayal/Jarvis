import { describe, expect, it } from 'vitest';
import { GetRepositoriesTool } from '../modules/integrations/github/tools/GetRepositoriesTool';
import { SearchCodeTool } from '../modules/integrations/github/tools/SearchCodeTool';
import { GetFileContentTool } from '../modules/integrations/github/tools/GetFileContentTool';
import { GetRepositoryOverviewTool } from '../modules/integrations/github/tools/GetRepositoryOverviewTool';
import { GetBatchFilesTool } from '../modules/integrations/github/tools/GetBatchFilesTool';
import { GitHubClient } from '../modules/integrations/github/GitHubClient';
import { toolRegistry } from '../modules/tools/registry';
import { resolveToolBudget } from '../modules/brain/agent-planner';

describe('Agent Synthesis & Integration Tools Hardening', () => {
  const dummyClient = new GitHubClient('test-token');

  it('GetRepositoriesTool parses string limits cleanly using z.coerce.number()', async () => {
    const tool = new GetRepositoriesTool(dummyClient);
    const parsed = tool.inputSchema.parse({ limit: '30' });
    expect(parsed.limit).toBe(30);
  });

  it('SearchCodeTool parses string limits cleanly using z.coerce.number()', async () => {
    const tool = new SearchCodeTool(dummyClient);
    const parsed = tool.inputSchema.parse({ owner: 'user', repo: 'repo', query: 'test', limit: '15' });
    expect(parsed.limit).toBe(15);
  });

  it('GetFileContentTool parses string startLine and endLine cleanly', async () => {
    const tool = new GetFileContentTool(dummyClient);
    const parsed = tool.inputSchema.parse({
      owner: 'user',
      repo: 'repo',
      path: 'index.ts',
      startLine: '10',
      endLine: '25',
    });
    expect(parsed.startLine).toBe(10);
    expect(parsed.endLine).toBe(25);
  });

  it('ToolRegistry retains error details in ToolResult on schema validation failure', async () => {
    const tool = toolRegistry.getTool('github.get_repositories');
    expect(tool).toBeDefined();

    // Pass an invalid limit (> 30)
    const result = await tool!.execute(
      { limit: 999 },
      { userId: 'u1', userName: 'Test', conversationId: 'c1', requestId: 'r1', timezone: 'UTC', locale: 'en-US' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
    expect(result.error).toContain('Number must be less than or equal to 30');
  });

  it('resolveToolBudget scales budget dynamically based on intent and query complexity', () => {
    // Conversational & Calculation: compact budgets
    expect(resolveToolBudget('CALCULATION')).toEqual({ maxToolCalls: 4, maxSteps: 5 });
    expect(resolveToolBudget('CONVERSATION')).toEqual({ maxToolCalls: 4, maxSteps: 5 });

    // Standard tasks
    expect(resolveToolBudget('TASK_CREATION')).toEqual({ maxToolCalls: 6, maxSteps: 6 });
    expect(resolveToolBudget('REMINDER')).toEqual({ maxToolCalls: 6, maxSteps: 6 });

    // Information lookup & Search
    expect(resolveToolBudget('SEARCH')).toEqual({ maxToolCalls: 10, maxSteps: 8 });

    // Deep planning & architectural analysis: extended budget
    expect(resolveToolBudget('PLANNING')).toEqual({ maxToolCalls: 18, maxSteps: 12 });
    expect(
      resolveToolBudget('QUESTION', 'Please analyze the serenity architecture and codebase integration')
    ).toEqual({ maxToolCalls: 18, maxSteps: 12 });
    expect(
      resolveToolBudget('QUESTION', 'Investigate repository structure and compare with current workflow')
    ).toEqual({ maxToolCalls: 18, maxSteps: 12 });
  });

  it('GetRepositoryOverviewTool validates inputs and is registered in registry', () => {
    const tool = new GetRepositoryOverviewTool(dummyClient);
    const parsed = tool.inputSchema.parse({ owner: 'sushant-wayal', repo: 'Jarvis' });
    expect(parsed.owner).toBe('sushant-wayal');
    expect(parsed.repo).toBe('Jarvis');

    const regTool = toolRegistry.getTool('github.get_repository_overview');
    expect(regTool).toBeDefined();
    expect(regTool?.category).toBe('PRODUCTIVITY');
  });

  it('GetBatchFilesTool validates array of paths and maxLinesPerFile', () => {
    const tool = new GetBatchFilesTool(dummyClient);
    const parsed = tool.inputSchema.parse({
      owner: 'sushant-wayal',
      repo: 'Jarvis',
      paths: ['package.json', 'README.md'],
      maxLinesPerFile: '50',
    });
    expect(parsed.paths).toEqual(['package.json', 'README.md']);
    expect(parsed.maxLinesPerFile).toBe(50);

    const regTool = toolRegistry.getTool('github.get_batch_files');
    expect(regTool).toBeDefined();
  });
});
