import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient } from '../NorthClient';

export class TriggerGmailSyncTool extends BaseIntegrationTool<
  Record<string, never>,
  { ok: boolean; message?: string }
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.trigger_gmail_sync',
      name: 'north.trigger_gmail_sync',
      description:
        'Trigger an immediate background scan and sync of bank/UPI transaction notification emails via Gmail API in North.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'EXTERNAL_ACTION',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      permissions: ['financial:write'],
      inputSchema: z.object({}),
      executor: async () => {
        const result = await client.triggerGmailSync();
        return {
          success: true,
          data: result,
          message: result.message || 'Triggered Gmail transaction email sync successfully.',
        };
      },
    });
  }
}
