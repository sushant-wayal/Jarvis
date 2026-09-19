import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GmailClient } from '../GmailClient';

export class TrashEmailTool extends BaseIntegrationTool<{ id: string }, { id: string; threadId: string }> {
  constructor(client: GmailClient) {
    super({
      id: 'gmail.trash_email',
      name: 'gmail.trash_email',
      description: 'Move an email to the Trash folder in Gmail (requires user confirmation)',
      integrationId: 'gmail',
      category: 'COMMUNICATION',
      actionType: 'DESTRUCTIVE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        id: z.string().min(1).describe('The unique Gmail message ID to move to trash'),
      }),
      executor: async (input) => {
        const result = await client.trashEmail(input.id);
        return {
          success: true,
          data: result,
          message: `Successfully moved email ${input.id} to trash.`,
        };
      },
    });
  }
}
