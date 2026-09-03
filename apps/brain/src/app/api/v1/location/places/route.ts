import { NextRequest } from 'next/server';
import { handleApiError, successResponse } from '@/lib/api/response';
import { locationService } from '@/modules/location/location-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default-user';

    const places = await locationService.listKnownPlaces(userId);
    return successResponse(places, requestId);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const body = await req.json();
    const userId = body.userId || 'default-user';
    const place = await locationService.saveKnownPlace({
      userId,
      name: body.name,
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      radiusMeters: body.radiusMeters ? Number(body.radiusMeters) : 200,
    });
    return successResponse(place, requestId);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
