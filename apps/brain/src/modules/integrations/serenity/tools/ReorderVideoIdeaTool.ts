import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenityIdeasQueue } from '../SerenityClient';

export class ReorderVideoIdeaTool extends BaseIntegrationTool<
  { index: number; newIndex: number },
  SerenityIdeasQueue
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.reorder_video_idea',
      name: 'serenity.reorder_video_idea',
      description:
        'Moves a video idea to a new priority position in the Serenity backlog queue (requires user confirmation).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        index: z.coerce.number().min(0).describe('Current 0-based index of the idea in the queue.'),
        newIndex: z.coerce.number().min(0).describe('Target 0-based index to move the idea to (0 is highest priority).'),
      }),
      executor: async (input) => {
        const queue = await client.reorderIdea(input.index, input.newIndex);
        return {
          success: true,
          data: queue,
          message: `Successfully moved idea from position ${input.index} to ${input.newIndex}.`,
        };
      },
    });
  }
}
