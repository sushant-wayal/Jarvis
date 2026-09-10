import {
  IntegrationMetadata,
  IntegrationStatus,
} from '@jarvis/shared';
import { logger } from '@/lib/logging/logger';
import { IntegrationTool, JarvisIntegration } from './types';

export abstract class BaseIntegration implements JarvisIntegration {
  public abstract readonly metadata: IntegrationMetadata;
  protected enabled: boolean = true;
  protected tools: Map<string, IntegrationTool> = new Map();

  public isEnabled(): boolean {
    return this.enabled;
  }

  public async getStatus(): Promise<IntegrationStatus> {
    if (!this.enabled) {
      return 'DISABLED';
    }
    if (this.metadata.authRequirements.type !== 'NONE' && !this.metadata.authRequirements.isConfigured) {
      return 'CONFIG_REQUIRED';
    }
    return 'ENABLED';
  }

  public async initialize(): Promise<void> {
    logger.info(`Initialized integration: ${this.metadata.name} (${this.metadata.id})`, {
      integrationId: this.metadata.id,
      version: this.metadata.version,
    });
  }

  public async enable(): Promise<void> {
    this.enabled = true;
    logger.info(`Enabled integration: ${this.metadata.id}`);
  }

  public async disable(): Promise<void> {
    this.enabled = false;
    logger.info(`Disabled integration: ${this.metadata.id}`);
  }

  public async authenticate(credentials: Record<string, string>): Promise<boolean> {
    // Default implementation can be overridden by specific integrations
    const hasRequired = this.metadata.authRequirements.requiredFields.every(
      (f) => Boolean(credentials[f])
    );
    if (hasRequired) {
      this.metadata.authRequirements.isConfigured = true;
      logger.info(`Integration ${this.metadata.id} authenticated successfully`);
      return true;
    }
    logger.warn(`Integration ${this.metadata.id} missing required credentials`, {
      required: this.metadata.authRequirements.requiredFields,
    });
    return false;
  }

  public async disconnect(): Promise<void> {
    this.metadata.authRequirements.isConfigured = false;
    logger.info(`Disconnected integration: ${this.metadata.id}`);
  }

  public async install(): Promise<void> {
    logger.info(`Installed integration: ${this.metadata.name} (${this.metadata.id})`);
    await this.initialize();
  }

  public async uninstall(): Promise<void> {
    await this.disconnect();
    await this.disable();
    this.tools.clear();
    logger.info(`Uninstalled integration: ${this.metadata.id}`);
  }

  public async executeTool(
    toolId: string,
    input: unknown,
    context: import('@jarvis/shared').ToolContext
  ): Promise<import('@jarvis/shared').StandardToolResult> {
    const tool = this.getTool(toolId);
    if (!tool) {
      return {
        success: false,
        data: null,
        message: `Tool "${toolId}" not found in integration ${this.metadata.id}.`,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool "${toolId}" not found in integration ${this.metadata.id}.`,
        },
      };
    }
    return tool.execute(input, context);
  }

  public registerTool(tool: IntegrationTool): void {
    this.tools.set(tool.id, tool);
    // Also index by tool name if different from id
    if (tool.name && tool.name !== tool.id) {
      this.tools.set(tool.name, tool);
    }
  }

  public getTools(): IntegrationTool[] {
    // Deduplicate in case a tool is registered under both id and name
    return Array.from(new Set(this.tools.values()));
  }

  public getTool(toolId: string): IntegrationTool | undefined {
    return this.tools.get(toolId);
  }
}
