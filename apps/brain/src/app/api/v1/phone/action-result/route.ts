/**
 * POST /api/v1/phone/action-result
 * Receives the result of a phone action executed by the mobile app.
 * Logged for observability — used for conversational recovery in future turns.
 */

import { z } from 'zod';
import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const ActionResultReportSchema = z.object({
  conversationId: z.string(),
  action: z.object({
    type: z.string(),
  }).passthrough(),
  result: z.object({
    success: z.boolean(),
    fallbackUsed: z.boolean().optional(),
    fallbackReason: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
    requiresApkBuild: z.boolean().optional(),
    ambiguousCandidates: z.array(z.string()).optional(),
  }),
});

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    const body = await req.json();
    const parsed = ActionResultReportSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse('INVALID_REQUEST', 'Invalid action result payload', requestId, 400);
    }

    const { conversationId, action, result } = parsed.data;

    // Log for observability — metadata only, no message content
    logger.info('Phone action result received', {
      requestId,
      conversationId,
      actionType: action.type,
      success: result.success,
      fallbackUsed: result.fallbackUsed,
      fallbackReason: result.fallbackReason,
      requiresApkBuild: result.requiresApkBuild,
      ambiguousCount: result.ambiguousCandidates?.length,
    });

    return successResponse({ received: true }, requestId);
  } catch (err) {
    logger.error('Phone action-result endpoint error', err, { requestId });
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to process action result', requestId, 500);
  }
}
