import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenityScheduleTimes } from '../SerenityClient';

export class UpdateScheduleTool extends BaseIntegrationTool<
  { shortsTimes?: string[]; longFormTime?: string },
  SerenityScheduleTimes
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.update_schedule',
      name: 'serenity.update_schedule',
      description:
        'Updates the scheduled publishing timetable in Indian Standard Time (IST) for long-form videos and daily Shorts (requires user confirmation).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        longFormTime: z
          .string()
          .optional()
          .describe('Daily release time in 24h HH:MM format IST (e.g., "18:30").'),
        shortsTimes: z
          .array(z.string())
          .optional()
          .describe(
            'Array of daily release times for YouTube Shorts in 24h HH:MM format IST (e.g., ["12:00", "16:30", "18:00", "20:00"]).'
          ),
      }),
      executor: async (input) => {
        const schedule = await client.updateScheduleTimes(input);
        return {
          success: true,
          data: schedule,
          message: `Successfully updated schedule. Long-form: ${schedule.longFormTime || 'unchanged'}, Shorts: [${schedule.shortsTimes.join(', ')}].`,
        };
      },
    });
  }
}
