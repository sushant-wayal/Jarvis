import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityAnalytics, SerenityClient } from '../SerenityClient';

export class GetAnalyticsTool extends BaseIntegrationTool<
  { daysBack?: number; limit?: number },
  SerenityAnalytics
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.get_analytics',
      name: 'serenity.get_analytics',
      description:
        'Retrieves live YouTube channel analytics and recent video engagement statistics (views, impressions, CTR, retention, likes, comments).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        daysBack: z
          .coerce.number()
          .min(1)
          .max(90)
          .default(30)
          .optional()
          .describe('Time window in days for video performance metrics (default: 30, max: 90).'),
        limit: z
          .coerce.number()
          .min(1)
          .max(50)
          .default(10)
          .optional()
          .describe('Maximum number of recent videos to analyze (default: 10, max: 50).'),
      }),
      executor: async (input) => {
        const analytics = await client.getAnalytics(input.daysBack || 30, input.limit || 10);
        return {
          success: true,
          data: analytics,
          message: `Channel "${analytics.channel.title}" has ${analytics.channel.subscriberCount} subscribers and ${analytics.channel.viewCount} total views. Analyzed ${analytics.recentVideos.length} recent videos.`,
        };
      },
    });
  }
}
