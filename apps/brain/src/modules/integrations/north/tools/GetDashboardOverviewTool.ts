import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthOverviewData } from '../NorthClient';

export class GetDashboardOverviewTool extends BaseIntegrationTool<
  Record<string, never>,
  NorthOverviewData
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.get_dashboard_overview',
      name: 'north.get_dashboard_overview',
      description:
        'Fetch the financial health score, net worth totals, liquid balance, runway months, burn rate, and current savings rate.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const overview = await client.getDashboardOverview();
        const score = overview.financialHealthScore?.score;
        const networth = overview.networthSummary?.totals?.networth;
        const balance = overview.metrics?.balance;
        return {
          success: true,
          data: overview,
          message: `Financial Health Score: ${score ?? 'N/A'}/100. Net worth: ₹${networth?.toLocaleString('en-IN') ?? 'N/A'}. Liquid balance: ₹${balance?.toLocaleString('en-IN') ?? 'N/A'}.`,
        };
      },
    });
  }
}
