import { z } from 'zod';
import { BaseIntegrationTool, flexibleBoolean } from '../../integration-tool';
import { GmailClient, GmailMessageSummary } from '../GmailClient';

export class ListEmailsTool extends BaseIntegrationTool<
  { query?: string; labelIds?: string[]; maxResults?: number; includeSpamTrash?: boolean },
  { messages: GmailMessageSummary[]; totalEstimated?: number }
> {
  constructor(client: GmailClient) {
    super({
      id: 'gmail.list_emails',
      name: 'gmail.list_emails',
      description: 'Search and list emails in Gmail using search queries, labels (e.g., INBOX, UNREAD), or filters',
      integrationId: 'gmail',
      category: 'COMMUNICATION',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        query: z.string().optional().describe('Gmail search filter (e.g., "from:alice is:unread", "subject:meeting")'),
        labelIds: z.array(z.string()).optional().describe('Label filters, e.g. ["INBOX", "UNREAD", "STARRED"]'),
        maxResults: z.coerce.number().min(1).max(30).default(10).describe('Maximum number of emails to return (1-30)'),
        includeSpamTrash: flexibleBoolean.optional().describe('Include spam and trash in results'),
      }),
      executor: async (input) => {
        const result = await client.listEmails({
          query: input.query,
          labelIds: input.labelIds,
          maxResults: input.maxResults || 10,
          includeSpamTrash: input.includeSpamTrash,
        });

        const count = result.messages.length;
        return {
          success: true,
          data: result,
          message: count > 0 ? `Found ${count} email(s) in Gmail.` : 'No emails found matching your query.',
        };
      },
    });
  }
}
