import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenityThumbnailPreview } from '../SerenityClient';

export class GenerateThumbnailTool extends BaseIntegrationTool<
  {
    videoId: string;
    title: string;
    narration?: string;
    tags?: string[];
    style?: string;
  },
  SerenityThumbnailPreview
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.generate_thumbnail',
      name: 'serenity.generate_thumbnail',
      description:
        'Generates an on-demand AI thumbnail for a video and uploads it to storage (requires user confirmation).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        videoId: z.string().min(1).describe('Target video ID for the thumbnail.'),
        title: z.string().min(1).describe('Video title to visualize on thumbnail.'),
        narration: z.string().optional().describe('Contextual narration summary to inspire the visual scene.'),
        tags: z.array(z.string()).optional().describe('Keywords or tags describing the video topic.'),
        style: z.string().optional().describe('Visual style (e.g., "minimal", "cyberpunk", "cinematic").'),
      }),
      executor: async (input) => {
        const thumb = await client.generateThumbnail(input);
        return {
          success: true,
          data: thumb,
          message: `Successfully generated thumbnail for "${thumb.title}". URL: ${thumb.thumbnailUrl}`,
        };
      },
    });
  }
}
