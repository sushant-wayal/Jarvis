import { ApiResponse } from '@jarvis/shared';
import { NextResponse } from 'next/server';

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

export function generateRequestId(): string {
  return `req_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
}
