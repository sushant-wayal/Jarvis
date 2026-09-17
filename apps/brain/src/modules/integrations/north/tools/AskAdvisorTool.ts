import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient } from '../NorthClient';

export class AskAdvisorTool extends BaseIntegrationTool<
  {
    question: string;
    history?: Array<{ role: string; content: string }>;
  },
  unknown
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.ask_advisor',
      name: 'north.ask_advisor',
      description:
        'Delegate multi-step financial planning questions directly to North embedded advisor agentic loop.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        question: z.string().min(1).describe('Financial question for the North embedded advisor'),
        history: z
          .array(
            z.object({
              role: z.string(),
              content: z.string(),
            })
          )
          .optional()
          .describe('Optional previous dialogue history for conversational context'),
      }),
      executor: async ({ question, history }) => {
        const result = await client.askAdvisor(question, history || []);
        return {
          success: true,
          data: result,
          message: 'Received response from North embedded financial advisor.',
        };
      },
    });
  }
}
