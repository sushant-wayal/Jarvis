import { VoiceUploadSchema } from '@jarvis/shared';
import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { brainOrchestrator } from '@/modules/brain/orchestrator';
import { sttProvider } from '@/modules/voice/stt-provider';
import { ttsProvider } from '@/modules/voice/tts-provider';

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const body = await req.json();
    const parseResult = VoiceUploadSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('INVALID_VOICE_REQUEST', 'Validation failed for voice payload', requestId, 400, parseResult.error.format());
    }

    const { audioBase64, mimeType, conversationId, userId, timezone, locale } = parseResult.data;
    logger.info('Processing Voice API request', { requestId, userId });

    // 1. Transcribe voice audio
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const { transcript } = await sttProvider.transcribe(audioBuffer, mimeType);

    if (!transcript) {
      return successResponse(
        {
          transcript: '',
          response: "I didn't catch that. Could you say that again?",
          conversationId: conversationId || '',
          requestId,
          shouldSpeak: true,
        },
        requestId
      );
    }

    // 2. Process transcript through Brain Orchestrator & tools
    const brainResult = await brainOrchestrator.processMessage({
      message: transcript,
      conversationId,
      userId,
      timezone,
      locale,
      inputType: 'VOICE',
      speakResponse: true,
      requestId,
    });

    // 3. Synthesize audio response for earbud playback
    const ttsResult = await ttsProvider.synthesize(brainResult.text);

    const durationMs = Date.now() - startTime;
    logger.info('Completed Voice API request', { requestId, durationMs, transcript });

    return successResponse(
      {
        transcript,
        response: brainResult.text,
        audioBase64: ttsResult.audioBase64,
        conversationId: brainResult.conversationId,
        requestId,
        shouldSpeak: true,
      },
      requestId
    );
  } catch (err) {
    logger.error('Voice API Route Exception', err, { requestId });
    return errorResponse('VOICE_PROCESSING_FAILED', 'Unable to process voice audio input', requestId, 500);
  }
}
