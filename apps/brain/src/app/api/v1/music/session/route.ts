import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { musicSessionManager } from '@/modules/music/music-session-manager';
import { CreateMusicSessionInputSchema } from '@/modules/music/music-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    const body = await req.json();
    const parseResult = CreateMusicSessionInputSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse(
        'INVALID_REQUEST',
        'Invalid music session parameters',
        requestId,
        400,
        parseResult.error.format()
      );
    }

    const input = parseResult.data;
    const userId = input.userId || 'default-user';

    logger.info('Creating or updating music session via API', { requestId, userId, query: input.query });

    const session = await musicSessionManager.createSession({
      userId,
      query: input.query,
      mode: input.mode,
      intent: input.intent,
      seedTrack: input.seedTrack,
    });

    return successResponse(session, requestId);
  } catch (err) {
    logger.error('Music session creation endpoint failed', { requestId, err });
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      'Failed to create music session',
      requestId,
      500
    );
  }
}

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  const userId = searchParams.get('userId') || 'default-user';

  try {
    const session = sessionId
      ? musicSessionManager.getSession(sessionId)
      : musicSessionManager.getActiveSessionForUser(userId);

    if (!session) {
      return errorResponse('NOT_FOUND', 'Music session not found', requestId, 404);
    }

    return successResponse(session, requestId);
  } catch (err) {
    logger.error('Music session fetch endpoint failed', { requestId, err });
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      'Failed to fetch music session',
      requestId,
      500
    );
  }
}
