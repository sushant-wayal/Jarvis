import { NextRequest } from 'next/server';
import { UpdateTaskSchema } from '@jarvis/shared';
import { errorResponse, handleApiError, successResponse } from '@/lib/api/response';
import { taskService } from '@/modules/tasks/task-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default-user';

    const task = await taskService.getTask(id, userId);
    if (!task) {
      return errorResponse('NOT_FOUND', 'Task not found', requestId, 404);
    }

    return successResponse(task, requestId);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const userId = body.userId || 'default-user';
    const validated = UpdateTaskSchema.parse(body);

    const updated = await taskService.updateTask(id, userId, validated);
    if (!updated) {
      return errorResponse('NOT_FOUND', 'Task not found', requestId, 404);
    }

    return successResponse(updated, requestId);
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

    const deleted = await taskService.deleteTask(id, userId);
    if (!deleted) {
      return errorResponse('NOT_FOUND', 'Task not found', requestId, 404);
    }

    return successResponse({ deleted: true }, requestId);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

