import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthMemory } from '../NorthClient';

export class QueryMemoriesTool extends BaseIntegrationTool<
  Record<string, never>,
  { memories: NorthMemory[]; count: number }
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.query_memories',
      name: 'north.query_memories',
      description:
        'Retrieve stored financial memories, user preferences, and advisor conversations with calculated expiry metadata from North.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const memories = await client.queryMemories();
        return {
          success: true,
          data: { memories, count: memories.length },
          message: `Retrieved ${memories.length} stored financial memories and preferences.`,
        };
      },
    });
  }
}
