import { NextRequest, NextResponse } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/api/response';
import { taskRunner } from '@/modules/tasks/task-runner';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const result = await taskRunner.runDueTasks();
    return NextResponse.json(createSuccessResponse(result, requestId));
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
