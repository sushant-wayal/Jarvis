import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthEmergencyFundStatus } from '../NorthClient';

export class GetEmergencyFundStatusTool extends BaseIntegrationTool<
  Record<string, never>,
  NorthEmergencyFundStatus
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.get_emergency_fund_status',
      name: 'north.get_emergency_fund_status',
      description:
        'Fetch emergency fund coverage, target amount, saved amount, shortfall, tier, and recommended monthly drip.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const ef = await client.getEmergencyFundStatus();
        return {
          success: true,
          data: ef,
          message: `Emergency fund progress: ${ef.progressPct?.toFixed(1) ?? 0}% (₹${ef.savedAmount?.toLocaleString('en-IN') ?? 0} of ₹${ef.targetAmount?.toLocaleString('en-IN') ?? 0}). Shortfall: ₹${ef.shortfall?.toLocaleString('en-IN') ?? 0}.`,
        };
      },
    });
  }
}
