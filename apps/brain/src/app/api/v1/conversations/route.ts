import { CreateConversationSchema } from '@jarvis/shared';
import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';
import { ttlEngine } from '@/modules/brain/ttl-engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'default-user';

  try {
    const now = new Date();
    const conversations = await prisma.conversation.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const summaries = conversations.map((c: Record<string, unknown> & { createdAt: Date; updatedAt: Date; expiresAt: Date | null; messages: Array<{ content: string }> }) => ({
      id: c.id,
      userId: c.userId,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      expiresAt: c.expiresAt ? c.expiresAt.toISOString() : undefined,
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

    const { title, userId, ttlDays, expiresAt } = parseResult.success
      ? parseResult.data
      : { title: 'New Conversation', userId: 'default-user', ttlDays: undefined, expiresAt: undefined };

    let finalExpiresAt: Date;
    if (expiresAt) {
      finalExpiresAt = new Date(expiresAt);
    } else if (ttlDays !== undefined && ttlDays > 0) {
      finalExpiresAt = ttlEngine.calculateExpiryDate(ttlDays);
    } else {
      const suggestedDays = await ttlEngine.suggestConversationTtl(title || 'New Conversation');
      finalExpiresAt = ttlEngine.calculateExpiryDate(suggestedDays);
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId,
        title,
        expiresAt: finalExpiresAt,
      },
    });

    return successResponse(
      {
        id: conversation.id,
        userId: conversation.userId,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        expiresAt: conversation.expiresAt?.toISOString(),
      },
      requestId,
      201
    );
  } catch (err) {
    return errorResponse('DATABASE_ERROR', 'Failed to create conversation', requestId, 500, String(err));
  }
}
