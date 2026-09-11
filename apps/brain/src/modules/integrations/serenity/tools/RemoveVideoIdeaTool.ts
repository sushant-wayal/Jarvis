import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenityIdeasQueue } from '../SerenityClient';

export class RemoveVideoIdeaTool extends BaseIntegrationTool<
  { index?: number; clearAll?: boolean },
  SerenityIdeasQueue
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.remove_video_idea',
      name: 'serenity.remove_video_idea',
      description:
        'Removes a specific video topic idea by index or clears the entire Serenity backlog queue (requires user confirmation).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'DESTRUCTIVE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        index: z
          .coerce.number()
          .min(0)
          .optional()
          .describe('0-based index of the specific idea to remove.'),
        clearAll: z
          .boolean()
          .optional()
          .describe('Set to true to clear all ideas from the backlog queue.'),
      }),
      executor: async (input) => {
        if (input.clearAll) {
          const queue = await client.clearIdeas();
          return {
            success: true,
            data: queue,
            message: 'Successfully cleared all ideas from the backlog queue.',
          };
        }

        if (input.index !== undefined) {
          const queue = await client.removeIdea(input.index);
          return {
            success: true,
            data: queue,
            message: `Successfully removed idea at position ${input.index}. Queue now has ${queue.count} item(s).`,
          };
        }

        return {
          success: false,
          data: null,
          message: 'Either index or clearAll must be provided.',
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Provide index to delete a specific idea or clearAll=true to wipe the queue.',
          },
        };
      },
    });
  }
}
