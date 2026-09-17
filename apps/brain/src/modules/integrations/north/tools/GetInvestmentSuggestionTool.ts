import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthInvestmentSuggestion } from '../NorthClient';

export class GetInvestmentSuggestionTool extends BaseIntegrationTool<
  Record<string, never>,
  NorthInvestmentSuggestion
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.get_investment_suggestion',
      name: 'north.get_investment_suggestion',
      description:
        'Fetch current monthly investable surplus and recommended allocation across Equity, Debt, and Gold buckets.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const suggestion = await client.getInvestmentSuggestion();
        const total = suggestion.totalInvestable ?? 0;
        const streak = suggestion.streak ?? 0;
        return {
          success: true,
          data: suggestion,
          message: `Investable surplus: ₹${total.toLocaleString('en-IN')}. Phase: ${suggestion.phaseLabel || suggestion.phase || 'N/A'}. Streak: ${streak} cycles.`,
        };
      },
    });
  }
}
