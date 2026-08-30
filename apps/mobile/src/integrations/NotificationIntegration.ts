/**
 * NotificationIntegration
 * Bridge to the Android NotificationListenerService.
 *
 * ⚠️  EXPO GO COMPATIBILITY
 * This module degrades gracefully in Expo Go:
 *  - isAvailable() returns false
 *  - The notification store will remain empty
 *  - All other integration features (contacts, calls, app opening) still work
 *
 * ⚠️  APK BUILD REQUIREMENT
 * Full notification interception requires a custom EAS build that includes the
 * JarvisNotificationListenerService.kt native module. See docs/notification-listener.md
 * for setup instructions.
 *
 * When the APK is built and the service is active, this module receives
 * raw Android notifications and normalises them into PhoneNotificationEvent objects
 * before passing them to the NotificationContextStore.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { PhoneNotificationEvent } from '@jarvis/shared';
import { PACKAGE_TO_APP } from './constants';
import { notificationContextStore } from './NotificationContextStore';

// The native module is only present in APK builds
const JarvisNotificationListener = NativeModules.JarvisNotificationListener as {
  isServiceRunning: () => Promise<boolean>;
  requestListenerPermission: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
} | undefined;

export class NotificationIntegration {
  private emitter: NativeEventEmitter | null = null;
  private subscription: { remove: () => void } | null = null;
  private running = false;

  /** True only in APK builds where the native module is present. */
  isAvailable(): boolean {
    return Platform.OS === 'android' && Boolean(JarvisNotificationListener);
  }

  /** Request the Android BIND_NOTIFICATION_LISTENER_SERVICE permission. */
  async requestPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
    if (!this.isAvailable()) return 'unavailable';
    try {
      await JarvisNotificationListener!.requestListenerPermission();
      const running = await JarvisNotificationListener!.isServiceRunning();
      return running ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  async isPermissionGranted(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return JarvisNotificationListener!.isServiceRunning();
    } catch {
      return false;
    }
  }

  /** Start listening for incoming notifications. */
  async startListening(): Promise<void> {
    if (!this.isAvailable() || this.running) return;

    try {
      await JarvisNotificationListener!.startListening();
      this.emitter = new NativeEventEmitter(NativeModules.JarvisNotificationListener);
      this.subscription = this.emitter.addListener(
        'onNotificationPosted',
        this.handleRawNotification.bind(this)
      );
      this.running = true;
    } catch {
      this.running = false;
    }
  }

  /** Stop listening and clean up the event subscription. */
  stopListening(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.running = false;
    try {
      JarvisNotificationListener?.stopListening();
    } catch {
      // Non-critical
    }
  }

  isListening(): boolean {
    return this.running;
  }

  // ── Raw notification parser ─────────────────────────────────────────────

  private handleRawNotification(raw: Record<string, unknown>): void {
    const event = this.parseRawNotification(raw);
    if (event) {
      notificationContextStore.ingest(event);
    }
  }

  /**
   * Parse a raw Android notification payload into a normalized PhoneNotificationEvent.
   * Returns null if the notification should be ignored (e.g. unknown app, no sender).
   */
  parseRawNotification(raw: Record<string, unknown>): PhoneNotificationEvent | null {
    const packageName = String(raw.packageName ?? '');
    const app = PACKAGE_TO_APP[packageName];

    if (!app) return null; // Not a tracked app

    const sender = String(
      raw.title ?? raw.sender ?? raw.extraTitle ?? ''
    ).trim();

    if (!sender) return null; // Can't use a notification with no sender

    const content = raw.text ? String(raw.text).trim() : undefined;
    const notificationId = String(raw.id ?? raw.notificationId ?? `${Date.now()}`);

    return {
      id: notificationId,
      app,
      packageName,
      sender,
      content,
      timestamp: new Date(Number(raw.postTime ?? Date.now())).toISOString(),
      conversationKey: raw.conversationId
        ? String(raw.conversationId)
        : raw.tag
        ? String(raw.tag)
        : undefined,
      canReply: Boolean(raw.hasReplyAction),
      replyActionKey: raw.replyActionKey ? String(raw.replyActionKey) : undefined,
      threadId: raw.threadId ? String(raw.threadId) : undefined,
    };
  }
}

export const notificationIntegration = new NotificationIntegration();
