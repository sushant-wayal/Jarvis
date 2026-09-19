import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GmailClient, GmailMessageDetail } from '../GmailClient';

export class GetEmailTool extends BaseIntegrationTool<{ id: string }, GmailMessageDetail> {
  constructor(client: GmailClient) {
    super({
      id: 'gmail.get_email',
      name: 'gmail.get_email',
      description: 'Get full content, headers, body, sender, recipients, and date of a specific email by ID',
      integrationId: 'gmail',
      category: 'COMMUNICATION',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        id: z.string().min(1).describe('The unique Gmail message ID'),
      }),
      executor: async (input) => {
        const email = await client.getEmail(input.id);
        return {
          success: true,
          data: email,
          message: `Retrieved email "${email.subject}" from ${email.from}.`,
        };
      },
    });
  }
}
