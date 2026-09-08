import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { diagnoseAndMaintainMediaProviders } from '@/modules/media/music-resolver';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();

  // Validate CRON_SECRET if configured on Vercel
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      logger.warn('Unauthorized cron media-maintenance attempt', { requestId });
      return errorResponse('UNAUTHORIZED', 'Invalid or missing cron authorization secret', requestId, 401);
    }
  }

  try {
    const report = await diagnoseAndMaintainMediaProviders();

    if (report.overallStatus === 'down') {
      logger.error('Media maintenance diagnostics reported all providers DOWN', { report, requestId });
      return errorResponse('MEDIA_PROVIDERS_DOWN', 'All media streaming providers failed diagnostics', requestId, 500, report);
    }

    logger.info('Media maintenance cron completed successfully', {
      status: report.overallStatus,
      tier1Status: report.tier1.status,
      tier2Status: report.tier2.status,
      requestId,
    });

    return successResponse(report, requestId);
  } catch (err: any) {
    logger.error('Unhandled error in media maintenance cron', err, { requestId });
    return errorResponse('INTERNAL_ERROR', 'Unexpected cron execution error', requestId, 500, err?.message || String(err));
  }
}
