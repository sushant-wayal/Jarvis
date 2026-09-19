import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GmailClient, SendEmailResult } from '../GmailClient';

export class SendEmailTool extends BaseIntegrationTool<
  { to: string; subject: string; body: string; cc?: string; bcc?: string; isHtml?: boolean },
  SendEmailResult
> {
  constructor(client: GmailClient) {
    super({
      id: 'gmail.send_email',
      name: 'gmail.send_email',
      description: 'Send a new email via Gmail (requires user confirmation before sending)',
      integrationId: 'gmail',
      category: 'COMMUNICATION',
      actionType: 'EXTERNAL_ACTION',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        to: z.string().email().describe('Recipient email address (e.g. user@example.com)'),
        subject: z.string().min(1).describe('Email subject line'),
        body: z.string().min(1).describe('Email body text or HTML content'),
        cc: z.string().optional().describe('Optional CC email address(es)'),
        bcc: z.string().optional().describe('Optional BCC email address(es)'),
        isHtml: z.boolean().optional().default(false).describe('Whether body contains HTML formatted markup'),
      }),
      executor: async (input) => {
        const result = await client.sendEmail({
          to: input.to,
          subject: input.subject,
          body: input.body,
          cc: input.cc,
          bcc: input.bcc,
          isHtml: input.isHtml,
        });

        return {
          success: true,
          data: result,
          message: `Successfully sent email to "${input.to}" with subject "${input.subject}". Message ID: ${result.id}`,
        };
      },
    });
  }
}
