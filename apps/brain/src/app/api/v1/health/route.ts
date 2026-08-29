import { HealthStatus } from '@jarvis/shared';
import { NextResponse } from 'next/server';
import { errorResponse, generateRequestId, successResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';

import { getGeminiPoolStats } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const requestId = generateRequestId();
  let dbHealthy = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbHealthy = true;
  } catch {
    dbHealthy = false;
  }

  const poolStats = getGeminiPoolStats();
  const aiHealthy = poolStats.totalKeys > 0;

  const healthData: HealthStatus = {
    status: dbHealthy && aiHealthy ? 'operational' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy,
      aiProvider: aiHealthy,
      sttProvider: aiHealthy,
      ttsProvider: true,
    },
    version: '1.0.0',
  };

  if (!dbHealthy && !aiHealthy) {
    return errorResponse('SYSTEM_DEGRADED', 'Backend dependencies partially unavailable', requestId, 503, healthData);
  }

  return successResponse(healthData, requestId);
}
