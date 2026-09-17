import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthSubscription } from '../NorthClient';

export class GetSubscriptionsTool extends BaseIntegrationTool<
  Record<string, never>,
  { subscriptions: NorthSubscription[]; count: number; totalMonthlyBurn: number }
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.get_subscriptions',
      name: 'north.get_subscriptions',
      description: 'Fetch all active recurring subscriptions and calculated monthly burn rate from North.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const subscriptions = await client.getSubscriptions();
        const active = subscriptions.filter((s) => s.active !== false);
        const totalMonthlyBurn = active.reduce((acc, curr) => acc + (curr.amount || 0), 0);
        return {
          success: true,
          data: {
            subscriptions,
            count: subscriptions.length,
            totalMonthlyBurn,
          },
          message: `Retrieved ${subscriptions.length} subscriptions (${active.length} active). Total monthly subscription burn: ₹${totalMonthlyBurn.toLocaleString('en-IN')}.`,
        };
      },
    });
  }
}
