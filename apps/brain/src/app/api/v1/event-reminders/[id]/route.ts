import { NextRequest, NextResponse } from 'next/server';
import { UpdateEventReminderSchema } from '@jarvis/shared';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/api/response';
import { eventService } from '@/modules/events/event-service';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const userId = body.userId || 'default-user';
    const validated = UpdateEventReminderSchema.parse(body);

    const updated = await eventService.updateEventReminder(id, userId, validated);
    if (!updated) {
      return NextResponse.json(createErrorResponse('NOT_FOUND', 'Event reminder not found', requestId), { status: 404 });
    }

    return NextResponse.json(createSuccessResponse(updated, requestId));
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default-user';

    const deleted = await eventService.deleteEventReminder(id, userId);
    if (!deleted) {
      return NextResponse.json(createErrorResponse('NOT_FOUND', 'Event reminder not found', requestId), { status: 404 });
    }

    return NextResponse.json(createSuccessResponse({ deleted: true }, requestId));
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
