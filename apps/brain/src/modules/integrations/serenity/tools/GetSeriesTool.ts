import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenitySeriesItem } from '../SerenityClient';

export class GetSeriesTool extends BaseIntegrationTool<
  Record<string, never>,
  SerenitySeriesItem[]
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.get_series',
      name: 'serenity.get_series',
      description:
        'Retrieves all educational video series in Serenity, tracking learning goals, published episode history, and queued syllabus episodes.',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const seriesList = await client.getSeries();
        return {
          success: true,
          data: seriesList,
          message: `Retrieved ${seriesList.length} educational video series.`,
        };
      },
    });
  }
}
