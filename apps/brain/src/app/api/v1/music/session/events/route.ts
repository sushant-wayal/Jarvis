import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { musicSessionManager } from '@/modules/music/music-session-manager';
import { PlaybackEventInputSchema } from '@/modules/music/music-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const BatchPlaybackEventsSchema = z.object({
  events: z.array(PlaybackEventInputSchema),
});

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    const body = await req.json();

    // Accept either a single event or a batch of events
    const singleParse = PlaybackEventInputSchema.safeParse(body);
    let eventsToProcess: Array<z.infer<typeof PlaybackEventInputSchema>> = [];

    if (singleParse.success) {
      eventsToProcess = [singleParse.data];
    } else {
      const batchParse = BatchPlaybackEventsSchema.safeParse(body);
      if (batchParse.success) {
        eventsToProcess = batchParse.data.events;
      } else {
        return errorResponse(
          'INVALID_REQUEST',
          'Invalid playback event format',
          requestId,
          400,
          singleParse.error.format()
        );
      }
    }

    for (const event of eventsToProcess) {
      await musicSessionManager.handlePlaybackEvent({
        ...event,
        timestamp: event.timestamp || Date.now(),
      });
    }

    logger.info('Processed music playback events', {
      requestId,
      count: eventsToProcess.length,
    });

    return successResponse({ processedCount: eventsToProcess.length }, requestId);
  } catch (err) {
    logger.error('Music events endpoint failed', { requestId, err });
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      'Failed to process playback events',
      requestId,
      500
    );
  }
}
