import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenityPipelineStatus } from '../SerenityClient';

export class GetPipelineStatusTool extends BaseIntegrationTool<
  Record<string, never>,
  SerenityPipelineStatus
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.get_pipeline_status',
      name: 'serenity.get_pipeline_status',
      description:
        'Checks the real-time execution status of the Serenity autonomous YouTube channel pipeline, including active job stages, generated video URLs, YouTube IDs, and scheduled shorts.',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const status = await client.getPipelineStatus();
        return {
          success: true,
          data: status,
          message: `Serenity pipeline status is "${status.overallStatus}". Active video: "${status.videoTitle || 'None'}".`,
        };
      },
    });
  }
}
