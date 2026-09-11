import { ChatRequestSchema } from '@jarvis/shared';
import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { brainOrchestrator } from '@/modules/brain/orchestrator';
import { ttsProvider } from '@/modules/voice/tts-provider';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const body = await req.json();
    const parseResult = ChatRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse(
        'INVALID_REQUEST',
        'Validation failed for input arguments',
        requestId,
        400,
        parseResult.error.format()
      );
    }

    const input = parseResult.data;
    logger.info('Processing Chat API request', { requestId, userId: input.userId });

    const brainResult = await brainOrchestrator.processMessage({
      message: input.message,
      conversationId: input.conversationId,
      userId: input.userId,
      timezone: input.timezone,
      locale: input.locale,
      inputType: 'TEXT',
      speakResponse: input.speakResponse,
      requestId,
      asyncMode: input.asyncMode,
      phoneContext: input.phoneContext,
    });

    let audioBase64: string | undefined;
    if (input.speakResponse) {
      const ttsRes = await ttsProvider.synthesize(brainResult.text);
      audioBase64 = ttsRes.audioBase64;
    }

    const durationMs = Date.now() - startTime;
    logger.info('Completed Chat API request', { requestId, durationMs });

    return successResponse(
      {
        ...brainResult,
        audioBase64,
      },
      requestId
    );
  } catch (err) {
    logger.error('Chat API Route Exception', err, { requestId });
    return errorResponse('INTERNAL_SERVER_ERROR', 'An error occurred while processing your request', requestId, 500);
  }
}
