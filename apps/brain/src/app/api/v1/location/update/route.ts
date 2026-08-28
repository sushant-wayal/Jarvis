import { NextRequest } from 'next/server';
import { LocationUpdateSchema } from '@jarvis/shared';
import { handleApiError, successResponse } from '@/lib/api/response';
import { locationService } from '@/modules/location/location-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const validated = LocationUpdateSchema.parse(body);

    const context = await locationService.updateLocation(validated);
    return successResponse(context, requestId);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

