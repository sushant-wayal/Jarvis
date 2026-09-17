import { NextRequest } from 'next/server';
import { ChatRequestSchema } from '@jarvis/shared';
import { brainOrchestrator } from '@/modules/brain/orchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;

  try {
    const body = await req.json();
    const validated = ChatRequestSchema.parse(body);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // 1. Send START event
        controller.enqueue(
          encoder.encode(`event: START\ndata: ${JSON.stringify({ requestId, conversationId: validated.conversationId })}\n\n`)
        );

        // 2. Process through Brain Orchestrator with real-time progress
        try {
          const intermediateUpdates: unknown[] = [];

          const response = await brainOrchestrator.processMessage({
            message: validated.message,
            conversationId: validated.conversationId,
            userId: validated.userId,
            timezone: validated.timezone,
            locale: validated.locale,
            speakResponse: validated.speakResponse,
            speakIntermediateStatus: validated.speakIntermediateStatus ?? true,
            requestId,
            deviceId: validated.deviceId,
            phoneContext: validated.phoneContext,
            onProgress: (update) => {
              intermediateUpdates.push(update);
              try {
                controller.enqueue(
                  encoder.encode(`event: STATUS\ndata: ${JSON.stringify(update)}\n\n`)
                );
              } catch {
                // stream may have closed
              }
            },
          });

          // 3. Send tool events if any
          for (const tc of response.toolCalls) {
            controller.enqueue(
              encoder.encode(`event: TOOL_STARTED\ndata: ${JSON.stringify({ name: tc.name })}\n\n`)
            );
          }

          // 4. Stream text response
          controller.enqueue(
            encoder.encode(`event: TEXT_DELTA\ndata: ${JSON.stringify({ text: response.text })}\n\n`)
          );

          // 5. Send COMPLETED event
          controller.enqueue(
            encoder.encode(`event: COMPLETED\ndata: ${JSON.stringify({ ...response, intermediateUpdates })}\n\n`)
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `event: ERROR\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`
            )
          );
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
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
