import { NextRequest } from 'next/server';
import { handleApiError, successResponse } from '@/lib/api/response';
import { locationService } from '@/modules/location/location-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = req.headers.get('x-request-id') || `req_${Math.random().toString(36).substring(2, 9)}`;
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'default-user';

    const deleted = await locationService.deleteKnownPlace(id, userId);
    return successResponse({ deleted, id }, requestId);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
