import fs from 'node:fs';
import path from 'node:path';
import { IntegrationAuthConfig } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';

export interface GmailCredentials {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  email?: string;
}

export class GmailAuth {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private clientId: string | null = null;
  private clientSecret: string | null = null;
  private connectedEmail: string | null = null;
  private initializedFromStore: boolean = false;

  constructor() {
    this.accessToken = process.env.GMAIL_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN || null;
    this.refreshToken = process.env.GMAIL_REFRESH_TOKEN || null;
    this.clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || null;
    this.clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || null;
  }

  public getAuthConfig(): IntegrationAuthConfig {
    return {
      type: 'OAUTH',
      requiredFields: ['accessToken'],
      isConfigured: this.isConfigured(),
      metadata: {
        tokenConfigured: Boolean(this.accessToken),
        hasRefreshToken: Boolean(this.refreshToken),
        connectedEmail: this.connectedEmail,
        tokenSource: this.accessToken === (process.env.GMAIL_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN) ? 'ENV' : 'DYNAMIC',
      },
    };
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public getRefreshToken(): string | null {
    return this.refreshToken;
  }

  public getClientId(): string | null {
    return this.clientId;
  }

  public getClientSecret(): string | null {
    return this.clientSecret;
  }

  public getConnectedEmail(): string | null {
    return this.connectedEmail;
  }

  public setToken(token: string): void {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid Gmail token provided.');
    }
    this.accessToken = token.trim();
    logger.info('Gmail access token configured successfully.');
  }

  public setCredentials(credentials: GmailCredentials): void {
    if (credentials.accessToken) {
      this.accessToken = credentials.accessToken.trim();
    }
    if (credentials.refreshToken) {
      this.refreshToken = credentials.refreshToken.trim();
    }
    if (credentials.clientId) {
      this.clientId = credentials.clientId.trim();
    }
    if (credentials.clientSecret) {
      this.clientSecret = credentials.clientSecret.trim();
    }
    if (credentials.email) {
      this.connectedEmail = credentials.email.trim();
    }
    logger.info('Gmail credentials updated.');
  }

  public async loadStoredCredentials(userId: string = 'default-user'): Promise<boolean> {
    if (this.initializedFromStore && this.accessToken) {
      return true;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (user?.preferences) {
        const prefs = JSON.parse(user.preferences) as Record<string, any>;
        const gmailCreds = prefs?.integrations?.gmail?.credentials;
        if (gmailCreds && (gmailCreds.accessToken || gmailCreds.refreshToken)) {
          this.accessToken = gmailCreds.accessToken || this.accessToken;
          this.refreshToken = gmailCreds.refreshToken || this.refreshToken;
          this.clientId = gmailCreds.clientId || this.clientId;
          this.clientSecret = gmailCreds.clientSecret || this.clientSecret;
          this.connectedEmail = gmailCreds.email || this.connectedEmail;
          this.initializedFromStore = true;
          logger.info('Loaded persistent Gmail credentials from database for user', { userId });
          return true;
        }
      }
    } catch (err) {
      logger.info('Could not load Gmail credentials from database (will fallback to environment)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.initializedFromStore = true;
    return Boolean(this.accessToken);
  }

  public async savePersistentCredentials(
    credentials: GmailCredentials,
    userId: string = 'default-user'
  ): Promise<void> {
    this.setCredentials(credentials);

    // 1. Persist to PostgreSQL User.preferences
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const currentPrefs = user?.preferences ? JSON.parse(user.preferences) : {};

      // Merge credentials into existing gmail prefs — never overwrite policies, autoApprove, etc.
      const existingGmailPrefs = currentPrefs?.integrations?.gmail || {};
      const updatedPrefs = {
        ...currentPrefs,
        integrations: {
          ...(currentPrefs.integrations || {}),
          gmail: {
            ...existingGmailPrefs,       // ← preserve policies, autoApprove, toolPolicies
            enabled: true,
            credentials: {
              accessToken: this.accessToken,
              refreshToken: this.refreshToken,
              clientId: this.clientId,
              clientSecret: this.clientSecret,
              email: this.connectedEmail,
              updatedAt: new Date().toISOString(),
            },
          },
        },
      };

      await prisma.user.upsert({
        where: { id: userId },
        update: { preferences: JSON.stringify(updatedPrefs) },
        create: {
          id: userId,
          name: 'Sushant',
          preferences: JSON.stringify(updatedPrefs),
        },
      });
      logger.info('Successfully persisted Gmail credentials to database', { userId });
    } catch (err) {
      logger.warn('Failed to persist Gmail credentials to database', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2. Sync to local .env if available
    this.syncToEnvFile();
  }

  public async clearCredentials(userId: string = 'default-user'): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.connectedEmail = null;
    this.initializedFromStore = false;

    // Clear from PostgreSQL
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user?.preferences) {
        const prefs = JSON.parse(user.preferences);
        if (prefs.integrations?.gmail) {
          delete prefs.integrations.gmail.credentials;
          prefs.integrations.gmail.enabled = false;
          await prisma.user.update({
            where: { id: userId },
            data: { preferences: JSON.stringify(prefs) },
          });
        }
      }
    } catch (err) {
      logger.info('Failed to clear Gmail credentials from database', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Clear from local .env
    this.removeTokensFromEnvFile();
    logger.info('Gmail authentication credentials cleared and wiped.');
  }

  public isConfigured(): boolean {
    return Boolean(this.accessToken && this.accessToken.length > 0);
  }

  /**
   * Refreshes OAuth2 access token if refreshToken & client credentials exist.
   * Updates database and .env with the fresh access token so re-authenticating is never needed.
   */
  public async refreshAccessToken(userId: string = 'default-user'): Promise<{
    success: boolean;
    accessToken?: string;
    error?: string;
  }> {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) {
      return {
        success: false,
        error: 'Cannot refresh token: missing refresh token, client ID, or client secret.',
      };
    }

    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Token refresh failed with HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as { access_token?: string; expires_in?: number };
      if (data.access_token) {
        this.accessToken = data.access_token;
        logger.info('Gmail access token refreshed successfully.');

        // Persist newly minted access token so all future requests use it
        void this.savePersistentCredentials({ accessToken: data.access_token }, userId).catch(() => {});

        return { success: true, accessToken: data.access_token };
      }

      return { success: false, error: 'No access token returned in refresh response.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Network error during token refresh: ${msg}` };
    }
  }

  /**
   * Validate current token against the Gmail profile endpoint.
   */
  public async validateToken(): Promise<{ valid: boolean; email?: string; error?: string }> {
    await this.loadStoredCredentials();

    if (!this.accessToken) {
      return { valid: false, error: 'No Gmail access token configured.' };
    }

    try {
      let response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
        },
      });

