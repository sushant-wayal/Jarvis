import { NextRequest, NextResponse } from 'next/server';
import { CreateEventReminderSchema } from '@jarvis/shared';
import { createSuccessResponse, handleApiError } from '@/lib/api/response';
import { eventService } from '@/modules/events/event-service';

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default-user';
    const status = searchParams.get('status') || undefined;

    const reminders = await eventService.listEventReminders(userId, status);
    return NextResponse.json(createSuccessResponse(reminders, requestId));
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const validated = CreateEventReminderSchema.parse(body);

    const reminder = await eventService.createEventReminder(validated);
    return NextResponse.json(createSuccessResponse(reminder, requestId), { status: 201 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
