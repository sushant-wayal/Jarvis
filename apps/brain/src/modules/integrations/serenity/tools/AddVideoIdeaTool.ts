import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenityIdeasQueue } from '../SerenityClient';

export class AddVideoIdeaTool extends BaseIntegrationTool<
  { idea: string },
  SerenityIdeasQueue
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.add_video_idea',
      name: 'serenity.add_video_idea',
      description:
        'Appends a new video topic idea to the Serenity backlog queue for automated daily production (requires user confirmation).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        idea: z
          .string()
          .min(1)
          .describe('Title or concept of the video topic to add (e.g. "Why Event-Driven Architecture Fails at Scale").'),
      }),
      executor: async (input) => {
        const queue = await client.addIdea(input.idea);
        return {
          success: true,
          data: queue,
          message: `Successfully added "${input.idea}" to the ideas queue. Queue now has ${queue.count} item(s).`,
        };
      },
    });
  }
}
