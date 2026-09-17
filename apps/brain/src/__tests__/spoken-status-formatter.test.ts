import { describe, expect, it } from 'vitest';
import {
  spokenStatusFormatter,
  StatusSpeechThrottler,
} from '../modules/brain/spoken-status-formatter';

describe('SpokenStatusFormatter', () => {
  it('formats media playback tools into natural, clean spoken status', () => {
    const status1 = spokenStatusFormatter.formatToolStatus('play_media', {
      query: 'Believer by Imagine Dragons',
      app: 'spotify',
    });
    expect(status1).toBe('Finding Believer by Imagine Dragons for you, sir.');

    const status2 = spokenStatusFormatter.formatToolStatus('control_media', {
      command: 'pause',
    });
    expect(status2).toBe('Pausing playback.');

    const status3 = spokenStatusFormatter.formatToolStatus('control_media', {
      command: 'next',
    });
    expect(status3).toBe('Skipping to the next track.');
  });

  it('formats web search tools with clean search subject', () => {
    const status = spokenStatusFormatter.formatToolStatus('web_search', {
      query: 'what is quantum computing news today',
    });
    expect(status).toContain('Searching the web for');
    expect(status).not.toContain('```');
  });

  it('formats weather query status with location name', () => {
    const status = spokenStatusFormatter.formatToolStatus('weather_get', {
      location: 'Mumbai',
    });
    expect(status).toBe('Checking the latest weather conditions for Mumbai...');
  });

  it('formats GitHub code intelligence tools without leaking prompt details', () => {
    const status1 = spokenStatusFormatter.formatToolStatus('github_search_code', {
      query: 'auth middleware',
    });
    expect(status1).toBe('Scanning the codebase for auth middleware...');

    const status2 = spokenStatusFormatter.formatToolStatus('github_get_file_content', {
      path: 'src/modules/auth/jwt.ts',
    });
    expect(status2).toBe('Inspecting jwt.ts...');
  });

  it('formats contact search and phone communications gracefully', () => {
    const status1 = spokenStatusFormatter.formatToolStatus('contact_search', {
      query: 'Rahul',
    });
    expect(status1).toBe('Looking up Rahul in your contacts...');

    const status2 = spokenStatusFormatter.formatToolStatus('initiate_phone_call', {
      contactName: 'John',
    });
    expect(status2).toBe('Preparing to place the call to John...');
  });

  it('formats reminders and tasks respectfully', () => {
    const status = spokenStatusFormatter.formatToolStatus('event_reminder_create', {
      title: 'Call doctor',
    });
    expect(status).toBe('Scheduling that for you now, sir.');
  });

  it('falls back to safe, dignified phrasing for unknown tools', () => {
    const status = spokenStatusFormatter.formatToolStatus('unknown_custom_tool', {});
    expect(status).toBe('Looking into that for you now, sir.');
  });
});

describe('StatusSpeechThrottler', () => {
  it('enforces maximum updates and interval cooldown', () => {
    const throttler = new StatusSpeechThrottler(2, 200);

    expect(throttler.shouldSpeak()).toBe(true);
    throttler.recordSpoken();
    expect(throttler.getCount()).toBe(1);

    // Immediate second call should be throttled by min interval
    expect(throttler.shouldSpeak()).toBe(false);

    // After interval expires, second call is permitted
    const originalNow = Date.now;
    try {
      Date.now = () => originalNow() + 300;
      expect(throttler.shouldSpeak()).toBe(true);
      throttler.recordSpoken();
      expect(throttler.getCount()).toBe(2);

      // Max updates reached (2 of 2)
      Date.now = () => originalNow() + 1000;
      expect(throttler.shouldSpeak()).toBe(false);
    } finally {
      Date.now = originalNow;
    }
  });
});