      // Auto-refresh on 401
      if (response.status === 401 && this.refreshToken && this.clientId && this.clientSecret) {
        const refreshResult = await this.refreshAccessToken();
        if (refreshResult.success && this.accessToken) {
          response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              Accept: 'application/json',
            },
          });
        }
      }

      if (!response.ok) {
        return {
          valid: false,
          error: `Gmail token verification failed: HTTP ${response.status} ${response.statusText}`,
        };
      }

      const profile = (await response.json()) as { emailAddress?: string };
      if (profile.emailAddress) {
        this.connectedEmail = profile.emailAddress;
      }

      return {
        valid: true,
        email: profile.emailAddress,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        error: `Network error verifying Gmail token: ${msg}`,
      };
    }
  }

  private syncToEnvFile(): void {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (!fs.existsSync(envPath)) return;

      let content = fs.readFileSync(envPath, 'utf-8');
      const updates: Record<string, string> = {};
      if (this.accessToken) updates['GMAIL_ACCESS_TOKEN'] = this.accessToken;
      if (this.refreshToken) updates['GMAIL_REFRESH_TOKEN'] = this.refreshToken;
      if (this.clientId) updates['GMAIL_CLIENT_ID'] = this.clientId;
      if (this.clientSecret) updates['GMAIL_CLIENT_SECRET'] = this.clientSecret;

      for (const [key, val] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
          content = content.replace(regex, `${key}=${val}`);
        } else {
          content += `\n${key}=${val}`;
        }
      }
      fs.writeFileSync(envPath, content.trim() + '\n', 'utf-8');
    } catch {
      // Ignore env file write issues in non-filesystem environments
    }
  }

  private removeTokensFromEnvFile(): void {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (!fs.existsSync(envPath)) return;

      let content = fs.readFileSync(envPath, 'utf-8');
      content = content.replace(/^GMAIL_ACCESS_TOKEN=.*$/m, '');
      content = content.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, '');
      fs.writeFileSync(envPath, content.replace(/\n\n+/g, '\n').trim() + '\n', 'utf-8');
    } catch {
      // Ignore
    }
  }
}
