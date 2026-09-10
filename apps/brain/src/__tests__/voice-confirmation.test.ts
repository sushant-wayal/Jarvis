import { ToolContext } from '@jarvis/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agentPlanner } from '../modules/brain/agent-planner';
import { prisma } from '../lib/db/prisma';
import { toolRegistry } from '../modules/tools/registry';
import { BaseIntegrationTool } from '../modules/integrations/integration-tool';
import { z } from 'zod';

describe('Voice & Hands-Free Earbud Confirmation Lifecycle', () => {
  const dummyContext: ToolContext = {
    userId: 'user-confirm-test',
    conversationId: 'conv-confirm-test',
    requestId: 'req-confirm-1',
    timezone: 'UTC',
    locale: 'en-US',
  };

  // Mock a high risk tool
  const mockActionExecutor = vi.fn().mockResolvedValue({
    success: true,
    data: { merged: true },
    message: 'Pull request #42 merged successfully.',
  });

  class MockDangerousTool extends BaseIntegrationTool<
    { pullNumber: number },
    { merged: boolean }
  > {
    constructor() {
      super({
        id: 'test_service.merge_pull_request',
        name: 'test_service.merge_pull_request',
        description: 'Dangerous action requiring confirmation',
        integrationId: 'test_service',
        category: 'PRODUCTIVITY',
        actionType: 'WRITE',
        riskLevel: 'HIGH_RISK',
        requiresConfirmation: true,
        inputSchema: z.object({
          pullNumber: z.number(),
        }),
        executor: async (input, ctx) => {
          return mockActionExecutor(input, ctx);
        },
      });
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    toolRegistry.register(new MockDangerousTool() as any);

    // Setup test user & conversation in DB
    await prisma.user.upsert({
      where: { id: dummyContext.userId },
      create: { id: dummyContext.userId, name: 'Sushant' },
      update: {},
    });

    await prisma.conversation.upsert({
      where: { id: dummyContext.conversationId },
      create: {
        id: dummyContext.conversationId,
        userId: dummyContext.userId,
        title: 'Voice Confirmation Test',
      },
      update: {},
    });

    // Clean up any lingering agent runs/steps/messages for test isolation
    await prisma.agentStep.deleteMany({
      where: { agentRun: { conversationId: dummyContext.conversationId } },
    });
    await prisma.agentRun.deleteMany({
      where: { conversationId: dummyContext.conversationId },
    });
    await prisma.message.deleteMany({
      where: { conversationId: dummyContext.conversationId },
    });
  });

  it('Turn 1: pauses on dangerous action and creates pending confirmation', async () => {
    // Mock Gemini LLM calling the dangerous tool
    vi.spyOn(agentPlanner as any, 'generateWithFallback').mockResolvedValueOnce({
      functionCalls: [
        {
          name: 'test_service_merge_pull_request',
          args: { pullNumber: 42 },
        },
      ],
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'test_service_merge_pull_request', args: { pullNumber: 42 } } }],
          },
        },
      ],
    });

    const res = await agentPlanner.planAndExecute({
      message: 'Merge PR 42',
      context: {
        userProfile: { id: dummyContext.userId, name: 'Sushant', preferences: {} },
        workingMemory: {},
        relevantMemories: [],
        recentHistory: [],
        activeTasks: [],
        upcomingEvents: [],
        systemContextString: '',
      },
      toolContext: { ...dummyContext },
    });

    expect(res.mode).toBe('CONFIRMATION');
    expect(res.text).toContain('test_service.merge_pull_request');
    expect(res.pendingConfirmation).toBeDefined();
    expect(res.pendingConfirmation?.toolName).toBe('test_service.merge_pull_request');
    expect(mockActionExecutor).not.toHaveBeenCalled();

    // Verify DB recorded WAITING_FOR_USER
    const agentRun = await prisma.agentRun.findUnique({
      where: { id: res.agentRunId },
      include: { steps: true },
    });
    expect(agentRun?.status).toBe('WAITING_FOR_USER');
    const confirmStep = agentRun?.steps.find((s) => s.type === 'CONFIRMATION');
    expect(confirmStep?.status).toBe('PENDING');
  });

  it('Turn 2 (Affirmation): executes confirmed tool when user says "yes go ahead"', async () => {
    // Mock Turn 2 Gemini calling the confirmed tool upon user saying "yes go ahead"
    vi.spyOn(agentPlanner as any, 'generateWithFallback')
      .mockResolvedValueOnce({
        functionCalls: [
          {
            name: 'test_service_merge_pull_request',
            args: { pullNumber: 42 },
          },
        ],
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ functionCall: { name: 'test_service_merge_pull_request', args: { pullNumber: 42 } } }],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'PR #42 has been successfully merged into main.',
        functionCalls: [],
      });

    const res = await agentPlanner.planAndExecute({
      message: 'Yes, go ahead',
      context: {
        userProfile: { id: dummyContext.userId, name: 'Sushant', preferences: {} },
        workingMemory: {},
        relevantMemories: [],
        recentHistory: [
          {
            id: 'm1',
            conversationId: dummyContext.conversationId,
            role: 'USER',
            content: 'Merge PR 42',
            inputType: 'TEXT',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'm2',
            conversationId: dummyContext.conversationId,
            role: 'ASSISTANT',
            content: 'I prepared this action: test_service.merge_pull_request. Would you like me to proceed?',
            inputType: 'TEXT',
            createdAt: new Date().toISOString(),
            metadata: {
              mode: 'CONFIRMATION',
              pendingConfirmation: {
                actionId: 'call_123',
                toolName: 'test_service.merge_pull_request',
                riskLevel: 'HIGH_RISK',
                summary: 'Execute test_service.merge_pull_request with {"pullNumber":42}',
                payload: { pullNumber: 42 },
              },
            },
          },
        ],
        activeTasks: [],
        upcomingEvents: [],
        systemContextString: '',
      },
      toolContext: { ...dummyContext },
    });

    // Should NOT pause for confirmation again!
    expect(res.mode).toBe('ACTION');
    expect(mockActionExecutor).toHaveBeenCalledTimes(1);
    expect(mockActionExecutor).toHaveBeenCalledWith(
      expect.objectContaining({ pullNumber: 42 }),
      expect.anything()
    );
    expect(res.text).toContain('merged');
  });

  it('Turn 2 (Cancellation): does not execute and cancels pending confirmation when user says "cancel"', async () => {
    // Mock Gemini acknowledging cancellation without calling tools
    vi.spyOn(agentPlanner as any, 'generateWithFallback').mockResolvedValueOnce({
      text: 'Action cancelled. I did not merge the pull request.',
      functionCalls: [],
    });

    const res = await agentPlanner.planAndExecute({
      message: 'No, cancel that',
      context: {
        userProfile: { id: dummyContext.userId, name: 'Sushant', preferences: {} },
        workingMemory: {},
        relevantMemories: [],
        recentHistory: [
          {
            id: 'm1',
            conversationId: dummyContext.conversationId,
            role: 'USER',
            content: 'Merge PR 42',
            inputType: 'TEXT',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'm2',
            conversationId: dummyContext.conversationId,
            role: 'ASSISTANT',
            content: 'I prepared this action: test_service.merge_pull_request. Would you like me to proceed?',
            inputType: 'TEXT',
            createdAt: new Date().toISOString(),
            metadata: {
              mode: 'CONFIRMATION',
              pendingConfirmation: {
                actionId: 'call_123',
                toolName: 'test_service.merge_pull_request',
                riskLevel: 'HIGH_RISK',
                summary: 'Execute test_service.merge_pull_request with {"pullNumber":42}',
                payload: { pullNumber: 42 },
              },
            },
          },
        ],
        activeTasks: [],
        upcomingEvents: [],
        systemContextString: '',
      },
      toolContext: { ...dummyContext },
    });

    expect(res.mode).toBe('ANSWER');
    expect(mockActionExecutor).not.toHaveBeenCalled();
    expect(res.text).toContain('cancelled');
  });

  it('Mobile Modal Route: executes action when confirmed: true is sent to /api/v1/agent/run', async () => {
    const { POST } = await import('../app/api/v1/agent/run/route');
    const { NextRequest } = await import('next/server');

    // Create an AgentRun & AgentStep waiting for confirmation
    const run = await prisma.agentRun.create({
      data: {
        userId: dummyContext.userId,
        conversationId: dummyContext.conversationId,
        status: 'WAITING_FOR_USER',
        goal: 'Merge PR 42',
      },
    });

    await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        stepNumber: 1,
        type: 'CONFIRMATION',
        status: 'PENDING',
        input: JSON.stringify({
          actionId: 'call_modal_123',
          toolName: 'test_service.merge_pull_request',
          payload: { pullNumber: 42 },
        }),
        summary: 'Awaiting confirmation for PR merge',
      },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/agent/run', {
      method: 'POST',
      body: JSON.stringify({
        actionId: 'call_modal_123',
        confirmed: true,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.confirmed).toBe(true);
    expect(mockActionExecutor).toHaveBeenCalledTimes(1);

    // Verify DB updated
    const updatedRun = await prisma.agentRun.findUnique({ where: { id: run.id } });
    expect(updatedRun?.status).toBe('COMPLETED');
  });

  it('Mobile Modal Route: cancels action when confirmed: false is sent to /api/v1/agent/run', async () => {
    const { POST } = await import('../app/api/v1/agent/run/route');
    const { NextRequest } = await import('next/server');

    const run = await prisma.agentRun.create({
      data: {
        userId: dummyContext.userId,
        conversationId: dummyContext.conversationId,
        status: 'WAITING_FOR_USER',
        goal: 'Merge PR 42',
      },
    });

    await prisma.agentStep.create({
      data: {
        agentRunId: run.id,
        stepNumber: 1,
        type: 'CONFIRMATION',
        status: 'PENDING',
        input: JSON.stringify({
          actionId: 'call_modal_cancel_456',
          toolName: 'test_service.merge_pull_request',
          payload: { pullNumber: 42 },
        }),
        summary: 'Awaiting confirmation for PR merge',
      },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/agent/run', {
      method: 'POST',
      body: JSON.stringify({
        actionId: 'call_modal_cancel_456',
        confirmed: false,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.confirmed).toBe(false);
    expect(mockActionExecutor).not.toHaveBeenCalled();

    const updatedRun = await prisma.agentRun.findUnique({ where: { id: run.id } });
    expect(updatedRun?.status).toBe('CANCELLED');
  });
});
