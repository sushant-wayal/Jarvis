import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GmailClient } from '../GmailClient';

export class ModifyEmailLabelsTool extends BaseIntegrationTool<
  { id: string; addLabelIds?: string[]; removeLabelIds?: string[] },
  { id: string; labelIds: string[] }
> {
  constructor(client: GmailClient) {
    super({
      id: 'gmail.modify_labels',
      name: 'gmail.modify_labels',
      description: 'Modify labels on an email (e.g., mark as read by removing UNREAD, star, archive by removing INBOX)',
      integrationId: 'gmail',
      category: 'COMMUNICATION',
      actionType: 'WRITE',
      riskLevel: 'LOW_RISK',
      requiresConfirmation: false,
      inputSchema: z.object({
        id: z.string().min(1).describe('The unique Gmail message ID'),
        addLabelIds: z.array(z.string()).optional().describe('Labels to add (e.g. ["STARRED", "IMPORTANT"])'),
        removeLabelIds: z.array(z.string()).optional().describe('Labels to remove (e.g. ["UNREAD"] to mark read, ["INBOX"] to archive)'),
      }),
      executor: async (input) => {
        const result = await client.modifyEmailLabels(
          input.id,
          input.addLabelIds || [],
          input.removeLabelIds || []
        );

        return {
          success: true,
          data: result,
          message: `Successfully updated labels on email ${input.id}. Current labels: ${result.labelIds.join(', ')}`,
        };
      },
    });
  }
}
