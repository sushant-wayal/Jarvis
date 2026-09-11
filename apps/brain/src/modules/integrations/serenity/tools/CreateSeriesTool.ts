import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient } from '../SerenityClient';

export class CreateSeriesTool extends BaseIntegrationTool<
  { id: string; title: string; learningGoal: string },
  { success: boolean; message: string }
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.create_series',
      name: 'serenity.create_series',
      description:
        'Creates a new multi-episode educational video series in Serenity with an AI-curated curriculum (requires user confirmation).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        id: z
          .string()
          .min(1)
          .describe('Unique slug identifier for the series (e.g., "system-design-mastery", "rust-internals").'),
        title: z.string().min(1).describe('Series title (e.g., "System Design Mastery").'),
        learningGoal: z
          .string()
          .min(1)
          .describe('High-level educational learning objective of the series.'),
      }),
      executor: async (input) => {
        const result = await client.createSeries(input);
        return {
          success: true,
          data: result,
          message: result.message || `Successfully created series "${input.title}".`,
        };
      },
    });
  }
}
