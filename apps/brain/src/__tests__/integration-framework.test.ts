import { ToolContext } from '@jarvis/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BaseIntegration } from '../modules/integrations/base-integration';
import { BaseIntegrationTool } from '../modules/integrations/integration-tool';
import { integrationManager } from '../modules/integrations/integration-manager';
import { toolRegistry } from '../modules/tools/registry';

// Self-contained test integration for the framework
class TestReadTool extends BaseIntegrationTool<{ limit?: number }, string[]> {
  constructor() {
    super({
      id: 'demo_service.get_items',
      name: 'demo_service.get_items',
      description: 'Get demo items from service',
      integrationId: 'demo_service',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        limit: z.number().min(1).max(30).default(10).describe('Max items to return'),
      }),
      executor: async (input) => ({
        success: true,
        data: ['item1', 'item2'].slice(0, input.limit || 10),
        message: 'Fetched demo items successfully',
      }),
    });
  }
}

class TestWriteTool extends BaseIntegrationTool<{ title: string; content: string }, { id: string; title: string }> {
  constructor() {
    super({
      id: 'demo_service.create_item',
      name: 'demo_service.create_item',
      description: 'Create a new item in demo service (requires user confirmation)',
      integrationId: 'demo_service',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        title: z.string().min(1).describe('Item title'),
        content: z.string().min(1).describe('Item content'),
      }),
      executor: async (input) => ({
        success: true,
        data: { id: 'created-123', title: input.title },
        message: `Created item "${input.title}"`,
      }),
    });
  }
}

class DemoIntegration extends BaseIntegration {
  public readonly metadata = {
    id: 'demo_service',
    name: 'Demo Service',
    description: 'Service for framework lifecycle and tool testing',
    version: '1.0.0',
    authRequirements: {
      type: 'TOKEN' as const,
      requiredFields: ['token'],
      isConfigured: true,
    },
    permissions: ['read', 'write'],
  };

  constructor() {
    super();
    this.registerTool(new TestReadTool());
    this.registerTool(new TestWriteTool());
  }
}

