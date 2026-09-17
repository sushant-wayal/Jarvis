import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthNetworth } from '../NorthClient';

export class GetNetworthTool extends BaseIntegrationTool<
  Record<string, never>,
  NorthNetworth
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.get_networth',
      name: 'north.get_networth',
      description:
        'Fetch complete net worth breakdown across liquid cash, mutual funds, stocks, EPF/PPF, real estate, vehicles, and liabilities.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const networth = await client.getNetworth();
        const totalNet = networth.totals?.networth ?? 0;
        const totalAssets = networth.totals?.assets ?? 0;
        const totalLiabilities = networth.totals?.liabilities ?? 0;
        return {
          success: true,
          data: networth,
          message: `Total Net Worth: ₹${totalNet.toLocaleString('en-IN')} (Assets: ₹${totalAssets.toLocaleString('en-IN')}, Liabilities: ₹${totalLiabilities.toLocaleString('en-IN')}).`,
        };
      },
    });
  }
}
