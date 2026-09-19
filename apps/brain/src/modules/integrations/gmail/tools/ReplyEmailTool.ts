import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GmailClient, SendEmailResult } from '../GmailClient';

export class ReplyEmailTool extends BaseIntegrationTool<
  { threadId: string; messageId: string; to: string; subject: string; body: string; cc?: string; isHtml?: boolean },
  SendEmailResult
> {
  constructor(client: GmailClient) {
    super({
      id: 'gmail.reply_email',
      name: 'gmail.reply_email',
      description: 'Reply to an existing email conversation thread in Gmail (requires user confirmation before sending)',
      integrationId: 'gmail',
      category: 'COMMUNICATION',
      actionType: 'EXTERNAL_ACTION',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        threadId: z.string().min(1).describe('Conversation thread ID to reply to'),
        messageId: z.string().min(1).describe('Message ID of the email being replied to'),
        to: z.string().email().describe('Recipient email address'),
        subject: z.string().min(1).describe('Subject of the reply'),
        body: z.string().min(1).describe('Reply message body content'),
        cc: z.string().optional().describe('Optional CC recipient email address(es)'),
        isHtml: z.boolean().optional().default(false).describe('Whether body contains HTML'),
      }),
      executor: async (input) => {
        const result = await client.replyEmail({
          threadId: input.threadId,
          messageId: input.messageId,
          to: input.to,
          subject: input.subject,
          body: input.body,
          cc: input.cc,
          isHtml: input.isHtml,
        });

        return {
          success: true,
          data: result,
          message: `Successfully replied to email thread ${input.threadId}. Message ID: ${result.id}`,
        };
      },
    });
  }
}
