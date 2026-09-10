import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { TemplateClient } from '../TemplateClient';

export class ExampleWriteTool extends BaseIntegrationTool<
  { name: string; metadata?: Record<string, unknown> },
  Record<string, unknown>
> {
  constructor(client: TemplateClient) {
    super({
      id: 'template_service.create_item',
      name: 'template_service_create_item',
      description: 'Create a new item in the external service (requires user confirmation)',
      integrationId: 'template_service',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        name: z.string().min(1).describe('Resource name'),
        metadata: z.record(z.unknown()).optional().describe('Optional resource properties'),
      }),
      executor: async (input) => {
        const result = await client.createResource(input.name, input.metadata);
        return {
          success: true,
          data: result,
          message: `Created resource "${input.name}" successfully.`,
        };
      },
    });
  }
}
