import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { TemplateClient } from '../TemplateClient';

export class ExampleReadTool extends BaseIntegrationTool<
  { id: string },
  Record<string, unknown>
> {
  constructor(client: TemplateClient) {
    super({
      id: 'template_service.get_item',
      name: 'template_service_get_item',
      description: 'Retrieve an item by ID from the external service',
      integrationId: 'template_service',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        id: z.string().min(1).describe('Resource identifier'),
      }),
      executor: async (input) => {
        const item = await client.getResource(input.id);
        return {
          success: true,
          data: item,
          message: `Retrieved resource ${input.id} successfully.`,
        };
      },
    });
  }
}
