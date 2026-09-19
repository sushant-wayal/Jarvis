import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GmailClient, GmailUserProfile } from '../GmailClient';

export class GetProfileTool extends BaseIntegrationTool<Record<string, never>, GmailUserProfile> {
  constructor(client: GmailClient) {
    super({
      id: 'gmail.get_profile',
      name: 'gmail.get_profile',
      description: 'Get user profile information for the authenticated Gmail account (email address, total messages, total threads)',
      integrationId: 'gmail',
      category: 'COMMUNICATION',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const profile = await client.getProfile();
        return {
          success: true,
          data: profile,
          message: `Connected to Gmail account: ${profile.emailAddress} (${profile.messagesTotal} messages, ${profile.threadsTotal} threads).`,
        };
      },
    });
  }
}
