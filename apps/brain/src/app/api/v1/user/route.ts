import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { generateRequestId, successResponse } from '@/lib/api/response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  const userId = req.nextUrl.searchParams.get('userId') || 'default-user';

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  return successResponse(
    {
      id: user?.id || userId,
      name: user?.name || 'Sushant',
      preferences: user?.preferences ? JSON.parse(user.preferences) : {},
    },
    requestId
  );
}

export async function PATCH(req: NextRequest) {
  const requestId = generateRequestId();
  const body = (await req.json()) as { userId?: string; name?: string; preferences?: Record<string, unknown> };
  const userId = body.userId || 'default-user';

  const updateData: { name?: string; preferences?: string } = {};
  if (body.name) updateData.name = body.name.trim();
  if (body.preferences) updateData.preferences = JSON.stringify(body.preferences);

  const updated = await prisma.user.upsert({
    where: { id: userId },
    update: updateData,
    create: {
      id: userId,
      name: body.name?.trim() || 'Sushant',
      preferences: body.preferences ? JSON.stringify(body.preferences) : undefined,
    },
  });

  return successResponse(
    {
      id: updated.id,
      name: updated.name,
      preferences: updated.preferences ? JSON.parse(updated.preferences) : {},
    },
    requestId
  );
}
