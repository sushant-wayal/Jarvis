import { describe, expect, it } from 'vitest';
import {
  getLocalIsoString,
  getTimezoneOffsetString,
  parseScheduleDate,
} from '../modules/tasks/date-parser';

describe('Task Timezone & Date Parser', () => {
  it('computes correct offset for Asia/Kolkata', () => {
    const d = new Date('2026-09-05T00:00:00Z');
    const offset = getTimezoneOffsetString(d, 'Asia/Kolkata');
    expect(offset).toBe('+05:30');
  });

  it('formats local ISO string with offset for Asia/Kolkata', () => {
    // 04:00 UTC = 09:30 IST (+05:30)
    const d = new Date('2026-09-05T04:00:00Z');
    const localIso = getLocalIsoString(d, 'Asia/Kolkata');
    expect(localIso).toBe('2026-09-05T09:30:00+05:30');
  });

  it('parses ISO string with offset without altering intended moment', () => {
    const parsed = parseScheduleDate('2026-09-05T09:30:00+05:30', 'Asia/Kolkata');
    // 9:30 AM IST is 04:00 UTC
    expect(parsed.toISOString()).toBe('2026-09-05T04:00:00.000Z');
  });

  it('parses ISO without offset using user timezone', () => {
    const parsed = parseScheduleDate('2026-09-05T09:30:00', 'Asia/Kolkata');
    expect(parsed.toISOString()).toBe('2026-09-05T04:00:00.000Z');
  });

  it('parses natural time expression in user timezone', () => {
    const parsed = parseScheduleDate('today at 9:30 AM', 'Asia/Kolkata');
    const localIso = getLocalIsoString(parsed, 'Asia/Kolkata');
    expect(localIso).toContain('09:30:00+05:30');
  });

  it('parses relative expression "in 15 minutes"', () => {
    const before = Date.now();
    const parsed = parseScheduleDate('in 15 minutes', 'Asia/Kolkata');
    const diffMin = (parsed.getTime() - before) / (60 * 1000);
    expect(diffMin).toBeGreaterThanOrEqual(14.9);
    expect(diffMin).toBeLessThanOrEqual(15.1);
  });
});
