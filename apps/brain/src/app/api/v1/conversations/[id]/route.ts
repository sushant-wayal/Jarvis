import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId();
  const { id } = await params;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation || (conversation.expiresAt && conversation.expiresAt <= new Date())) {
      return errorResponse('NOT_FOUND', 'Conversation not found or expired', requestId, 404);
    }

    return successResponse(
      {
        id: conversation.id,
        userId: conversation.userId,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        expiresAt: conversation.expiresAt ? conversation.expiresAt.toISOString() : undefined,
        messages: conversation.messages.map((m: { id: string; conversationId: string; role: string; content: string; inputType: string; createdAt: Date; metadata: string | null }) => ({
          id: m.id,
          conversationId: m.conversationId,
          role: m.role,
          content: m.content,
          inputType: m.inputType,
          createdAt: m.createdAt.toISOString(),
          metadata: m.metadata ? JSON.parse(m.metadata) : undefined,
        })),
      },
      requestId
    );
  } catch (err) {
    return errorResponse('DATABASE_ERROR', 'Failed to retrieve conversation messages', requestId, 500, String(err));
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId();
  const { id } = await params;

  try {
    await prisma.conversation.delete({
      where: { id },
    });

    return successResponse({ deleted: true, id }, requestId);
  } catch (err) {
    return errorResponse('DATABASE_ERROR', 'Failed to delete conversation', requestId, 500, String(err));
  }
}
