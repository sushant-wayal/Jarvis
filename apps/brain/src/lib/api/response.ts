import { ApiResponse } from '@jarvis/shared';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function successResponse<T>(data: T, requestId: string, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      error: null,
      requestId,
    },
    { status }
  );
}

export function errorResponse(
  code: string,
  message: string,
  requestId: string,
  status = 400,
  details?: unknown
): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: {
        code,
        message,
        details,
      },
      requestId,
    },
    { status }
  );
}

export const createSuccessResponse = successResponse;
export const createErrorResponse = errorResponse;

export function handleApiError(err: unknown, requestId: string): NextResponse<ApiResponse<null>> {
  if (err instanceof ZodError) {
    return errorResponse('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input schema', requestId, 400, err.errors);
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  return errorResponse('INTERNAL_ERROR', message, requestId, 500);
}

export function generateRequestId(): string {
  return `req_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
}
