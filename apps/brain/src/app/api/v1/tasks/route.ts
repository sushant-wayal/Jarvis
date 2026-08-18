import { NextRequest, NextResponse } from 'next/server';
import { CreateTaskSchema } from '@jarvis/shared';
import { createSuccessResponse, handleApiError } from '@/lib/api/response';
import { taskService } from '@/modules/tasks/task-service';

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default-user';
    const status = searchParams.get('status') || undefined;

    const tasks = await taskService.listTasks(userId, status);
    return NextResponse.json(createSuccessResponse(tasks, requestId));
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const validated = CreateTaskSchema.parse(body);

    const task = await taskService.createTask(validated);
    return NextResponse.json(createSuccessResponse(task, requestId), { status: 201 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
