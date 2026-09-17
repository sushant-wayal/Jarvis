import { NextRequest } from 'next/server';
import { CreateUserEventSchema } from '@jarvis/shared';
import { handleApiError, successResponse } from '@/lib/api/response';
import { eventService } from '@/modules/events/event-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default-user';
    const status = searchParams.get('status') || undefined;

    const events = await eventService.listEvents(userId, status);
    return successResponse(events, requestId);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const validated = CreateUserEventSchema.parse(body);

    const event = await eventService.createEvent(validated);
    return successResponse(event, requestId, 201);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

