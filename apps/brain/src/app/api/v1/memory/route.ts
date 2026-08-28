import { CreateMemorySchema } from '@jarvis/shared';
import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { memoryService } from '@/modules/memory/memory-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'default-user';
  const query = searchParams.get('query') || undefined;

  try {
    const memories = await memoryService.getRelevantMemories(userId, query, 50);
    return successResponse(memories, requestId);
  } catch (err) {
    return errorResponse('DATABASE_ERROR', 'Failed to retrieve memories', requestId, 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    const body = await req.json();
    const parseResult = CreateMemorySchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('INVALID_MEMORY', 'Validation failed for memory creation', requestId, 400, parseResult.error.format());
    }

    const { userId, type, content, importance, ttlDays, expiresAt } = parseResult.data;
    const memory = await memoryService.saveMemory(
      userId,
      type,
      content,
      importance,
      ttlDays,
      expiresAt ? new Date(expiresAt) : undefined
    );

    return successResponse(memory, requestId, 201);
  } catch (err) {
    return errorResponse('DATABASE_ERROR', 'Failed to create memory', requestId, 500, String(err));
  }
}

export async function DELETE(req: NextRequest) {
  const requestId = generateRequestId();
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'default-user';
  const memoryId = searchParams.get('id');

  try {
    if (memoryId) {
      const deleted = await memoryService.deleteMemory(userId, memoryId);
      return successResponse({ deleted, memoryId }, requestId);
    }

    const count = await memoryService.clearAllMemories(userId);
    return successResponse({ deletedCount: count }, requestId);
  } catch (err) {
    return errorResponse('DATABASE_ERROR', 'Failed to delete memories', requestId, 500, String(err));
  }
}
