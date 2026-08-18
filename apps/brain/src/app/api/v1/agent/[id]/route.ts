import { NextRequest, NextResponse } from 'next/server';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';

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
      return NextResponse.json(createErrorResponse('NOT_FOUND', 'Agent run not found', requestId), { status: 404 });
    }

    return NextResponse.json(
      createSuccessResponse(
        {
          id: run.id,
          userId: run.userId,
          conversationId: run.conversationId,
          status: run.status,
          goal: run.goal,
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt?.toISOString(),
          error: run.error,
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
      )
    );
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
