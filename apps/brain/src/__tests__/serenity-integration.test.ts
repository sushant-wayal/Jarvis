import { ToolContext } from '@jarvis/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serenityIntegration, SerenityIntegration } from '../modules/integrations/serenity/SerenityIntegration';
import { SerenityClient } from '../modules/integrations/serenity/SerenityClient';
import { SerenityAuth } from '../modules/integrations/serenity/SerenityAuth';
import { integrationManager } from '../modules/integrations/integration-manager';
import { toolRegistry } from '../modules/tools/registry';

describe('Serenity Autonomous YouTube Channel Integration', () => {
  const dummyContext: ToolContext = {
    userId: 'test-user',
    conversationId: 'test-conv',
    requestId: 'req-1',
    timezone: 'Asia/Kolkata',
    locale: 'en-IN',
  };

  beforeEach(async () => {
    integrationManager.register(serenityIntegration);
    await serenityIntegration.enable();
  });

  describe('Integration Lifecycle & Dynamic Discovery', () => {
    it('has correct metadata', () => {
      expect(serenityIntegration.metadata.id).toBe('serenity');
      expect(serenityIntegration.metadata.name).toBe('Serenity');
      expect(serenityIntegration.metadata.authRequirements.type).toBe('API_KEY');
      expect(serenityIntegration.metadata.permissions).toContain('channel:read');
      expect(serenityIntegration.metadata.permissions).toContain('channel:write');
    });

    it('reports status based on configuration and enable state', async () => {
      const mockAuth = new SerenityAuth();
      mockAuth.setApiKey('test-key-123');
      const integration = new SerenityIntegration(new SerenityClient(mockAuth));

      await integration.enable();
      expect(await integration.getStatus()).toBe('ENABLED');

      await integration.disable();
      expect(await integration.getStatus()).toBe('DISABLED');

      await integration.enable();
      await integration.disconnect();
      expect(await integration.getStatus()).toBe('CONFIG_REQUIRED');
    });

    it('dynamically exposes all 16 Serenity tools to ToolRegistry and Gemini declarations', async () => {
      await serenityIntegration.enable();
      const allTools = toolRegistry.getAllTools();
      const serenityTools = allTools.filter((t) => t.name.startsWith('serenity.'));

      expect(serenityTools).toHaveLength(16);

      const functionDeclarations = toolRegistry.getGeminiFunctionDeclarations();
      const serenityFunctions = functionDeclarations.filter((f) => f.name.startsWith('serenity_'));
      expect(serenityFunctions).toHaveLength(16);

      // Verify specific Gemini underscore function names
      expect(serenityFunctions.some((f) => f.name === 'serenity_get_pipeline_status')).toBe(true);
      expect(serenityFunctions.some((f) => f.name === 'serenity_trigger_video_generation')).toBe(true);
      expect(serenityFunctions.some((f) => f.name === 'serenity_get_analytics')).toBe(true);
      expect(serenityFunctions.some((f) => f.name === 'serenity_add_video_idea')).toBe(true);
      expect(serenityFunctions.some((f) => f.name === 'serenity_create_series')).toBe(true);
    });

    it('dynamically hides tools from ToolRegistry when disabled', async () => {
      await serenityIntegration.disable();

      const activeTools = integrationManager.getAllActiveTools();
      const serenityActive = activeTools.filter((t) => t.id.startsWith('serenity.'));
      expect(serenityActive).toHaveLength(0);

      const functionDeclarations = toolRegistry.getGeminiFunctionDeclarations();
      const serenityFunctions = functionDeclarations.filter((f) => f.name.startsWith('serenity_'));
      expect(serenityFunctions).toHaveLength(0);

      // Re-enable for subsequent tests
      await serenityIntegration.enable();
    });
  });

  describe('Tool Safety, Action Types & Confirmation Flags', () => {
    it('enforces confirmation on trigger_video_generation (HIGH_RISK, WRITE)', () => {
      const tool = serenityIntegration.getTool('serenity.trigger_video_generation');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('enforces confirmation on retry_failed_jobs (HIGH_RISK, WRITE)', () => {
      const tool = serenityIntegration.getTool('serenity.retry_failed_jobs');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('enforces confirmation on add_video_idea (HIGH_RISK, WRITE)', () => {
      const tool = serenityIntegration.getTool('serenity.add_video_idea');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('enforces confirmation on remove_video_idea (HIGH_RISK, DESTRUCTIVE)', () => {
      const tool = serenityIntegration.getTool('serenity.remove_video_idea');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('DESTRUCTIVE');
    });

    it('enforces confirmation on create_series (HIGH_RISK, WRITE)', () => {
      const tool = serenityIntegration.getTool('serenity.create_series');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('enforces confirmation on update_schedule (HIGH_RISK, WRITE)', () => {
      const tool = serenityIntegration.getTool('serenity.update_schedule');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('marks read-only diagnostic tools as SAFE without confirmation', () => {
      const statusTool = serenityIntegration.getTool('serenity.get_pipeline_status');
      expect(statusTool?.actionType).toBe('READ');
      expect(statusTool?.riskLevel).toBe('SAFE');
      expect(statusTool?.requiresConfirmation).toBe(false);

      const analyticsTool = serenityIntegration.getTool('serenity.get_analytics');
      expect(analyticsTool?.actionType).toBe('READ');
      expect(analyticsTool?.riskLevel).toBe('SAFE');
      expect(analyticsTool?.requiresConfirmation).toBe(false);

      const queueTool = serenityIntegration.getTool('serenity.get_ideas_queue');
      expect(queueTool?.actionType).toBe('READ');
      expect(queueTool?.riskLevel).toBe('SAFE');
      expect(queueTool?.requiresConfirmation).toBe(false);
    });
  });

  describe('Mock Execution of Tools', () => {
    it('executes get_pipeline_status with mocked client', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'getPipelineStatus').mockResolvedValueOnce({
        overallStatus: 'running',
        ranAt: '2026-09-12T01:00:00.000Z',
        runId: '1234567890',
        videoId: 'video-1741740000',
        videoTitle: 'Why Redis is Misused in Production',
        jobs: {
          populateIdeas: 'success',
          generateScript: 'success',
          renderScenes: 'running',
        },
      });

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.get_pipeline_status')!;
      const result = await tool.execute({}, dummyContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).overallStatus).toBe('running');
      expect((result.data as any).videoTitle).toBe('Why Redis is Misused in Production');
      expect(result.message).toContain('running');
    });

    it('executes trigger_video_generation with mocked client', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'triggerVideoGeneration').mockResolvedValueOnce({
        success: true,
        message: 'Pipeline workflow dispatched successfully',
        videoIdea: 'How B-Tree Indexing Works',
      });

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.trigger_video_generation')!;
      const result = await tool.execute({ videoIdea: 'How B-Tree Indexing Works' }, dummyContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('dispatched successfully');
      expect(mockClient.triggerVideoGeneration).toHaveBeenCalledWith('How B-Tree Indexing Works');
    });

    it('executes get_analytics with mocked client', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'getAnalytics').mockResolvedValueOnce({
        channel: {
          title: 'Serenity Tech',
          subscriberCount: 5200,
          viewCount: 120000,
          videoCount: 45,
        },
        videoCount: 1,
        recentVideos: [
          {
            videoId: 'dQw4w9WgXcQ',
            title: 'Why Redis is Misused in Production',
            views: 4200,
            ctr: 5.4,
          },
        ],
      });

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.get_analytics')!;
      const result = await tool.execute({ daysBack: 30, limit: 10 }, dummyContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Serenity Tech');
      expect((result.data as any).channel.subscriberCount).toBe(5200);
    });

    it('executes add_video_idea with mocked client', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'addIdea').mockResolvedValueOnce({
        ideas: ['Why SQLite Beats PostgreSQL for Small Apps'],
        count: 1,
      });

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.add_video_idea')!;
      const result = await tool.execute({ idea: 'Why SQLite Beats PostgreSQL for Small Apps' }, dummyContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully added');
      expect((result.data as any).count).toBe(1);
    });

    it('executes reorder_video_idea with mocked client', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'reorderIdea').mockResolvedValueOnce({
        ideas: ['Idea B', 'Idea A'],
        count: 2,
      });

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.reorder_video_idea')!;
      const result = await tool.execute({ index: 1, newIndex: 0 }, dummyContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('moved idea from position 1 to 0');
    });

    it('executes remove_video_idea for clearAll and single item', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'removeIdea').mockResolvedValueOnce({ ideas: [], count: 0 });
      vi.spyOn(mockClient, 'clearIdeas').mockResolvedValueOnce({ ideas: [], count: 0 });

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.remove_video_idea')!;

      const singleResult = await tool.execute({ index: 0 }, dummyContext);
      expect(singleResult.success).toBe(true);
      expect(singleResult.message).toContain('Successfully removed idea at position 0');

      const clearResult = await tool.execute({ clearAll: true }, dummyContext);
      expect(clearResult.success).toBe(true);
      expect(clearResult.message).toContain('Successfully cleared all ideas');
    });

    it('executes create_series with mocked client', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'createSeries').mockResolvedValueOnce({
        success: true,
        message: 'Series rust-internals initialized.',
      });

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.create_series')!;
      const result = await tool.execute(
        {
          id: 'rust-internals',
          title: 'Rust Internals & Memory Model',
          learningGoal: 'Master borrow checking, lifetimes, and unsafe code',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('rust-internals');
    });

    it('executes update_schedule with mocked client', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'updateScheduleTimes').mockResolvedValueOnce({
        shortsTimes: ['12:00', '16:30', '18:00', '20:00'],
        longFormTime: '18:30',
      });

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.update_schedule')!;
      const result = await tool.execute(
        { longFormTime: '18:30', shortsTimes: ['12:00', '16:30', '18:00', '20:00'] },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('18:30');
    });

    it('executes generate_script_preview with mocked client', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'generateScriptPreview').mockResolvedValueOnce({
        title: 'Why SQLite Beats Postgres',
        scenes: [
          { sceneIndex: 0, narration: 'Opening hook...' },
          { sceneIndex: 1, narration: 'Deep dive...' },
        ],
        shorts: [{ hook: 'Short hook', caption: 'Short caption' }],
      });

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.generate_script_preview')!;
      const result = await tool.execute({ videoIdea: 'Why SQLite Beats Postgres' }, dummyContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 scenes');
    });

    it('executes generate_thumbnail with mocked client', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'generateThumbnail').mockResolvedValueOnce({
        videoId: 'vid-123',
        title: 'Why SQLite Beats Postgres',
        thumbnailUrl: 'https://res.cloudinary.com/test/thumb.jpg',
      });

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.generate_thumbnail')!;
      const result = await tool.execute(
        { videoId: 'vid-123', title: 'Why SQLite Beats Postgres' },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('https://res.cloudinary.com/test/thumb.jpg');
    });
  });

  describe('Error Translation & Validation', () => {
    it('handles 401 unauthenticated errors gracefully', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'getPipelineStatus').mockRejectedValueOnce(
        new Error('Serenity authentication expired or API key invalid. Please reconnect your SERENITY_API_KEY.')
      );

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.get_pipeline_status')!;
      const result = await tool.execute({}, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Serenity authentication expired');
    });

    it('handles 403 rate limit or forbidden errors gracefully', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'getPipelineStatus').mockRejectedValueOnce(
        new Error('Serenity API rate limit exceeded or access forbidden.')
      );

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.get_pipeline_status')!;
      const result = await tool.execute({}, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('rate limit exceeded or access forbidden');
    });

    it('handles network timeout gracefully', async () => {
      const mockClient = new SerenityClient();
      vi.spyOn(mockClient, 'getPipelineStatus').mockRejectedValueOnce(
        new Error('Serenity API request to /api/pipeline-status timed out after 15 seconds.')
      );

      const integration = new SerenityIntegration(mockClient);
      const tool = integration.getTool('serenity.get_pipeline_status')!;
      const result = await tool.execute({}, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out after 15 seconds');
    });

    it('rejects invalid parameters with Zod validation error', async () => {
      const tool = serenityIntegration.getTool('serenity.add_video_idea')!;
      const result = await tool.execute({ idea: '' }, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PARAMETERS');
    });
  });
});
