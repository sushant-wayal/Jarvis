import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { musicSessionManager } from '@/modules/music/music-session-manager';
import { queueManager } from '@/modules/music/queue-manager';
import { ReplenishQueueInputSchema } from '@/modules/music/music-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    const body = await req.json();
    const parseResult = ReplenishQueueInputSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse(
        'INVALID_REQUEST',
        'Invalid replenish request parameters',
        requestId,
        400,
        parseResult.error.format()
      );
    }

    const { sessionId, count } = parseResult.data;
    const session = musicSessionManager.getSession(sessionId);

    if (!session) {
      return errorResponse('NOT_FOUND', 'Active music session not found', requestId, 404);
    }

    logger.info('Replenishing queue for session via API', { sessionId, count });

    const queue = await queueManager.replenishQueue(session, count || 5);

    return successResponse(
      {
        sessionId,
        queue,
        totalQueueLength: queue.length,
      },
      requestId
    );
  } catch (err) {
    logger.error('Music replenish endpoint failed', { requestId, err });
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      'Failed to replenish music queue',
      requestId,
      500
    );
  }
}
