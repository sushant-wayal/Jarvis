import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthAffordabilityResult, NorthClient } from '../NorthClient';

export class EvaluateAffordabilityTool extends BaseIntegrationTool<
  { price: number },
  NorthAffordabilityResult
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.evaluate_affordability',
      name: 'north.evaluate_affordability',
      description:
        'Evaluate whether the user can afford a proposed purchase or expense without jeopardizing their runway or emergency fund.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        price: z.number().positive().describe('Price of the planned purchase in INR'),
      }),
      executor: async ({ price }) => {
        const result = await client.evaluateAffordability(price);
        return {
          success: true,
          data: result,
          message: `Verdict: ${result.verdict}. ${result.recommendation} (Projected balance: ₹${result.balanceAfterPurchase?.toLocaleString('en-IN') ?? 'N/A'}, runway: ${result.runwayAfter ?? 'N/A'} months).`,
        };
      },
    });
  }
}
