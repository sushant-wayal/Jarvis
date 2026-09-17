import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthGoal } from '../NorthClient';

export class CreateGoalTool extends BaseIntegrationTool<
  {
    title: string;
    targetAmount: number;
    targetDate?: string;
    priority?: number;
    initialAllocation?: number;
    notes?: string;
  },
  NorthGoal
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.create_goal',
      name: 'north.create_goal',
      description: 'Create a new financial savings goal or milestone in North.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      permissions: ['financial:write'],
      inputSchema: z.object({
        title: z.string().min(1).describe('Goal title (e.g. Emergency Fund, Japan Vacation, Down Payment)'),
        targetAmount: z.number().positive().describe('Target amount in INR'),
        targetDate: z.string().optional().describe('Target completion date (YYYY-MM-DD)'),
        priority: z.number().int().min(1).max(5).default(1).describe('Priority 1 (highest) to 5 (lowest)'),
        initialAllocation: z.number().nonnegative().optional().describe('Initial amount already allocated'),
        notes: z.string().optional().describe('Optional notes or description'),
      }),
      executor: async (input) => {
        const goal = await client.createGoal(input);
        return {
          success: true,
          data: goal,
          message: `Created financial goal "${input.title}" with target ₹${input.targetAmount.toLocaleString('en-IN')}.`,
        };
      },
    });
  }
}
