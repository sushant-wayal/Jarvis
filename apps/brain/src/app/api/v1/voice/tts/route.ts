import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { ttsProvider } from '@/modules/voice/tts-provider';

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return errorResponse('INVALID_TEXT', 'Text parameter is required for TTS', requestId, 400);
    }

    logger.info('Synthesizing on-demand TTS speech', { requestId, textLength: text.length });
    const ttsResult = await ttsProvider.synthesize(text);

    return successResponse(
      {
        audioBase64: ttsResult.audioBase64,
        mimeType: ttsResult.mimeType,
      },
      requestId
    );
  } catch (err) {
    logger.error('TTS API Route Exception', err, { requestId });
    return errorResponse('TTS_FAILED', 'Failed to synthesize speech', requestId, 500);
  }
}
