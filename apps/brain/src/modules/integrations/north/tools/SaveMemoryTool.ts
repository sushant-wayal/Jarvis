import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient } from '../NorthClient';

export class SaveMemoryTool extends BaseIntegrationTool<
  {
    key?: string;
    conversationId?: string;
    question?: string;
    response?: string;
    value?: string;
    tags?: string[];
  },
  unknown
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.save_memory',
      name: 'north.save_memory',
      description:
        'Store or update a financial memory, user preference, or advisor conversation with automatic title and expiry evaluation in North.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      permissions: ['financial:write'],
      inputSchema: z.object({
        key: z.string().optional().describe('Unique key or identifier (optional if conversationId is provided)'),
        conversationId: z.string().optional().describe('Conversation ID for chat threads (e.g. chat_171892348574)'),
        question: z.string().optional().describe('User question for the conversation thread'),
        response: z.string().optional().describe('AI response content or summary'),
        value: z.string().optional().describe('Generic value or JSON string for preference memory'),
        tags: z.array(z.string()).optional().describe('Tags associated with memory (e.g. ["chat", "advisor"])'),
      }),
      executor: async (input) => {
        const result = await client.saveMemory(input);
        return {
          success: true,
          data: result,
          message: 'Saved financial memory or conversation thread into North successfully.',
        };
      },
    });
  }
}