describe('Jarvis Extensible Tool & Integration Framework', () => {
  const dummyContext: ToolContext = {
    userId: 'test-user',
    conversationId: 'test-conv',
    requestId: 'req-1',
    timezone: 'UTC',
    locale: 'en-US',
  };

  let demoIntegration: DemoIntegration;

  beforeEach(async () => {
    demoIntegration = new DemoIntegration();
    integrationManager.register(demoIntegration);
    await demoIntegration.enable();
  });

  describe('Integration Manager Lifecycle & Discovery', () => {
    it('discovers registered integrations and reports metadata', () => {
      const integrations = integrationManager.getAllIntegrations();
      const ids = integrations.map((i) => i.metadata.id);

      expect(ids).toContain('demo_service');
      const found = integrationManager.getIntegration('demo_service');
      expect(found).toBeDefined();
      expect(found?.metadata.name).toBe('Demo Service');
      expect(found?.metadata.version).toBe('1.0.0');
    });

    it('dynamically hides tools when an integration is disabled', async () => {
      const toolsBefore = integrationManager.getAllActiveTools();
      expect(toolsBefore.some((t) => t.integrationId === 'demo_service')).toBe(true);

      // Disable integration
      await integrationManager.disableIntegration('demo_service');
      const toolsAfter = integrationManager.getAllActiveTools();
      expect(toolsAfter.some((t) => t.integrationId === 'demo_service')).toBe(false);

      // Re-enable integration
      await integrationManager.enableIntegration('demo_service');
      const toolsRestored = integrationManager.getAllActiveTools();
      expect(toolsRestored.some((t) => t.integrationId === 'demo_service')).toBe(true);
    });

    it('supports looking up tools by both dot and underscore notation', () => {
      const toolByDot = integrationManager.getTool('demo_service.create_item');
      const toolByUnderscore = integrationManager.getTool('demo_service_create_item');

      expect(toolByDot).toBeDefined();
      expect(toolByUnderscore).toBeDefined();
      expect(toolByDot?.id).toBe('demo_service.create_item');
      expect(toolByUnderscore?.id).toBe('demo_service.create_item');
    });

    it('supports unregistering and removing an integration', async () => {
      expect(integrationManager.getIntegration('demo_service')).toBeDefined();
      const removed = await integrationManager.uninstall('demo_service');
      expect(removed).toBe(true);
      expect(integrationManager.getIntegration('demo_service')).toBeUndefined();
    });
  });

  describe('Unified ToolRegistry & Gemini Function Declarations', () => {
    it('aggregates built-in core tools and active integration tools', () => {
      const allTools = toolRegistry.getAllTools();
      const names = allTools.map((t) => t.name);

      // Core built-in tools present
      expect(names).toContain('calculator');
      expect(names).toContain('task_create');
      expect(names).toContain('memory_create');

      // Integration tools present
      expect(names).toContain('demo_service.get_items');
      expect(names).toContain('demo_service.create_item');
    });

    it('generates Gemini-safe function declarations with underscores', () => {
      const declarations = toolRegistry.getGeminiFunctionDeclarations();
      const declNames = declarations.map((d) => d.name);

      expect(declNames).toContain('demo_service_get_items');
      expect(declNames).toContain('demo_service_create_item');
      expect(declNames.every((n) => !n.includes('.'))).toBe(true);
    });

    it('removes tools from Gemini declarations when integration is disabled', async () => {
      await integrationManager.disableIntegration('demo_service');
      const declarations = toolRegistry.getGeminiFunctionDeclarations();
      const declNames = declarations.map((d) => d.name);

      expect(declNames).not.toContain('demo_service_get_items');
      expect(declNames).not.toContain('demo_service_create_item');

      // Re-enable
      await integrationManager.enableIntegration('demo_service');
    });

    it('executes tool via Gemini function name mapping in ToolRegistry', async () => {
      const registryTool = toolRegistry.getTool('demo_service_get_items');
      expect(registryTool).toBeDefined();

      const result = await registryTool!.execute({ limit: 1 }, dummyContext);
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });
  });

  describe('Tool Execution & Machine-Readable Validation', () => {
    it('validates input parameters with Zod and rejects invalid input early', async () => {
      const tool = demoIntegration.getTool('demo_service.get_items')!;
      // Limit exceeds max (30)
      const result = await tool.execute({ limit: 100 }, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PARAMETERS');
      expect(result.message).toContain('Invalid parameters');
    });

    it('returns error when executing an unavailable or disabled integration tool', async () => {
      const result = await integrationManager.executeTool('nonexistent.action', {}, dummyContext);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_UNAVAILABLE');
      expect(result.message).toContain('not available or disabled');
    });

    it('enforces requiresConfirmation on write actions', () => {
      const writeTool = demoIntegration.getTool('demo_service.create_item');
      expect(writeTool).toBeDefined();
      expect(writeTool?.requiresConfirmation).toBe(true);
      expect(writeTool?.riskLevel).toBe('HIGH_RISK');
      expect(writeTool?.actionType).toBe('WRITE');
    });

    it('does not require confirmation on safe read actions', () => {
      const readTool = demoIntegration.getTool('demo_service.get_items');
      expect(readTool).toBeDefined();
      expect(readTool?.requiresConfirmation).toBe(false);
      expect(readTool?.riskLevel).toBe('SAFE');
      expect(readTool?.actionType).toBe('READ');
    });

    it('executes write tool successfully and returns normalized StandardToolResult', async () => {
      const tool = demoIntegration.getTool('demo_service.create_item')!;
      const result = await tool.execute({ title: 'New Task', content: 'Task details' }, dummyContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'created-123', title: 'New Task' });
      expect(result.message).toContain('Created item "New Task"');
    });
  });
});
