import { NextRequest, NextResponse } from 'next/server';
import { ConfirmActionSchema } from '@jarvis/shared';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const validated = ConfirmActionSchema.parse(body);

    if (validated.confirmed) {
      return NextResponse.json(
        createSuccessResponse(
          {
            confirmed: true,
            message: 'Action approved and queued for execution.',
          },
          requestId
        )
      );
    }

    return NextResponse.json(
      createSuccessResponse(
        {
          confirmed: false,
          message: 'Action cancelled by user.',
        },
        requestId
      )
    );
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
