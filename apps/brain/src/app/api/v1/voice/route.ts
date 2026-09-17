import { VoiceUploadSchema } from '@jarvis/shared';
import { NextRequest } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { brainOrchestrator } from '@/modules/brain/orchestrator';
import { sttProvider } from '@/modules/voice/stt-provider';
import { ttsProvider } from '@/modules/voice/tts-provider';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const body = await req.json();
    const parseResult = VoiceUploadSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('INVALID_VOICE_REQUEST', 'Validation failed for voice payload', requestId, 400, parseResult.error.format());
    }

    const { audioBase64, mimeType, conversationId, userId, timezone, locale, phoneContext } = parseResult.data;
    logger.info('Processing Voice API request', { requestId, userId });

    // 1. Transcribe voice audio
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    if (audioBuffer.length < 200) {
      logger.info('Voice STT payload too short to contain audio frames; terminating turn cleanly', {
        bytes: audioBuffer.length,
      });
      return successResponse(
        {
          transcript: '',
          response: '',
          audioBase64: '',
          conversationId: conversationId || '',
          requestId,
          shouldSpeak: false,
          continuousListening: false,
        },
        requestId
      );
    }
    const { transcript } = await sttProvider.transcribe(audioBuffer, mimeType);

    if (!transcript || transcript.trim().length === 0) {
      logger.info('Voice STT returned empty/silence transcript; terminating turn cleanly without re-prompting');
      return successResponse(
        {
          transcript: '',
          response: '',
          audioBase64: '',
          conversationId: conversationId || '',
          requestId,
          shouldSpeak: false,
          continuousListening: false,
        },
        requestId
      );
    }

    const cleanLower = transcript.toLowerCase().replace(/[.,!?;:"']/g, '').trim();
    const closurePhrases = [
      'stop',
      'stop listening',
      'bye',
      'goodbye',
      'cancel',
      'never mind',
      'nevermind',
      'that is all',
      'thats all',
      'that is it',
      'thats it',
      'nothing',
      'nothing else',
      'done',
      'i am done',
      'im done',
      'no thanks',
      'no thank you',
      'i am good',
      'im good',
    ];

    const hasPendingConfirmation = conversationId
      ? await prisma.agentRun.findFirst({
          where: { conversationId, status: 'WAITING_FOR_USER' },
        })
      : null;

    if (!hasPendingConfirmation && closurePhrases.includes(cleanLower)) {
      logger.info('User requested conversation closure', { transcript });
      return successResponse(
        {
          transcript,
          response: 'Understood. Goodbye.',
          audioBase64: '',
          conversationId: conversationId || '',
          requestId,
          shouldSpeak: false,
          continuousListening: false,
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
      phoneContext,
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
        pendingPhoneAction: brainResult.pendingPhoneAction,
        scheduledReminder: brainResult.scheduledReminder,
      },
      requestId
    );
  } catch (err) {
    logger.error('Voice API Route Exception', err, { requestId });
    return errorResponse('VOICE_PROCESSING_FAILED', 'Unable to process voice audio input', requestId, 500);
  }
}
