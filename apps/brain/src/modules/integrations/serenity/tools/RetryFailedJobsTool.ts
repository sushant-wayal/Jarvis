import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient } from '../SerenityClient';

export class RetryFailedJobsTool extends BaseIntegrationTool<
  { runId?: number | string },
  { ok: boolean; message: string; runId?: number | string }
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.retry_failed_jobs',
      name: 'serenity.retry_failed_jobs',
      description:
        'Reruns only the failed steps of the latest or specified Serenity pipeline run without reprocessing completed steps (requires user confirmation).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        runId: z
          .union([z.number(), z.string()])
          .optional()
          .describe(
            'Optional GitHub Actions workflow run ID. If omitted, retries the latest failed run automatically.'
          ),
      }),
      executor: async (input) => {
        const result = await client.retryFailedJobs(input.runId);
        return {
          success: true,
          data: result,
          message: result.message || 'Successfully triggered rerun for failed jobs.',
        };
      },
    });
  }
}
