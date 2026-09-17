import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient } from '../NorthClient';

export class GetFinancialContextTool extends BaseIntegrationTool<
  Record<string, never>,
  { filename: string; content: string }
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.get_financial_context',
      name: 'north.get_financial_context',
      description:
        'Fetch the complete, unified financial context snapshot of the user (net worth, bank balance, burn rate, emergency fund, recent transactions, goals, subscriptions, and AI memories) as structured markdown.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const context = await client.getFinancialContext();
        return {
          success: true,
          data: context,
          message: `Retrieved complete financial context snapshot (${context.filename}).`,
        };
      },
    });
  }
}
