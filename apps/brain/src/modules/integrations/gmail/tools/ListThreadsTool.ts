import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GmailClient, GmailThreadSummary } from '../GmailClient';

export class ListThreadsTool extends BaseIntegrationTool<
  { query?: string; labelIds?: string[]; maxResults?: number },
  { threads: GmailThreadSummary[] }
> {
  constructor(client: GmailClient) {
    super({
      id: 'gmail.list_threads',
      name: 'gmail.list_threads',
      description: 'List email conversation threads matching optional query or labels',
      integrationId: 'gmail',
      category: 'COMMUNICATION',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        query: z.string().optional().describe('Search filter for conversation threads'),
        labelIds: z.array(z.string()).optional().describe('Filter threads by label IDs, e.g. ["INBOX"]'),
        maxResults: z.coerce.number().min(1).max(20).default(10).describe('Max number of threads to return'),
      }),
      executor: async (input) => {
        const result = await client.listThreads({
          query: input.query,
          labelIds: input.labelIds,
          maxResults: input.maxResults || 10,
        });

        return {
          success: true,
          data: { threads: result.threads },
          message: `Retrieved ${result.threads.length} email thread(s).`,
        };
      },
    });
  }
}
