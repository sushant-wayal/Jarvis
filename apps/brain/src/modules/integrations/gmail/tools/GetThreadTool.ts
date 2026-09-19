import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GmailClient, GmailThreadSummary } from '../GmailClient';

export class GetThreadTool extends BaseIntegrationTool<{ id: string }, GmailThreadSummary> {
  constructor(client: GmailClient) {
    super({
      id: 'gmail.get_thread',
      name: 'gmail.get_thread',
      description: 'Get an entire email conversation thread including all messages by thread ID',
      integrationId: 'gmail',
      category: 'COMMUNICATION',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        id: z.string().min(1).describe('The unique Gmail thread ID'),
      }),
      executor: async (input) => {
        const thread = await client.getThread(input.id);
        return {
          success: true,
          data: thread,
          message: `Retrieved thread ${thread.id} containing ${thread.messagesCount} message(s).`,
        };
      },
    });
  }
}
