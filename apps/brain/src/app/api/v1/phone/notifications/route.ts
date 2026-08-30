/**
 * POST /api/v1/phone/notifications
 * Ingests a batch of normalized notification events from a device.
 */

import { z } from 'zod';
import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { PhoneNotificationEventSchema } from '@jarvis/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const IngestNotificationsSchema = z.object({
  userId: z.string().optional().default('default-user'),
  notifications: z.array(PhoneNotificationEventSchema).min(1).max(50),
});

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    const body = await req.json();
    const parsed = IngestNotificationsSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse('INVALID_REQUEST', 'Validation failed for notification batch', requestId, 400, parsed.error.format());
    }

    const { userId, notifications } = parsed.data;

    logger.info('Received phone notifications batch', {
      requestId,
      userId,
      count: notifications.length,
      apps: Array.from(new Set(notifications.map((n) => n.app))),
    });

    return successResponse({ ingestedCount: notifications.length }, requestId);
  } catch (err) {
    logger.error('Failed to ingest phone notifications', err, { requestId });
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to ingest notifications', requestId, 500);
  }
}
