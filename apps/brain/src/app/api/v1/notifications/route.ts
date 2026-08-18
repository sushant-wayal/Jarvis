import { NextRequest, NextResponse } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/api/response';
import { notificationService } from '@/modules/notifications/notification-service';

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default-user';

    const notifications = await notificationService.listNotifications(userId);
    return NextResponse.json(createSuccessResponse(notifications, requestId));
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function PATCH(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const id = body.id;
    const userId = body.userId || 'default-user';

    const dismissed = await notificationService.dismissNotification(id, userId);
    return NextResponse.json(createSuccessResponse({ dismissed }, requestId));
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
