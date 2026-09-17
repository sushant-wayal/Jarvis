import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient } from '../NorthClient';

export class RecordInvestmentTool extends BaseIntegrationTool<
  { notes?: string },
  { ok: boolean; message?: string }
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.record_investment',
      name: 'north.record_investment',
      description:
        'Record that the current monthly cycle investment was completed and increment the investment streak.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      permissions: ['financial:write'],
      inputSchema: z.object({
        notes: z.string().optional().describe('Optional notes on where funds were invested (e.g. SIP via Zerodha/Kuvera)'),
      }),
      executor: async ({ notes }) => {
        const result = await client.recordInvestment(notes);
        return {
          success: true,
          data: result,
          message: result.message || 'Investment cycle recorded successfully and streak updated.',
        };
      },
    });
  }
}
