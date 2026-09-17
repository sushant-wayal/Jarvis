import { NextRequest } from 'next/server';
import { ConfirmActionSchema, ToolContext } from '@jarvis/shared';
import { errorResponse, handleApiError, successResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { toolRegistry } from '@/modules/tools/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const validated = ConfirmActionSchema.parse(body);
    const { actionId, confirmed } = validated;

    // 1. Locate the pending confirmation step
    const pendingStep = await prisma.agentStep.findFirst({
      where: {
        type: 'CONFIRMATION',
        status: 'PENDING',
        ...(actionId ? { input: { contains: actionId } } : {}),
      },
      include: { agentRun: true },
      orderBy: { startedAt: 'desc' },
    });

    if (!pendingStep || !pendingStep.input) {
      logger.warn('No pending confirmation found for action', { actionId, confirmed });
      return successResponse(
        {
          confirmed,
          message: confirmed
            ? 'No pending action found awaiting authorization.'
            : 'Action cancelled.',
        },
        requestId
      );
    }

    let confirmationData: { toolName?: string; payload?: Record<string, unknown> } = {};
    try {
      confirmationData = JSON.parse(pendingStep.input);
    } catch {
      confirmationData = {};
    }

    const toolName = confirmationData.toolName;
    const payload = confirmationData.payload || {};

    // 2. If user rejected or cancelled
    if (!confirmed) {
      await prisma.agentStep.update({
        where: { id: pendingStep.id },
        data: { status: 'SKIPPED', completedAt: new Date() },
      });
      await prisma.agentRun.update({
        where: { id: pendingStep.agentRunId },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });

      return successResponse(
        {
          confirmed: false,
          message: 'Action cancelled by user.',
        },
        requestId
      );
    }

    // 3. User confirmed: Execute the tool
    if (!toolName) {
      return errorResponse('INVALID_CONFIRMATION_PAYLOAD', 'Tool name missing from pending confirmation.', requestId, 400);
    }

    const tool = toolRegistry.getTool(toolName);
    if (!tool) {
      return errorResponse('TOOL_NOT_FOUND', `Tool "${toolName}" is not registered or available.`, requestId, 404);
    }

    const toolContext: ToolContext = {
      userId: pendingStep.agentRun.userId,
      userName: 'Sushant',
      conversationId: pendingStep.agentRun.conversationId,
      requestId,
      timezone: 'UTC',
      locale: 'en-US',
    };

    logger.info('Executing confirmed action from mobile UI confirmation modal', {
      actionId,
      toolName,
      agentRunId: pendingStep.agentRunId,
    });

    const result = await tool.execute(payload, toolContext);

    // 4. Update step and run status
    await prisma.agentStep.update({
      where: { id: pendingStep.id },
      data: {
        status: result.success ? 'COMPLETED' : 'FAILED',
        output: JSON.stringify(result.output || (result as any).data || (result as any).error),
        completedAt: new Date(),
      },
    });

    await prisma.agentRun.update({
      where: { id: pendingStep.agentRunId },
      data: {
        status: result.success ? 'COMPLETED' : 'FAILED',
        completedAt: new Date(),
      },
    });

    // 5. Append assistant message to preserve conversation thread
    if (pendingStep.agentRun.conversationId) {
      const summaryText = result.output && typeof result.output === 'object' && 'message' in (result.output as any)
        ? (result.output as any).message
        : `Successfully executed ${toolName}.`;

      await prisma.message.create({
        data: {
          conversationId: pendingStep.agentRun.conversationId,
          role: 'ASSISTANT',
          content: summaryText,
          inputType: 'TEXT',
          metadata: JSON.stringify({
            executedToolCalls: [{ id: actionId, name: toolName, input: payload }],
            executedToolResults: [result],
            agentRunId: pendingStep.agentRunId,
            mode: 'ACTION',
          }),
        },
      });
    }

    return successResponse(
      {
        confirmed: true,
        toolName,
        success: result.success,
        result: result.output,
        message:
          result.output && typeof result.output === 'object' && 'message' in (result.output as any)
            ? (result.output as any).message
            : `Successfully executed ${toolName}.`,
      },
      requestId
    );
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
