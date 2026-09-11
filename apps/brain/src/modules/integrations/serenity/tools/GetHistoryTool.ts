import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenityRunHistoryItem } from '../SerenityClient';

export class GetHistoryTool extends BaseIntegrationTool<
  { limit?: number },
  SerenityRunHistoryItem[]
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.get_history',
      name: 'serenity.get_history',
      description:
        'Fetches the historical archive of past Serenity video generation runs, including video titles, YouTube IDs, video URLs, and statuses.',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        limit: z
          .coerce.number()
          .min(1)
          .max(50)
          .default(10)
          .optional()
          .describe('Number of past generation runs to retrieve (default: 10, max: 50).'),
      }),
      executor: async (input) => {
        const runs = await client.getHistory(input.limit || 10);
        return {
          success: true,
          data: runs,
          message: `Retrieved ${runs.length} past video generation runs.`,
        };
      },
    });
  }
}
