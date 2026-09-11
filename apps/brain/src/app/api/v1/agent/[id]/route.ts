import { NextRequest } from 'next/server';
import { errorResponse, handleApiError, successResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const run = await prisma.agentRun.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' },
        },
      },
    });

    if (!run) {
      return errorResponse('NOT_FOUND', 'Agent run not found', requestId, 404);
    }

    let finalResult: string | null = null;
    if (run.status === 'COMPLETED' || run.status === 'FAILED') {
      const assistantMessage = await prisma.message.findFirst({
        where: {
          conversationId: run.conversationId,
          role: 'ASSISTANT',
          metadata: { contains: run.id },
        },
        orderBy: { createdAt: 'desc' },
      });
      finalResult = assistantMessage?.content || null;
    }

    return successResponse(
      {
        id: run.id,
        userId: run.userId,
        conversationId: run.conversationId,
        status: run.status,
        goal: run.goal,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString(),
        error: run.error,
        result: finalResult,
        steps: run.steps.map((s) => ({
          id: s.id,
          stepNumber: s.stepNumber,
          type: s.type,
          status: s.status,
          summary: s.summary,
          startedAt: s.startedAt.toISOString(),
          completedAt: s.completedAt?.toISOString(),
        })),
      },
      requestId
    );
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
