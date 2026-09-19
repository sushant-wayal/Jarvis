import { beforeEach, describe, expect, it } from 'vitest';
import { integrationManager } from '../modules/integrations/integration-manager';
import { gmailIntegration } from '../modules/integrations/gmail';
import { gitHubIntegration } from '../modules/integrations/github';
import { GET as getIntegrations, POST as postIntegration } from '../app/api/v1/integrations/route';
import { GET as getGoogleAuthUrl } from '../app/api/v1/integrations/google/auth-url/route';
import { NextRequest } from 'next/server';

describe('Integrations API & OAuth Reset Lifecycle', () => {
  beforeEach(async () => {
    integrationManager.register(gmailIntegration);
    integrationManager.register(gitHubIntegration);
    await gmailIntegration.enable();
    await gitHubIntegration.enable();
  });

  it('GET /api/v1/integrations returns all registered integrations with status', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/integrations');
    const res = await getIntegrations(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);

    const ids = json.data.map((i: any) => i.id);
    expect(ids).toContain('gmail');
    expect(ids).toContain('github');

    const gmail = json.data.find((i: any) => i.id === 'gmail');
    expect(gmail.authType).toBe('OAUTH');
  });

  it('POST /api/v1/integrations toggling OFF an OAuth integration clears credentials', async () => {
    // 1. Setup Gmail with credentials
    gmailIntegration.getAuth().setToken('mock-oauth-access-token');
    expect(gmailIntegration.getAuth().isConfigured()).toBe(true);

    // 2. Toggle OFF Gmail via API
    const req = new NextRequest('http://localhost:3000/api/v1/integrations', {
      method: 'POST',
      body: JSON.stringify({ id: 'gmail', enabled: false }),
    });

    const res = await postIntegration(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.enabled).toBe(false);

    // 3. Verify credentials were wiped
    expect(gmailIntegration.getAuth().isConfigured()).toBe(false);
    expect(gmailIntegration.getAuth().getAccessToken()).toBeNull();
  });

  it('POST /api/v1/integrations toggling ON an unconfigured OAuth integration returns requiresAuth=true', async () => {
    // 1. Ensure Gmail is cleared
    await gmailIntegration.disconnect();
    expect(gmailIntegration.getAuth().isConfigured()).toBe(false);

    // 2. Toggle ON Gmail
    const req = new NextRequest('http://localhost:3000/api/v1/integrations', {
      method: 'POST',
      body: JSON.stringify({ id: 'gmail', enabled: true }),
    });

    const res = await postIntegration(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.enabled).toBe(true);
    expect(json.data.requiresAuth).toBe(true);
    expect(json.data.status).toBe('CONFIG_REQUIRED');
  });

  it('GET /api/v1/integrations/google/auth-url generates valid consent URL with offline access', async () => {
    // Configure mock client ID
    gmailIntegration.getAuth().setCredentials({ clientId: 'mock-client-id.apps.googleusercontent.com' });

    const req = new NextRequest('http://localhost:3000/api/v1/integrations/google/auth-url?redirect=jarvis://integrations');
    const res = await getGoogleAuthUrl(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(json.data.authUrl).toContain('access_type=offline');
    expect(json.data.authUrl).toContain('prompt=consent');
    expect(json.data.authUrl).toContain('scope=https%3A%2F%2Fmail.google.com%2F');
  });
});
