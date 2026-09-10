/**
 * Date and Timezone Utilities for Jarvis Task and Reminder Scheduling
 */

/**
 * Returns the IANA timezone offset string for a given date (e.g. "+05:30", "-04:00", "+00:00")
 */
export function getTimezoneOffsetString(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart && tzPart.value) {
      const match = tzPart.value.match(/GMT([+-]\d{2}:\d{2})/);
      if (match) return match[1];
      if (tzPart.value === 'GMT') return '+00:00';
    }
  } catch {
    // Fallback if timezone invalid
  }
  return '+00:00';
}

/**
 * Formats a Date into an ISO 8601 string including the user's local timezone offset.
 * Example for Asia/Kolkata: "2026-09-05T09:30:00+05:30"
 */
export function getLocalIsoString(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const formatted = formatter.format(date).replace(', ', 'T');
    const offset = getTimezoneOffsetString(date, timeZone);
    return `${formatted}${offset}`;
  } catch {
    return date.toISOString();
  }
}

/**
 * Get current year, month, day, hour, minute in a specified timezone.
 */
function getPartsInTimezone(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getVal = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    return {
      year: getVal('year'),
      month: getVal('month'), // 1-indexed
      day: getVal('day'),
      hour: getVal('hour') === 24 ? 0 : getVal('hour'),
      minute: getVal('minute'),
      second: getVal('second'),
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  }
}

/**
 * Robustly parses a schedule string (ISO, natural time, or relative offset)
 * taking the user's active timezone into account.
 */
export function parseScheduleDate(scheduleStr?: string, timeZone: string = 'UTC'): Date {
  if (!scheduleStr) {
    return new Date(Date.now() + 60 * 60 * 1000); // 1 hour default
  }

  const raw = scheduleStr.trim();
  const lower = raw.toLowerCase();

  // 1. Relative parser: "in X minutes", "in X hours", "in X days"
  const relMatch = lower.match(/^in\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i);
  if (relMatch) {
    const amount = parseFloat(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    let ms = 60 * 60 * 1000;
    if (unit.startsWith('m')) {
      ms = amount * 60 * 1000;
    } else if (unit.startsWith('h')) {
      ms = amount * 60 * 60 * 1000;
    } else if (unit.startsWith('d')) {
      ms = amount * 24 * 60 * 60 * 1000;
    }
    return new Date(Date.now() + ms);
  }

  // 2. Full ISO with timezone offset: e.g. "2026-09-05T09:30:00+05:30" or "-04:00"
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:?\d{2})$/.test(raw)) {
    const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. ISO without timezone offset: e.g. "2026-09-05T09:30:00"
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?$/.test(raw)) {
    const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
    const offset = getTimezoneOffsetString(new Date(), timeZone);
    const withOffset = `${normalized}${offset}`;
    const d = new Date(withOffset);
    if (!isNaN(d.getTime())) return d;
  }

  // 4. Time expression: e.g. "9:30", "09:30", "9:30 AM", "9:30 PM", "tomorrow at 9:30 AM"
  const timeRegex = /(?:(today|tomorrow)\s+(?:at\s+)?)?(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i;
  const timeMatch = lower.match(timeRegex);
  if (timeMatch) {
    const daySpec = timeMatch[1]?.toLowerCase();
    let hours = parseInt(timeMatch[2], 10);
    const minutes = parseInt(timeMatch[3], 10);
    const meridiem = timeMatch[4]?.toLowerCase();

    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    const now = new Date();
    const currentParts = getPartsInTimezone(now, timeZone);

    let targetYear = currentParts.year;
    let targetMonth = currentParts.month;
    let targetDay = currentParts.day;

    if (daySpec === 'tomorrow') {
      targetDay += 1;
    } else if (daySpec !== 'today') {
      // If no day specified and time is already past today, roll over to tomorrow
      if (hours < currentParts.hour || (hours === currentParts.hour && minutes <= currentParts.minute)) {
        targetDay += 1;
      }
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const offset = getTimezoneOffsetString(now, timeZone);
    const dateStr = `${targetYear}-${pad(targetMonth)}-${pad(targetDay)}T${pad(hours)}:${pad(minutes)}:00${offset}`;
    const targetDate = new Date(dateStr);
    if (!isNaN(targetDate.getTime())) return targetDate;
  }

  // 5. Standard Date parse fallback
  const directDate = new Date(raw);
  if (!isNaN(directDate.getTime())) {
    return directDate;
  }

  // 6. Tomorrow relative keyword fallback
  if (lower.includes('tomorrow')) {
    const now = new Date();
    const currentParts = getPartsInTimezone(now, timeZone);
    const pad = (n: number) => String(n).padStart(2, '0');
    const offset = getTimezoneOffsetString(now, timeZone);
    const dateStr = `${currentParts.year}-${pad(currentParts.month)}-${pad(currentParts.day + 1)}T09:00:00${offset}`;
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }

  return new Date(Date.now() + 60 * 60 * 1000);
}

/**
 * Semantically resolves any natural language date/time expression into an accurate Date object using LLM reasoning.
 */
export async function resolveScheduleDateLLM(scheduleStr: string, timeZone = 'UTC'): Promise<Date> {
  const trimmed = scheduleStr.trim();
  if (!trimmed) return new Date(Date.now() + 3600000);

  // If already full ISO format, parse directly
  const direct = new Date(trimmed);
  if (!isNaN(direct.getTime()) && trimmed.includes('T')) {
    return direct;
  }

  try {
    const { aiClient, FAST_FALLBACK_MODELS } = await import('@/lib/ai/gemini');
    const now = new Date();
    const currentLocalIso = getLocalIsoString(now, timeZone);
    const prompt = `Current local ISO time is: ${currentLocalIso} (Timezone: ${timeZone}).
The user requested a schedule time: "${trimmed}".
Convert this schedule request into an exact ISO 8601 string taking into account the user's current local time and timezone.
Respond strictly with JSON: {"isoString": "YYYY-MM-DDTHH:mm:ss+offset"}`;

    const res = await aiClient.models.generateContent({
      model: FAST_FALLBACK_MODELS[0] || 'gemini-flash-lite-latest',
      contents: prompt,
    });

    const text = res.text?.trim() || '';
    const cleanJson = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    if (cleanJson) {
      const parsed = JSON.parse(cleanJson) as { isoString?: string };
      if (parsed.isoString) {
        const d = new Date(parsed.isoString);
        if (!isNaN(d.getTime())) return d;
      }
    }
  } catch {
    // Fall back to parseScheduleDate
  }

  return parseScheduleDate(scheduleStr, timeZone);
}
