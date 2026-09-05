/**
 * NotificationContextStore
 * Privacy-conscious local store for captured notification events.
 *
 * Design principles:
 *  - In-memory first (fast access), backed by AsyncStorage for persistence.
 *  - Per-app enable/disable controlled by user.
 *  - Content storage is opt-in (default: enabled, user can disable).
 *  - Auto-purge based on configurable TTL (default 24 h).
 *  - Never logs message content — only log-safe metadata (sender, app, timestamp).
 *  - Maximum 100 events total; oldest are evicted first.
 *
 * Note: In Expo Go the store will be empty because the NotificationListenerService
 * requires an APK build. All other functionality (contacts, calls, app opening) works.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PhoneNotificationEvent } from '@jarvis/shared';
import {
  DEFAULT_RETENTION_MS,
  MAX_NOTIFICATION_STORE_SIZE,
  STORAGE_KEYS,
} from './constants';

export interface NotificationStoreSettings {
  /** Per-app enable flags. Key: friendly app name ('whatsapp', etc.) */
  enabledApps: Record<string, boolean>;
  /** When false, content is stripped before storage */
  storeContent: boolean;
  /** Retention window in milliseconds */
  retentionMs: number;
}

const DEFAULT_SETTINGS: NotificationStoreSettings = {
  enabledApps: {
    whatsapp: true,
    instagram: true,
    telegram: true,
    sms: true,
    gmail: false,
    discord: false,
    slack: false,
    messenger: true,
  },
  storeContent: true,
  retentionMs: DEFAULT_RETENTION_MS,
};

export type TemporalPeriod =
  | 'today'
  | 'yesterday'
  | 'this_morning'
  | 'last_night'
  | 'recently'
  | 'this_week';

export interface MessageFilter {
  sender?: string;
  app?: string;
  period?: TemporalPeriod;
  query?: string;
}

export class NotificationContextStore {
  private events: PhoneNotificationEvent[] = [];
  private settings: NotificationStoreSettings = DEFAULT_SETTINGS;
  private loaded = false;

  async initialize(): Promise<void> {
    if (this.loaded) return;
    await Promise.all([this.loadEvents(), this.loadSettings()]);
    this.purgeExpired();
    this.loaded = true;
  }

  // ── Ingestion ──────────────────────────────────────────────────────────────

  /** Add a new notification event, respecting privacy settings. */
  ingest(event: PhoneNotificationEvent): void {
    const isAppEnabled =
      this.settings.enabledApps[event.app] ??
      (event.app === 'whatsapp_business' ? this.settings.enabledApps['whatsapp'] ?? true : true);
    if (!isAppEnabled) return;

    const processed: PhoneNotificationEvent = {
      ...event,
      // Strip content if user has disabled content storage
      content: this.settings.storeContent ? event.content : undefined,
    };

    // Avoid exact duplicates
    const isDupe = this.events.some(
      (e) => e.id === processed.id || (e.sender === processed.sender && e.timestamp === processed.timestamp)
    );
    if (isDupe) return;

    this.events.unshift(processed);

    // Evict oldest if over capacity
    if (this.events.length > MAX_NOTIFICATION_STORE_SIZE) {
      this.events = this.events.slice(0, MAX_NOTIFICATION_STORE_SIZE);
    }

    // Persist (fire and forget — no await to keep ingestion fast)
    void this.saveEvents();
  }

  // ── Retrieval ──────────────────────────────────────────────────────────────

  /** Recent events, optionally filtered. Results are most-recent-first. */
  getRecentEvents(filter?: MessageFilter, limit = 20): PhoneNotificationEvent[] {
    this.purgeExpired();
    let results = [...this.events];

    if (filter?.app) {
      results = results.filter((e) => e.app === filter.app);
    }

    if (filter?.sender) {
      const q = filter.sender.toLowerCase();
      results = results.filter((e) => e.sender.toLowerCase().includes(q));
    }

    if (filter?.period) {
      const { start, end } = this.resolvePeriod(filter.period);
      results = results.filter((e) => {
        const t = new Date(e.timestamp).getTime();
        return t >= start && t <= end;
      });
    }

    if (filter?.query) {
      const q = filter.query.toLowerCase();
      results = results.filter((e) =>
        e.content?.toLowerCase().includes(q) ||
        e.sender.toLowerCase().includes(q)
      );
    }

    return results.slice(0, limit);
  }

