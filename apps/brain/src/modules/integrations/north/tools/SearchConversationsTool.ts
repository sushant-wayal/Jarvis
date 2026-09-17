import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthConversation } from '../NorthClient';

export class SearchConversationsTool extends BaseIntegrationTool<
  {
    q?: string;
    page?: number;
    limit?: number;
  },
  {
    conversations: NorthConversation[];
    pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  }
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.search_conversations',
      name: 'north.search_conversations',
      description:
        'Search, filter, and paginate past North AI advisor conversations with titles and calculated expiry metadata.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        q: z.string().optional().describe('Search keyword across conversation title, questions, or responses'),
        page: z.number().int().positive().default(1).describe('Page number (default 1)'),
        limit: z.number().int().positive().max(50).default(10).describe('Items per page (default 10, max 50)'),
      }),
      executor: async (input) => {
        const result = await client.searchConversations(input);
        return {
          success: true,
          data: result,
          message: `Found ${result.pagination.total} conversations matching query (page ${result.pagination.page} of ${result.pagination.totalPages}).`,
        };
      },
    });
  }
}
