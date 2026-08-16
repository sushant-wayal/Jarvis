import { z } from 'zod';
import { JarvisTool } from './types';

const DateTimeInputSchema = z.object({
  targetDayOfWeek: z
    .string()
    .optional()
    .describe('Target day of week to calculate days until, e.g. "Friday", "Monday"'),
});

export const dateTimeTool: JarvisTool<z.infer<typeof DateTimeInputSchema>, { date: string; dayOfWeek: string; daysUntilTarget?: number; targetDay?: string }> = {
  name: 'date_time',
  description: "Returns today's full date or calculates days until a specific weekday (e.g. Friday).",
  inputSchema: DateTimeInputSchema,
  async execute(input, context) {
    const now = new Date();
    const daysMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    const currentDayIndex = now.getDay();
    let daysUntilTarget: number | undefined;

    if (input.targetDayOfWeek) {
      const targetIndex = daysMap[input.targetDayOfWeek.toLowerCase().trim()];
      if (targetIndex !== undefined) {
        daysUntilTarget = (targetIndex - currentDayIndex + 7) % 7;
        if (daysUntilTarget === 0) daysUntilTarget = 7;
      }
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: context.timezone || 'UTC',
      dateStyle: 'full',
    });

    return {
      date: formatter.format(now),
      dayOfWeek: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now),
      daysUntilTarget,
      targetDay: input.targetDayOfWeek,
    };
  },
};
