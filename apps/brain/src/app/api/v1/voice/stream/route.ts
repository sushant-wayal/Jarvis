import { IntermediateStatusUpdate, VoiceUploadSchema } from '@jarvis/shared';
import { NextRequest } from 'next/server';
import { generateRequestId } from '@/lib/api/response';
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
      return new Response(
        JSON.stringify({
          error: 'INVALID_VOICE_REQUEST',
          message: 'Validation failed for voice payload',
          details: parseResult.error.format(),
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const {
      audioBase64,
      mimeType,
      conversationId,
      userId,
      timezone,
      locale,
      phoneContext,
      speakIntermediateStatus,
    } = parseResult.data;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Stream may have closed
          }
        };

        try {
          // 1. Send START event
          sendEvent('START', { requestId, conversationId });

          // 2. Transcribe voice audio
          const audioBuffer = Buffer.from(audioBase64, 'base64');
          if (audioBuffer.length < 200) {
            sendEvent('FINAL_RESPONSE', {
              transcript: '',
              response: '',
              audioBase64: '',
              conversationId: conversationId || '',
              requestId,
              shouldSpeak: false,
              continuousListening: false,
            });
            sendEvent('DONE', {});
            controller.close();
            return;
          }

          const { transcript } = await sttProvider.transcribe(audioBuffer, mimeType);

          if (!transcript || transcript.trim().length === 0) {
            sendEvent('FINAL_RESPONSE', {
              transcript: '',
              response: '',
              audioBase64: '',
              conversationId: conversationId || '',
              requestId,
              shouldSpeak: false,
              continuousListening: false,
            });
            sendEvent('DONE', {});
            controller.close();
            return;
          }

          // Emit real-time TRANSCRIPT event so client sees transcription immediately
          sendEvent('TRANSCRIPT', { transcript, requestId });

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
            sendEvent('FINAL_RESPONSE', {
              transcript,
              response: 'Understood. Goodbye.',
              audioBase64: '',
              conversationId: conversationId || '',
              requestId,
              shouldSpeak: false,
              continuousListening: false,
            });
            sendEvent('DONE', {});
            controller.close();
            return;
          }

          // 3. Process message through orchestrator with onProgress callback
          const intermediateUpdates: IntermediateStatusUpdate[] = [];

          const brainResult = await brainOrchestrator.processMessage({
            message: transcript,
            conversationId,
            userId,
            timezone,
            locale,
            inputType: 'VOICE',
            speakResponse: true,
            speakIntermediateStatus: speakIntermediateStatus ?? true,
            requestId,
            phoneContext,
            onProgress: (update: IntermediateStatusUpdate) => {
              intermediateUpdates.push(update);
              sendEvent('STATUS', update);
            },
          });

          // 4. Synthesize final voice response
          const ttsResult = await ttsProvider.synthesize(brainResult.text);
          const durationMs = Date.now() - startTime;
          logger.info('Completed Streaming Voice API request', { requestId, durationMs, transcript });

          // 5. Send FINAL_RESPONSE event
          sendEvent('FINAL_RESPONSE', {
            transcript,
            response: brainResult.text,
            audioBase64: ttsResult.audioBase64,
            audioChunks: ttsResult.audioChunks,
            conversationId: brainResult.conversationId,
            requestId,
            shouldSpeak: true,
            pendingPhoneAction: brainResult.pendingPhoneAction,
            scheduledReminder: brainResult.scheduledReminder,
            intermediateUpdates,
          });

          sendEvent('DONE', {});
        } catch (err: unknown) {
          logger.error('Streaming Voice API Route Exception', err, { requestId });
          sendEvent('ERROR', {
            message: err instanceof Error ? err.message : 'Unable to process voice audio input',
            requestId,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: unknown) {
    logger.error('Voice Stream Handler Exception', err, { requestId });
    return new Response(
      JSON.stringify({
        error: 'VOICE_STREAM_FAILED',
        message: err instanceof Error ? err.message : 'Failed to initialize voice stream',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
