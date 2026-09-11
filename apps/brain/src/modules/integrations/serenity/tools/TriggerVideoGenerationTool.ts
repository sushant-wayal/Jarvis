import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient } from '../SerenityClient';

export class TriggerVideoGenerationTool extends BaseIntegrationTool<
  { videoIdea?: string },
  { success: boolean; message: string; videoIdea?: string }
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.trigger_video_generation',
      name: 'serenity.trigger_video_generation',
      description:
        'Triggers the Serenity automated video generation pipeline immediately via GitHub Actions. Optionally accepts a custom topic idea (requires user confirmation).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        videoIdea: z
          .string()
          .optional()
          .describe(
            'Optional custom topic idea for the video. If omitted, the next idea from the backlog queue is used.'
          ),
      }),
      executor: async (input) => {
        const result = await client.triggerVideoGeneration(input.videoIdea);
        return {
          success: true,
          data: result,
          message: result.message || 'Successfully dispatched video generation workflow.',
        };
      },
    });
  }
}