  /** All events from a specific sender across all apps */
  getConversationContext(sender: string, app?: string): PhoneNotificationEvent[] {
    this.purgeExpired();
    const q = sender.toLowerCase();
    return this.events
      .filter(
        (e) =>
          e.sender.toLowerCase().includes(q) &&
          (!app || e.app === app)
      )
      .slice(0, 30);
  }

  /** Semantic search over stored events (simple substring match) */
  searchEvents(query: string, limit = 10): PhoneNotificationEvent[] {
    this.purgeExpired();
    const q = query.toLowerCase();
    return this.events
      .filter(
        (e) =>
          e.content?.toLowerCase().includes(q) ||
          e.sender.toLowerCase().includes(q) ||
          e.app.toLowerCase().includes(q)
      )
      .slice(0, limit);
  }

  /** Most recent event from a given sender (across all apps, or a specific app) */
  getMostRecent(sender: string, app?: string): PhoneNotificationEvent | null {
    const matches = this.getConversationContext(sender, app);
    return matches[0] ?? null;
  }

  size(): number {
    return this.events.length;
  }

  // ── Privacy controls ───────────────────────────────────────────────────────

  async clearAll(): Promise<void> {
    this.events = [];
    await AsyncStorage.removeItem(STORAGE_KEYS.NOTIFICATION_STORE);
  }

  async clearByApp(app: string): Promise<void> {
    this.events = this.events.filter((e) => e.app !== app);
    await this.saveEvents();
  }

  async updateSettings(partial: Partial<NotificationStoreSettings>): Promise<void> {
    await this.initialize();
    this.settings = {
      ...this.settings,
      ...partial,
      enabledApps: partial.enabledApps
        ? { ...this.settings.enabledApps, ...partial.enabledApps }
        : this.settings.enabledApps,
    };
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_SETTINGS, JSON.stringify(this.settings));
    // Strip content from existing events if user just disabled storage
    if (partial.storeContent === false) {
      this.events = this.events.map((e) => ({ ...e, content: undefined }));
      await this.saveEvents();
    }
  }

  getSettings(): NotificationStoreSettings {
    return { ...this.settings };
  }

  // ── Temporal resolution ───────────────────────────────────────────────────

  private resolvePeriod(period: TemporalPeriod): { start: number; end: number } {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    switch (period) {
      case 'today':
        return { start: todayStart, end: now };
      case 'yesterday': {
        const yStart = todayStart - 86_400_000;
        return { start: yStart, end: todayStart - 1 };
      }
      case 'this_morning':
        return { start: todayStart, end: todayStart + 12 * 3_600_000 };
      case 'last_night': {
        const lnStart = todayStart - 86_400_000 + 18 * 3_600_000;
        return { start: lnStart, end: todayStart };
      }
      case 'recently':
        return { start: now - 3 * 3_600_000, end: now };
      case 'this_week':
        return { start: now - 7 * 86_400_000, end: now };
      default:
        return { start: now - 24 * 3_600_000, end: now };
    }
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private purgeExpired(): void {
    const cutoff = Date.now() - this.settings.retentionMs;
    this.events = this.events.filter(
      (e) => new Date(e.timestamp).getTime() > cutoff
    );
  }

  private async loadEvents(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_STORE);
      if (raw) {
        this.events = JSON.parse(raw) as PhoneNotificationEvent[];
      }
    } catch {
      this.events = [];
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_SETTINGS);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NotificationStoreSettings>;
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          enabledApps: {
            ...DEFAULT_SETTINGS.enabledApps,
            ...(parsed.enabledApps ?? {}),
          },
        };
      }
    } catch {
      this.settings = DEFAULT_SETTINGS;
    }
  }

  private async saveEvents(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_STORE, JSON.stringify(this.events));
    } catch {
      // Non-critical — in-memory state is still valid
    }
  }
}

export const notificationContextStore = new NotificationContextStore();
