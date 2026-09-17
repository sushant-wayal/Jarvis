import { IntermediateStatusType, IntermediateStatusUpdate } from '@jarvis/shared';

export interface SpokenStatusOptions {
  toolName?: string;
  toolInput?: Record<string, unknown>;
  stepNumber?: number;
  statusType?: IntermediateStatusType;
}

export class SpokenStatusFormatter {
  /**
   * Formats a clean, natural, personality-appropriate spoken sentence in Jarvis's tone.
   * STRICT SAFETY: Never reveals raw internal chain-of-thought, system prompts, or raw parameters.
   */
  public formatToolStatus(toolName: string, input?: Record<string, unknown>): string {
    const norm = (toolName || '').toLowerCase().replace(/[._-]/g, '');

    // Media & Music
    if (norm.includes('playmedia')) {
      const q = typeof input?.query === 'string' ? input.query.trim() : '';
      if (q) {
        const truncated = q.length > 40 ? q.slice(0, 37) + '...' : q;
        return `Finding ${truncated} for you, sir.`;
      }
      return 'Finding that track for you, sir.';
    }

    if (norm.includes('controlmedia')) {
      const command = typeof input?.command === 'string' ? input.command.toLowerCase() : '';
      if (command === 'pause') return 'Pausing playback.';
      if (command === 'resume') return 'Resuming playback.';
      if (command === 'next') return 'Skipping to the next track.';
      return 'Updating audio playback.';
    }

    // Web Search
    if (norm.includes('websearch') || norm.includes('tavily') || norm.includes('searchweb')) {
      const q = typeof input?.query === 'string' ? input.query.trim() : '';
      if (q) {
        const cleanQ = q.replace(/^(search for|find|look up|what is|who is)\s+/i, '');
        const truncated = cleanQ.length > 35 ? cleanQ.slice(0, 32) + '...' : cleanQ;
        return `Searching the web for ${truncated}...`;
      }
      return 'Searching the web for the latest updates...';
    }

    // Weather
    if (norm.includes('weather')) {
      const loc = typeof input?.location === 'string' ? input.location.trim() : '';
      if (loc) {
        return `Checking the latest weather conditions for ${loc}...`;
      }
      return 'Checking the current weather report...';
    }

    // GitHub & Code Intelligence
    if (norm.includes('githubsearchcode')) {
      const q = typeof input?.query === 'string' ? input.query.trim() : '';
      if (q) {
        const truncated = q.length > 30 ? q.slice(0, 27) + '...' : q;
        return `Scanning the codebase for ${truncated}...`;
      }
      return 'Scanning the repository codebase...';
    }

    if (norm.includes('githubgetfilecontent')) {
      const p = typeof input?.path === 'string' ? input.path.split('/').pop() : '';
      if (p) {
        return `Inspecting ${p}...`;
      }
      return 'Reading the requested source files...';
    }

    if (norm.includes('githubgetrepositorytree') || norm.includes('githubgetrepositoryoverview')) {
      return 'Mapping the repository structure...';
    }

    if (norm.includes('githubgetpullrequests') || norm.includes('githubgetpullrequest')) {
      return 'Checking the pull requests...';
    }

    if (norm.includes('githubgetrepositories')) {
      return 'Checking your GitHub repositories...';
    }

    // Contacts & Phone Communications
    if (norm.includes('contactsearch') || norm.includes('getcontact')) {
      const name = typeof input?.name === 'string' || typeof input?.query === 'string'
        ? (input.name || input.query) as string
        : '';
      if (name.trim()) {
        return `Looking up ${name.trim()} in your contacts...`;
      }
      return 'Checking your contacts directory...';
    }

    if (norm.includes('initiatephonecall')) {
      const contact = typeof input?.contactName === 'string' ? input.contactName : '';
      if (contact) {
        return `Preparing to place the call to ${contact}...`;
      }
      return 'Preparing to place the phone call...';
    }

    if (norm.includes('sendsms')) {
      const to = typeof input?.recipient === 'string' ? input.recipient : '';
      if (to) {
        return `Preparing your message to ${to}...`;
      }
      return 'Preparing the text message...';
    }

    if (norm.includes('openapplication')) {
      const app = typeof input?.appName === 'string' ? input.appName : '';
      if (app) {
        return `Opening ${app}...`;
      }
      return 'Launching the application...';
    }

    // Tasks & Reminders
    if (norm.includes('taskcreate') || norm.includes('eventremindercreate') || norm.includes('eventcreate')) {
      return 'Scheduling that for you now, sir.';
    }

    if (norm.includes('tasklist') || norm.includes('reminderlist')) {
      return 'Reviewing your scheduled tasks and reminders...';
    }

    // Memory & Recall
    if (norm.includes('memorysearch') || norm.includes('memoryquery')) {
      return 'Recalling that from memory, sir...';
    }

    // Default polite assistant progress update
    return 'Looking into that for you now, sir.';
  }

  /**
   * Formats a synthesis or deep reasoning update
   */
  public formatSynthesisStatus(): string {
    return 'Analyzing the gathered information...';
  }
}

export const spokenStatusFormatter = new SpokenStatusFormatter();

/**
 * Throttles spoken intermediate updates per request turn:
 * - Max 2 intermediate spoken updates per turn
 * - Minimum 3000ms cooldown between updates
 */
export class StatusSpeechThrottler {
  private count = 0;
  private lastSpokenTime = 0;
  private readonly maxUpdates: number;
  private readonly minIntervalMs: number;

  constructor(maxUpdates = 2, minIntervalMs = 3000) {
    this.maxUpdates = maxUpdates;
    this.minIntervalMs = minIntervalMs;
  }

  public shouldSpeak(): boolean {
    if (this.count >= this.maxUpdates) {
      return false;
    }
    const now = Date.now();
    if (now - this.lastSpokenTime < this.minIntervalMs) {
      return false;
    }
    return true;
  }

  public recordSpoken(): void {
    this.count++;
    this.lastSpokenTime = Date.now();
  }

  public getCount(): number {
    return this.count;
  }
}
