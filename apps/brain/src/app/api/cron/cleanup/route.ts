import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { dataRetentionService } from '@/modules/brain/data-retention-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();

  // Validate CRON_SECRET if configured on Vercel
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      logger.warn('Unauthorized cron cleanup attempt', { requestId });
      return errorResponse('UNAUTHORIZED', 'Invalid or missing cron authorization secret', requestId, 401);
    }
  }

  try {
    const result = await dataRetentionService.cleanupAllExpired();
    if (!result.success) {
      return errorResponse('CLEANUP_FAILED', 'Failed to complete data retention cleanup', requestId, 500);
    }

    return successResponse(result, requestId);
  } catch (err) {
    logger.error('Unhandled error in cron cleanup handler', err, { requestId });
    return errorResponse('INTERNAL_ERROR', 'Unexpected cron execution error', requestId, 500, String(err));
  }
}
