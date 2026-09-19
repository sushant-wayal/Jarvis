import { z } from 'zod';
import { BaseIntegrationTool, flexibleBoolean } from '../../integration-tool';
import { DraftSummary, GmailClient } from '../GmailClient';

export class CreateDraftTool extends BaseIntegrationTool<
  { to: string; subject: string; body: string; cc?: string; bcc?: string; threadId?: string; isHtml?: boolean },
  DraftSummary
> {
  constructor(client: GmailClient) {
    super({
      id: 'gmail.create_draft',
      name: 'gmail.create_draft',
      description: 'Create a draft email in Gmail without sending it immediately',
      integrationId: 'gmail',
      category: 'COMMUNICATION',
      actionType: 'WRITE',
      riskLevel: 'LOW_RISK',
      requiresConfirmation: false,
      inputSchema: z.object({
        to: z.string().email().describe('Recipient email address'),
        subject: z.string().min(1).describe('Subject line for the draft email'),
        body: z.string().min(1).describe('Body content of the draft'),
        cc: z.string().optional().describe('Optional CC address(es)'),
        bcc: z.string().optional().describe('Optional BCC address(es)'),
        threadId: z.string().optional().describe('Optional thread ID to attach draft to an existing conversation'),
        isHtml: flexibleBoolean.default(false).describe('Whether content is HTML'),
      }),
      executor: async (input) => {
        const draft = await client.createDraft({
          to: input.to,
          subject: input.subject,
          body: input.body,
          cc: input.cc,
          bcc: input.bcc,
          threadId: input.threadId,
          isHtml: input.isHtml,
        });

        return {
          success: true,
          data: draft,
          message: `Created draft email to "${input.to}" with subject "${input.subject}". Draft ID: ${draft.id}`,
        };
      },
    });
  }
}
