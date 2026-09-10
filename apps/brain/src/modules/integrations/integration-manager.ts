import { logger } from '@/lib/logging/logger';
import { IntegrationTool, JarvisIntegration } from './types';

export class IntegrationManager {
  private integrations: Map<string, JarvisIntegration> = new Map();

  /**
   * Register a new integration with the manager.
   */
  public register(integration: JarvisIntegration): void {
    const id = integration.metadata.id;
    if (this.integrations.has(id)) {
      logger.warn(`Integration ${id} already registered. Replacing registration.`);
    }
    this.integrations.set(id, integration);
    logger.info(`Registered integration: ${integration.metadata.name} (${id})`, {
      id,
      version: integration.metadata.version,
      toolCount: integration.getTools().length,
    });
  }

  /**
   * Unregister an integration by ID.
   */
  public unregister(integrationId: string): boolean {
    const removed = this.integrations.delete(integrationId);
    if (removed) {
      logger.info(`Unregistered integration: ${integrationId}`);
    }
    return removed;
  }

  /**
   * Get an integration by its ID.
   */
  public getIntegration(integrationId: string): JarvisIntegration | undefined {
    return this.integrations.get(integrationId);
  }

  /**
   * Get all registered integrations.
   */
  public getAllIntegrations(): JarvisIntegration[] {
    return Array.from(this.integrations.values());
  }

  /**
   * Get all currently enabled integrations.
   */
  public getEnabledIntegrations(): JarvisIntegration[] {
    return Array.from(this.integrations.values()).filter((int) => int.isEnabled());
  }

  /**
   * Enable a specific integration.
   */
  public async enableIntegration(integrationId: string): Promise<boolean> {
    const int = this.integrations.get(integrationId);
    if (!int) {
      logger.warn(`Cannot enable unknown integration: ${integrationId}`);
      return false;
    }
    await int.enable();
    return true;
  }

  /**
   * Disable a specific integration.
   */
  public async disableIntegration(integrationId: string): Promise<boolean> {
    const int = this.integrations.get(integrationId);
    if (!int) {
      logger.warn(`Cannot disable unknown integration: ${integrationId}`);
      return false;
    }
    await int.disable();
    return true;
  }

  /**
   * Authenticate an integration with credentials.
   */
  public async authenticateIntegration(
    integrationId: string,
    credentials: Record<string, string>
  ): Promise<boolean> {
    const int = this.integrations.get(integrationId);
    if (!int) {
      logger.warn(`Cannot authenticate unknown integration: ${integrationId}`);
      return false;
    }
    return int.authenticate(credentials);
  }

  /**
   * Disconnect an integration.
   */
  public async disconnectIntegration(integrationId: string): Promise<boolean> {
    const int = this.integrations.get(integrationId);
    if (!int) return false;
    await int.disconnect();
    return true;
  }

  /**
   * Get tools for a specific integration.
   */
  public getToolsForIntegration(integrationId: string): IntegrationTool[] {
    const int = this.integrations.get(integrationId);
    return int ? int.getTools() : [];
  }

  /**
   * Install and initialize an integration.
   */
  public async install(integration: JarvisIntegration): Promise<void> {
    this.register(integration);
    if (integration.install) {
      await integration.install();
    } else {
      await integration.initialize();
    }
  }

  /**
   * Uninstall and remove an integration.
   */
  public async uninstall(integrationId: string): Promise<boolean> {
    const int = this.integrations.get(integrationId);
    if (!int) return false;
    if (int.uninstall) {
      await int.uninstall();
    } else {
      await int.disconnect();
      await int.disable();
    }
    return this.unregister(integrationId);
  }

  /**
   * Get all tools across ALL registered integrations (enabled or disabled).
   */
  public getAllTools(): IntegrationTool[] {
    const tools: IntegrationTool[] = [];
    for (const int of this.integrations.values()) {
      tools.push(...int.getTools());
    }
    return tools;
  }

  /**
   * Get all active tools across currently enabled integrations.
   */
  public getAllActiveTools(): IntegrationTool[] {
    const tools: IntegrationTool[] = [];
    for (const int of this.getEnabledIntegrations()) {
      tools.push(...int.getTools());
    }
    return tools;
  }

  /**
   * Execute an integration tool through the manager pipeline.
   */
  public async executeTool(
    toolIdOrName: string,
    input: unknown,
    context: import('@jarvis/shared').ToolContext
  ): Promise<import('@jarvis/shared').StandardToolResult> {
    const tool = this.getTool(toolIdOrName);
    if (!tool) {
      return {
        success: false,
        data: null,
        message: `Integration tool "${toolIdOrName}" is not available or disabled.`,
        error: {
          code: 'TOOL_UNAVAILABLE',
          message: `Integration tool "${toolIdOrName}" is not available or disabled.`,
        },
      };
    }
    return tool.execute(input, context);
  }

  /**
   * Find a tool by either hierarchical ID ('github.create_issue')
   * or normalized name ('github_create_issue').
   */
  public getTool(toolIdOrName: string): IntegrationTool | undefined {
    for (const int of this.getEnabledIntegrations()) {
      const tool = int.getTool(toolIdOrName);
      if (tool) return tool;

      // Check if tool name matches with underscores instead of dots or vice versa
      const canonical = toolIdOrName.replace(/_/g, '.');
      const toolByCanonical = int.getTool(canonical);
      if (toolByCanonical) return toolByCanonical;

      for (const t of int.getTools()) {
        if (
          t.id === toolIdOrName ||
          t.name === toolIdOrName ||
          t.id.replace(/\./g, '_') === toolIdOrName ||
          t.name.replace(/\./g, '_') === toolIdOrName
        ) {
          return t;
        }
      }
    }
    return undefined;
  }

  /**
   * Initialize all registered integrations.
   */
  public async initializeAll(): Promise<void> {
    for (const int of this.integrations.values()) {
      try {
        await int.initialize();
      } catch (err) {
        logger.error(`Failed to initialize integration: ${int.metadata.id}`, err);
      }
    }
  }
}

export const integrationManager = new IntegrationManager();
