#!/usr/bin/env node
/**
 * Gmail OAuth2 Authentication & Credential Setup Helper for Jarvis
 *
 * This script guides you through authenticating with Google OAuth2 for the Gmail integration.
 * It obtains an access token and persistent refresh token, verifies the connection against
 * the Gmail API, and writes the credentials directly into `apps/brain/.env`.
 */

import http from 'node:http';
import url from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE_PATH = path.join(ROOT_DIR, 'apps', 'brain', '.env');

const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${colors.bright}${question}${colors.reset} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function openBrowser(targetUrl) {
  const start =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
      ? 'start ""'
      : 'xdg-open';
  exec(`${start} "${targetUrl}"`, () => {});
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

function updateEnvFile(filePath, updates) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  const lines = content.split('\n');
  const updatedKeys = new Set();

  // Update existing keys
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim();
      if (key in updates) {
        lines[i] = `${key}=${updates[key]}`;
        updatedKeys.add(key);
      }
    }
  }

  // Append new keys
  const newKeys = Object.keys(updates).filter((k) => !updatedKeys.has(k));
  if (newKeys.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push('# Gmail Integration (Google OAuth2)');
    for (const key of newKeys) {
      lines.push(`${key}=${updates[key]}`);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n').trim() + '\n', 'utf-8');
}

async function main() {
  console.clear();
  log('====================================================', colors.cyan);
  log('   Jarvis Gmail Integration - OAuth2 Authenticator   ', colors.bright + colors.cyan);
  log('====================================================\n', colors.cyan);

  const existingEnv = parseEnvFile(ENV_FILE_PATH);

  log('To authenticate Gmail, you need Google Cloud OAuth credentials.', colors.yellow);
  log('If you do not have them yet:');
  log('  1. Go to Google Cloud Console: https://console.cloud.google.com/');
  log('  2. Enable the "Gmail API"');
  log('  3. Configure OAuth Consent Screen (add your email to Test Users)');
  log('  4. Under Credentials -> Create "OAuth Client ID" (Web Application)');
  log(`  5. Add Authorized redirect URI: ${colors.bright}${REDIRECT_URI}${colors.reset}\n`);

  let clientId = existingEnv.GMAIL_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
  if (!clientId) {
    clientId = await prompt('Enter your Google Client ID:');
  } else {
    log(`Found existing Client ID: ${clientId.slice(0, 12)}...`, colors.dim);
    const useExisting = await prompt('Use existing Client ID? (Y/n):');
    if (useExisting.toLowerCase() === 'n') {
      clientId = await prompt('Enter your new Google Client ID:');
    }
  }

  if (!clientId) {
    log('Error: Google Client ID is required.', colors.red);
    process.exit(1);
  }

  let clientSecret = existingEnv.GMAIL_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
  if (!clientSecret) {
    clientSecret = await prompt('Enter your Google Client Secret:');
  } else {
    log(`Found existing Client Secret: ${clientSecret.slice(0, 5)}...`, colors.dim);
    const useExisting = await prompt('Use existing Client Secret? (Y/n):');
    if (useExisting.toLowerCase() === 'n') {
      clientSecret = await prompt('Enter your new Google Client Secret:');
    }
  }

  if (!clientSecret) {
    log('Error: Google Client Secret is required.', colors.red);
    process.exit(1);
  }

  // Construct Auth URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GMAIL_SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  log('\nStarting local callback receiver...', colors.cyan);

  let authCodeResolve;
  const authCodePromise = new Promise((resolve) => {
    authCodeResolve = resolve;
  });

  const server = http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);
    if (reqUrl.pathname === '/callback') {
      const code = reqUrl.query.code;
      const error = reqUrl.query.error;

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>Authentication Failed: ${error}</h2><p>You can close this window and return to terminal.</p>`);
        log(`\nAuthentication failed: ${error}`, colors.red);
        server.close();
        process.exit(1);
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <div style="font-family: system-ui, sans-serif; text-align: center; padding: 40px;">
            <h1 style="color: #16a34a;">Authentication Successful!</h1>
            <p style="font-size: 16px; color: #475569;">You can now close this browser tab and return to your terminal.</p>
          </div>
        `);
        authCodeResolve(code);
      }
    }
  });

  server.listen(PORT, () => {
    log(`Local callback server listening at: ${REDIRECT_URI}`, colors.green);
  });

  log('\nOpening your browser to authorize Google account...', colors.bright + colors.magenta);
  log('If the browser does not open automatically, copy and visit this URL:\n');
  log(authUrl.toString(), colors.cyan);
  log('\nWaiting for Google authentication callback (or press Ctrl+C to cancel)...\n', colors.dim);

  openBrowser(authUrl.toString());

  // Also support manual fallback code paste in case browser redirects to an unreachable host
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`${colors.dim}(Or paste the full redirect URL / authorization code here): ${colors.reset}`, (manualInput) => {
    if (manualInput && manualInput.trim()) {
      let code = manualInput.trim();
      if (code.includes('code=')) {
        try {
          const parsed = new URL(code);
          code = parsed.searchParams.get('code') || code;
        } catch {
          const match = code.match(/code=([^&]+)/);
          if (match) code = match[1];
        }
      }
      authCodeResolve(code);
    }
  });

  const authCode = await authCodePromise;
  rl.close();
  server.close();

  log('\nAuthorization code received! Exchanging for tokens...', colors.cyan);

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: authCode,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    log(`\nFailed to exchange code for tokens (HTTP ${tokenResponse.status}): ${errorText}`, colors.red);
    process.exit(1);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;

  if (!accessToken) {
    log('\nError: No access token returned by Google.', colors.red);
    process.exit(1);
  }

  log('Tokens successfully obtained! Verifying Gmail API access...', colors.cyan);

  // Validate by calling Gmail profile endpoint
  const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  let connectedEmail = 'Verified Account';
  if (profileResponse.ok) {
    const profile = await profileResponse.json();
    connectedEmail = profile.emailAddress || connectedEmail;
    log(`Connected to Gmail Account: ${colors.bright}${connectedEmail}${colors.reset}`, colors.green);
    log(`Total messages in account: ${profile.messagesTotal || 0}`, colors.dim);
  } else {
    log('Warning: Could not fetch profile details, but token was minted.', colors.yellow);
  }

  // Update .env file
  log(`\nUpdating ${ENV_FILE_PATH}...`, colors.cyan);
  const updates = {
    GMAIL_CLIENT_ID: clientId,
    GMAIL_CLIENT_SECRET: clientSecret,
    GMAIL_ACCESS_TOKEN: accessToken,
  };
  if (refreshToken) {
    updates.GMAIL_REFRESH_TOKEN = refreshToken;
  }

  updateEnvFile(ENV_FILE_PATH, updates);

  log('====================================================', colors.green);
  log('             GMAIL SETUP COMPLETED!                 ', colors.bright + colors.green);
  log('====================================================', colors.green);
  log(`Email:          ${connectedEmail}`, colors.bright);
  log(`Client ID:      ${clientId.slice(0, 12)}...`, colors.reset);
  log(`Access Token:   Configured & Validated`, colors.reset);
  log(`Refresh Token:  ${refreshToken ? 'Configured (Auto-renewal enabled)' : 'Not returned (using existing)'}`, colors.reset);
  log(`Saved to:       ${ENV_FILE_PATH}\n`, colors.green);

  log('You can now use Jarvis to read, search, draft, and send emails with Gmail!\n', colors.cyan);
}

main().catch((err) => {
  log(`\nUnexpected error: ${err instanceof Error ? err.message : String(err)}`, colors.red);
  process.exit(1);
});
