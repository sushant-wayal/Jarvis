import { NextRequest } from 'next/server';
import { ConfirmActionSchema } from '@jarvis/shared';
import { handleApiError, successResponse } from '@/lib/api/response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const validated = ConfirmActionSchema.parse(body);

    if (validated.confirmed) {
      return successResponse(
        {
          confirmed: true,
          message: 'Action approved and queued for execution.',
        },
        requestId
      );
    }

    return successResponse(
      {
        confirmed: false,
        message: 'Action cancelled by user.',
      },
      requestId
    );
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

