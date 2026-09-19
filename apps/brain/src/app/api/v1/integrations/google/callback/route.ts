import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging/logger';
import { gmailIntegration } from '@/modules/integrations/gmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  const state = req.nextUrl.searchParams.get('state');

  let clientRedirect = 'jarvis://integrations';
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
      if (decoded.clientRedirect) {
        clientRedirect = decoded.clientRedirect;
      }
    } catch {
      // fallback
    }
  }

  if (error) {
    logger.warn('Google OAuth callback returned error', { error });
    return new NextResponse(
      renderHtmlPage({
        title: 'Authentication Cancelled',
        message: `Google authentication failed or was cancelled: ${error}`,
        redirectUrl: `${clientRedirect}?status=error&error=${encodeURIComponent(error)}`,
        isSuccess: false,
      }),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (!code) {
    return new NextResponse(
      renderHtmlPage({
        title: 'Missing Authorization Code',
        message: 'No authorization code returned from Google.',
        redirectUrl: `${clientRedirect}?status=error&error=missing_code`,
        isSuccess: false,
      }),
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const auth = gmailIntegration.getAuth();
  await auth.loadStoredCredentials().catch(() => {});

  const clientId = auth.getClientId() || process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = auth.getClientSecret() || process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new NextResponse(
      renderHtmlPage({
        title: 'Configuration Error',
        message: 'Google Client ID or Client Secret is missing on the server.',
        redirectUrl: `${clientRedirect}?status=error&error=server_config_missing`,
        isSuccess: false,
      }),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const callbackUrl = `${proto}://${host}/api/v1/integrations/google/callback`;

  try {
    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl,
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error('Token exchange with Google failed', { status: tokenRes.status, errText });
      return new NextResponse(
        renderHtmlPage({
          title: 'Token Exchange Failed',
          message: `Could not exchange authorization code: HTTP ${tokenRes.status}`,
          redirectUrl: `${clientRedirect}?status=error&error=token_exchange_failed`,
          isSuccess: false,
        }),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Fetch user profile from Gmail API to confirm identity
    let emailAddress = 'Connected Account';
    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json',
        },
      });
      if (profileRes.ok) {
        const profile = (await profileRes.json()) as { emailAddress?: string };
        if (profile.emailAddress) {
          emailAddress = profile.emailAddress;
        }
      }
    } catch {
      // proceed with fallback
    }

    // Persist credentials in database & memory
    await auth.savePersistentCredentials({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      clientId,
      clientSecret,
      email: emailAddress,
    });

    // Ensure integration is enabled
    await gmailIntegration.enable();

    logger.info('Gmail integration authenticated and enabled successfully for user', {
      email: emailAddress,
    });

    const finalRedirect = `${clientRedirect}?status=success&integration=gmail&email=${encodeURIComponent(
      emailAddress
    )}`;

    return new NextResponse(
      renderHtmlPage({
        title: 'Connected to Gmail!',
        message: `Successfully connected ${emailAddress} to Jarvis.`,
        redirectUrl: finalRedirect,
        isSuccess: true,
      }),
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Unexpected error in Google OAuth callback', { error: msg });
    return new NextResponse(
      renderHtmlPage({
        title: 'Authentication Error',
        message: `Unexpected error: ${msg}`,
        redirectUrl: `${clientRedirect}?status=error&error=internal_error`,
        isSuccess: false,
      }),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

function renderHtmlPage({
  title,
  message,
  redirectUrl,
  isSuccess,
}: {
  title: string;
  message: string;
  redirectUrl: string;
  isSuccess: boolean;
}): string {
  const accentColor = isSuccess ? '#16a34a' : '#dc2626';
  const buttonBg = isSuccess ? '#00DBE9' : '#475569';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta http-equiv="refresh" content="2;url=${redirectUrl}">
  <style>
    body {
      background: #0A0D14;
      color: #E2E8F0;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: rgba(22, 27, 34, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    }
    h1 {
      color: ${accentColor};
      font-size: 24px;
      margin-top: 0;
      margin-bottom: 12px;
    }
    p {
      color: #94A3B8;
      font-size: 15px;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    a.btn {
      display: inline-block;
      background: ${buttonBg};
      color: #0A0D14;
      text-decoration: none;
      font-weight: 700;
      padding: 12px 28px;
      border-radius: 12px;
      font-size: 15px;
      transition: opacity 0.2s;
    }
    a.btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <a class="btn" href="${redirectUrl}">Open Jarvis App</a>
  </div>
</body>
</html>`;
}
