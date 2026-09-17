import { NextRequest } from 'next/server';
import { handleApiError, successResponse } from '@/lib/api/response';
import { taskRunner } from '@/modules/tasks/task-runner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const result = await taskRunner.runDueTasks();
    return successResponse(result, requestId);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const result = await taskRunner.runDueTasks();
    return successResponse(result, requestId);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

