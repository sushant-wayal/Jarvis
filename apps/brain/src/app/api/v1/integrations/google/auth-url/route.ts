import { NextRequest } from 'next/server';
import { generateRequestId, successResponse, errorResponse } from '@/lib/api/response';
import { gmailIntegration } from '@/modules/integrations/gmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();

  const auth = gmailIntegration.getAuth();
  await auth.loadStoredCredentials().catch(() => {});

  const clientId = auth.getClientId() || process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return errorResponse(
      'CONFIG_REQUIRED',
      'Google Client ID is not configured on the server. Please set GMAIL_CLIENT_ID in apps/brain/.env',
      requestId,
      400
    );
  }

  // Derive callback URI from request host
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const callbackUrl = `${proto}://${host}/api/v1/integrations/google/callback`;

  // Custom client redirect target (defaults to mobile app scheme jarvis://integrations)
  const clientRedirect = req.nextUrl.searchParams.get('redirect') || 'jarvis://integrations';

  const statePayload = Buffer.from(
    JSON.stringify({
      clientRedirect,
      ts: Date.now(),
    })
  ).toString('base64url');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GMAIL_SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', statePayload);

  return successResponse(
    {
      authUrl: authUrl.toString(),
      callbackUrl,
      clientRedirect,
    },
    requestId
  );
}
