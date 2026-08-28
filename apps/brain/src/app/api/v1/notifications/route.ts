import { NextRequest } from 'next/server';
import { handleApiError, successResponse } from '@/lib/api/response';
import { notificationService } from '@/modules/notifications/notification-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default-user';

    const notifications = await notificationService.listNotifications(userId);
    return successResponse(notifications, requestId);
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
    return successResponse({ dismissed }, requestId);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

