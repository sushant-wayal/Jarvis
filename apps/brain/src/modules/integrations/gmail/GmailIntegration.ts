import { IntegrationMetadata, IntegrationStatus } from '@jarvis/shared';
import { BaseIntegration } from '../base-integration';
import { GmailAuth } from './GmailAuth';
import { GmailClient } from './GmailClient';
import { ListEmailsTool } from './tools/ListEmailsTool';
import { GetEmailTool } from './tools/GetEmailTool';
import { ListThreadsTool } from './tools/ListThreadsTool';
import { GetThreadTool } from './tools/GetThreadTool';
import { SendEmailTool } from './tools/SendEmailTool';
import { CreateDraftTool } from './tools/CreateDraftTool';
import { ReplyEmailTool } from './tools/ReplyEmailTool';
import { ModifyEmailLabelsTool } from './tools/ModifyEmailLabelsTool';
import { TrashEmailTool } from './tools/TrashEmailTool';
import { GetProfileTool } from './tools/GetProfileTool';

export class GmailIntegration extends BaseIntegration {
  public readonly metadata: IntegrationMetadata;
  private auth: GmailAuth;
  private client: GmailClient;

  constructor(client?: GmailClient) {
    super();
    this.auth = client ? client.getAuth() : new GmailAuth();
    this.client = client || new GmailClient(this.auth);

    this.metadata = {
      id: 'gmail',
      name: 'Gmail',
      description: 'Search, read, send, reply to emails, create drafts, and manage inbox labels with Gmail',
      version: '1.0.0',
      authRequirements: this.auth.getAuthConfig(),
      permissions: ['https://mail.google.com/'],
    };

    this.registerTools();
  }

  public getAuth(): GmailAuth {
    return this.auth;
  }

  public getClient(): GmailClient {
    return this.client;
  }

  public override async initialize(): Promise<void> {
    await this.auth.loadStoredCredentials().catch(() => {});
    // Restore the persisted enabled/disabled preference from the database so that
    // toggling off and restarting the server keeps the integration disabled.
    await this.loadPersistedEnabledState().catch(() => {});
    await super.initialize();
  }

  private async loadPersistedEnabledState(): Promise<void> {
    try {
      const { prisma } = await import('@/lib/db/prisma');
      const user = await prisma.user.findUnique({ where: { id: 'default-user' } });
      if (user?.preferences) {
        const prefs = JSON.parse(user.preferences) as Record<string, any>;
        const gmailPrefs = prefs?.integrations?.gmail;
        if (gmailPrefs && typeof gmailPrefs.enabled === 'boolean') {
          this.enabled = gmailPrefs.enabled;
        }
      }
    } catch {
      // Non-fatal — keep default in-memory value
    }
  }


  public override async getStatus(): Promise<IntegrationStatus> {
    // On every status check, reload the persisted enabled flag from DB so that
    // a Vercel cold-start (fresh in-memory state) always reflects the user's
    // last toggle choice rather than defaulting to enabled=true.
    await this.loadPersistedEnabledState().catch(() => {});

    if (!this.enabled) {
      return 'DISABLED';
    }
    await this.auth.loadStoredCredentials().catch(() => {});
    const configured = this.auth.isConfigured();
    this.metadata.authRequirements.isConfigured = configured;
    return configured ? 'ENABLED' : 'CONFIG_REQUIRED';
  }

  public override async authenticate(credentials: Record<string, string>): Promise<boolean> {
    const accessToken = credentials.token || credentials.accessToken;
    if (accessToken) {
      await this.auth.savePersistentCredentials({
        accessToken,
        refreshToken: credentials.refreshToken,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        email: credentials.email,
      });
      this.metadata.authRequirements.isConfigured = true;
      return true;
    }

    if (credentials.refreshToken && credentials.clientId && credentials.clientSecret) {
      this.auth.setCredentials({
        refreshToken: credentials.refreshToken,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        email: credentials.email,
      });
      const res = await this.auth.refreshAccessToken();
      if (res.success) {
        this.metadata.authRequirements.isConfigured = true;
        return true;
      }
    }
    return false;
  }

  public override async disconnect(): Promise<void> {
    await this.auth.clearCredentials();
    this.metadata.authRequirements.isConfigured = false;
  }

  private registerTools(): void {
    this.registerTool(new ListEmailsTool(this.client));
    this.registerTool(new GetEmailTool(this.client));
    this.registerTool(new ListThreadsTool(this.client));
    this.registerTool(new GetThreadTool(this.client));
    this.registerTool(new SendEmailTool(this.client));
    this.registerTool(new CreateDraftTool(this.client));
    this.registerTool(new ReplyEmailTool(this.client));
    this.registerTool(new ModifyEmailLabelsTool(this.client));
    this.registerTool(new TrashEmailTool(this.client));
    this.registerTool(new GetProfileTool(this.client));
  }
}

export const gmailIntegration = new GmailIntegration();
