import { CreateConversationSchema } from '@jarvis/shared';
import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'default-user';

  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const summaries = conversations.map((c) => ({
      id: c.id,
      userId: c.userId,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      lastMessage: c.messages[0]?.content || '',
    }));

    return successResponse(summaries, requestId);
  } catch (err) {
    return errorResponse('DATABASE_ERROR', 'Failed to retrieve conversations', requestId, 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    const body = await req.json().catch(() => ({}));
    const parseResult = CreateConversationSchema.safeParse(body);

    const { title, userId } = parseResult.success
      ? parseResult.data
      : { title: 'New Conversation', userId: 'default-user' };

    const conversation = await prisma.conversation.create({
      data: {
        userId,
        title,
      },
    });

    return successResponse(
      {
        id: conversation.id,
        userId: conversation.userId,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
      requestId,
      201
    );
  } catch (err) {
    return errorResponse('DATABASE_ERROR', 'Failed to create conversation', requestId, 500, String(err));
  }
}
