import { IntegrationMetadata, IntegrationStatus } from '@jarvis/shared';
import { BaseIntegration } from '../base-integration';
import { SerenityAuth } from './SerenityAuth';
import { SerenityClient } from './SerenityClient';

import { GetPipelineStatusTool } from './tools/GetPipelineStatusTool';
import { TriggerVideoGenerationTool } from './tools/TriggerVideoGenerationTool';
import { RetryFailedJobsTool } from './tools/RetryFailedJobsTool';
import { GetHistoryTool } from './tools/GetHistoryTool';
import { GetAnalyticsTool } from './tools/GetAnalyticsTool';
import { GetIdeasQueueTool } from './tools/GetIdeasQueueTool';
import { AddVideoIdeaTool } from './tools/AddVideoIdeaTool';
import { ReorderVideoIdeaTool } from './tools/ReorderVideoIdeaTool';
import { RemoveVideoIdeaTool } from './tools/RemoveVideoIdeaTool';
import { GetSeriesTool } from './tools/GetSeriesTool';
import { CreateSeriesTool } from './tools/CreateSeriesTool';
import { UpdateScheduleTool } from './tools/UpdateScheduleTool';
import { GetSettingsTool } from './tools/GetSettingsTool';
import { UpdateSettingsTool } from './tools/UpdateSettingsTool';
import { GenerateScriptPreviewTool } from './tools/GenerateScriptPreviewTool';
import { GenerateThumbnailTool } from './tools/GenerateThumbnailTool';

export class SerenityIntegration extends BaseIntegration {
  public readonly metadata: IntegrationMetadata;
  private auth: SerenityAuth;
  private client: SerenityClient;

  constructor(client?: SerenityClient) {
    super();
    this.auth = client ? client.getAuth() : new SerenityAuth();
    this.client = client || new SerenityClient(this.auth);

    this.metadata = {
      id: 'serenity',
      name: 'Serenity',
      description:
        'Autonomous YouTube channel pipeline generating, voicing, visualizing, and publishing daily videos and shorts',
      version: '1.0.0',
      authRequirements: this.auth.getAuthConfig(),
      permissions: ['channel:read', 'channel:write'],
    };

    this.registerTools();
  }

  public getAuth(): SerenityAuth {
    return this.auth;
  }

  public getClient(): SerenityClient {
    return this.client;
  }

  public override async getStatus(): Promise<IntegrationStatus> {
    if (!this.enabled) {
      return 'DISABLED';
    }
    return this.auth.isConfigured() ? 'ENABLED' : 'CONFIG_REQUIRED';
  }

  public override async authenticate(credentials: Record<string, string>): Promise<boolean> {
    if (credentials.apiKey) {
      this.auth.setApiKey(credentials.apiKey);
    }
    if (credentials.baseUrl) {
      this.auth.setBaseUrl(credentials.baseUrl);
    }
    const configured = this.auth.isConfigured();
    this.metadata.authRequirements.isConfigured = configured;
    return configured;
  }

  public override async disconnect(): Promise<void> {
    this.auth.clearApiKey();
    this.metadata.authRequirements.isConfigured = false;
  }

  private registerTools(): void {
    this.registerTool(new GetPipelineStatusTool(this.client));
    this.registerTool(new TriggerVideoGenerationTool(this.client));
    this.registerTool(new RetryFailedJobsTool(this.client));
    this.registerTool(new GetHistoryTool(this.client));
    this.registerTool(new GetAnalyticsTool(this.client));
    this.registerTool(new GetIdeasQueueTool(this.client));
    this.registerTool(new AddVideoIdeaTool(this.client));
    this.registerTool(new ReorderVideoIdeaTool(this.client));
    this.registerTool(new RemoveVideoIdeaTool(this.client));
    this.registerTool(new GetSeriesTool(this.client));
    this.registerTool(new CreateSeriesTool(this.client));
    this.registerTool(new UpdateScheduleTool(this.client));
    this.registerTool(new GetSettingsTool(this.client));
    this.registerTool(new UpdateSettingsTool(this.client));
    this.registerTool(new GenerateScriptPreviewTool(this.client));
    this.registerTool(new GenerateThumbnailTool(this.client));
  }
}

export const serenityIntegration = new SerenityIntegration();
