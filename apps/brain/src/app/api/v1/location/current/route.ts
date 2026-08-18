import { NextRequest, NextResponse } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/api/response';
import { locationService } from '@/modules/location/location-service';

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default-user';

    const context = await locationService.getCurrentLocation(userId);
    return NextResponse.json(createSuccessResponse(context, requestId));
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
