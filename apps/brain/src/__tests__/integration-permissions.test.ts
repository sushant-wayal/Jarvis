import { ToolContext } from '@jarvis/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agentPlanner } from '../modules/brain/agent-planner';
import { prisma } from '../lib/db/prisma';
import { toolRegistry } from '../modules/tools/registry';
import { BaseIntegrationTool } from '../modules/integrations/integration-tool';
import { z } from 'zod';

describe('Integration Permissions & Auto-Execution Lifecycle', () => {
  const dummyContext: ToolContext = {
    userId: 'user-perms-test',
    conversationId: 'conv-perms-test',
    requestId: 'req-perms-1',
    timezone: 'UTC',
    locale: 'en-US',
  };

  const mockExecutor = vi.fn().mockResolvedValue({
    success: true,
    data: { sent: true },
    message: 'Email sent successfully.',
  });

  class MockSendEmailTool extends BaseIntegrationTool<{ to: string; body: string }, { sent: boolean }> {
    constructor() {
      super({
        id: 'test_mail.send_email',
        name: 'test_mail.send_email',
        description: 'Sends an email',
        integrationId: 'test_mail',
        category: 'COMMUNICATION',
        actionType: 'EXTERNAL_ACTION',
        riskLevel: 'HIGH_RISK',
        requiresConfirmation: true,
        inputSchema: z.object({
          to: z.string(),
          body: z.string(),
        }),
        executor: async (input, ctx) => {
          return mockExecutor(input, ctx);
        },
      });
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    toolRegistry.register(new MockSendEmailTool() as any);

    await prisma.user.upsert({
      where: { id: dummyContext.userId },
      create: { id: dummyContext.userId, name: 'Sushant' },
      update: {},
    });

    await prisma.conversation.upsert({
      where: { id: dummyContext.conversationId! },
      create: { id: dummyContext.conversationId!, userId: dummyContext.userId },
      update: {},
    });
  });

  it('halts with CONFIRMATION when actionType is not auto-approved', async () => {
    // Mock Gemini returning tool call
    vi.spyOn(agentPlanner as any, 'generateWithFallback').mockResolvedValueOnce({
      functionCalls: [
        {
          name: 'test_mail_send_email',
          args: { to: 'colleague@example.com', body: 'Review required' },
        },
      ],
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: 'test_mail_send_email',
                  args: { to: 'colleague@example.com', body: 'Review required' },
                },
              },
            ],
          },
        },
      ],
    });

    const result = await agentPlanner.planAndExecute({
      message: 'Send an email to colleague@example.com',
      toolContext: dummyContext,
      context: {
        userProfile: {
          id: dummyContext.userId,
          name: 'Sushant',
          preferences: {
            integrations: {
              test_mail: {
                autoApprove: { EXTERNAL_ACTION: false },
              },
            },
          },
        },
        workingMemory: {},
        relevantMemories: [],
        recentHistory: [],
        activeTasks: [],
        upcomingEvents: [],
        systemContextString: '',
      },
    });

    expect(result.mode).toBe('CONFIRMATION');
    expect(result.pendingConfirmation).toBeDefined();
    expect(result.pendingConfirmation?.toolName).toBe('test_mail.send_email');
    expect(mockExecutor).not.toHaveBeenCalled();
  });

  it('bypasses confirmation and executes tool directly when actionType is pre-authorized', async () => {
    // 1. Tool call from Gemini
    vi.spyOn(agentPlanner as any, 'generateWithFallback')
      .mockResolvedValueOnce({
        functionCalls: [
          {
            name: 'test_mail_send_email',
            args: { to: 'colleague@example.com', body: 'Review required' },
          },
        ],
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'test_mail_send_email',
                    args: { to: 'colleague@example.com', body: 'Review required' },
                  },
                },
              ],
            },
          },
        ],
      })
      // 2. Synthesis response after tool execution
      .mockResolvedValueOnce({
        text: 'I have sent the email to colleague@example.com.',
        functionCalls: [],
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'I have sent the email to colleague@example.com.' }],
            },
          },
        ],
      });

    const result = await agentPlanner.planAndExecute({
      message: 'Send an email to colleague@example.com',
      toolContext: dummyContext,
      context: {
        userProfile: {
          id: dummyContext.userId,
          name: 'Sushant',
          preferences: {
            integrations: {
              test_mail: {
                autoApprove: { EXTERNAL_ACTION: true },
              },
            },
          },
        },
        workingMemory: {},
        relevantMemories: [],
        recentHistory: [],
        activeTasks: [],
        upcomingEvents: [],
        systemContextString: '',
      },
    });

    // Should NOT halt for confirmation
    expect(result.mode).not.toBe('CONFIRMATION');
    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'colleague@example.com', body: 'Review required' }),
      expect.anything()
    );
    expect(result.text).toContain('I have sent the email');
  });
});
