import { z } from 'zod';
import { JarvisTool } from './types';

const CurrentTimeInputSchema = z.object({
  timezone: z
    .string()
    .optional()
    .describe('IANA Timezone name, e.g. "Asia/Kolkata", "America/New_York", "Europe/London", "UTC"'),
  city: z
    .string()
    .optional()
    .describe('City name if timezone is unknown, e.g. "London", "Tokyo"'),
});

const CITY_TIMEZONES: Record<string, string> = {
  london: 'Europe/London',
  'new york': 'America/New_York',
  tokyo: 'Asia/Tokyo',
  paris: 'Europe/Paris',
  sydney: 'Australia/Sydney',
  delhi: 'Asia/Kolkata',
  mumbai: 'Asia/Kolkata',
};

export const currentTimeTool: JarvisTool<z.infer<typeof CurrentTimeInputSchema>, { time: string; timezone: string; formatted: string }> = {
  name: 'current_time',
  description: 'Returns the current time and day for a specific timezone or city, or user context local time.',
  inputSchema: CurrentTimeInputSchema,
  async execute(input, context) {
    let tz = input.timezone || context.timezone || 'UTC';

    if (input.city) {
      const normalizedCity = input.city.toLowerCase().trim();
      if (CITY_TIMEZONES[normalizedCity]) {
        tz = CITY_TIMEZONES[normalizedCity];
      }
    }

    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true,
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      const formatted = formatter.format(now);
      return {
        time: now.toISOString(),
        timezone: tz,
        formatted,
      };
    } catch {
      // Fallback if timezone string was invalid
      const fallbackFormatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        weekday: 'long',
      });
      return {
        time: new Date().toISOString(),
        timezone: 'UTC',
        formatted: fallbackFormatter.format(new Date()),
      };
    }
  },
};
