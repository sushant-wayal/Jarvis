import { IntegrationMetadata, IntegrationStatus } from '@jarvis/shared';
import { BaseIntegration } from '../base-integration';
import { TemplateAuth } from './TemplateAuth';
import { TemplateClient } from './TemplateClient';
import { ExampleReadTool } from './tools/ExampleReadTool';
import { ExampleWriteTool } from './tools/ExampleWriteTool';

export class TemplateIntegration extends BaseIntegration {
  public readonly metadata: IntegrationMetadata;
  private auth: TemplateAuth;
  private client: TemplateClient;

  constructor(client?: TemplateClient) {
    super();
    this.auth = client ? client.getAuth() : new TemplateAuth();
    this.client = client || new TemplateClient(this.auth);

    this.metadata = {
      id: 'template_service',
      name: 'Template Service',
      description: 'Scaffold integration template for adding new external services to Jarvis',
      version: '1.0.0',
      authRequirements: this.auth.getAuthConfig(),
      permissions: ['read', 'write'],
    };

    this.registerTools();
  }

  public getAuth(): TemplateAuth {
    return this.auth;
  }

  public getClient(): TemplateClient {
    return this.client;
  }

  public override async getStatus(): Promise<IntegrationStatus> {
    if (!this.enabled) return 'DISABLED';
    return this.auth.isConfigured() ? 'ENABLED' : 'CONFIG_REQUIRED';
  }

  public override async authenticate(credentials: Record<string, string>): Promise<boolean> {
    if (credentials.apiKey) {
      this.auth.setApiKey(credentials.apiKey);
      this.metadata.authRequirements.isConfigured = true;
      return true;
    }
    return false;
  }

  public override async disconnect(): Promise<void> {
    this.auth.clearApiKey();
    this.metadata.authRequirements.isConfigured = false;
  }

  private registerTools(): void {
    this.registerTool(new ExampleReadTool(this.client));
    this.registerTool(new ExampleWriteTool(this.client));
  }
}
