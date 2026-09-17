import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthGoal } from '../NorthClient';

export class GetGoalsTool extends BaseIntegrationTool<
  Record<string, never>,
  { goals: NorthGoal[]; count: number }
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.get_goals',
      name: 'north.get_goals',
      description:
        'Fetch all financial savings goals, target amounts, saved amounts, deadlines, and monthly progress recommendations.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const goals = await client.getGoals();
        return {
          success: true,
          data: { goals, count: goals.length },
          message: `Retrieved ${goals.length} financial goals.`,
        };
      },
    });
  }
}
