/**
 * NotificationReplyExecutor
 * Executes a reply to a notification using RemoteInput (APK only) or falls back
 * gracefully to opening the conversation / app.
 *
 * Capability detection:
 *  - canReply: derived from PhoneNotificationEvent.canReply
 *  - In Expo Go: canReply is always false (no notification listener, no RemoteInput)
 *  - In APK build: canReply reflects the actual notification capability
 *
 * Fallback chain:
 *  1. RemoteInput direct reply (APK + canReply)
 *  2. Open specific conversation deep-link (if conversationKey available)
 *  3. Open app root
 *
 * Jarvis NEVER claims success unless the message was actually sent.
 */

import { ActionResult, PhoneNotificationEvent } from '@jarvis/shared';
import { appIntegration } from './AppIntegration';

export class NotificationReplyExecutor {
  /**
   * Attempt to reply to a notification.
   * Falls back gracefully when direct reply is not available.
   */
  async reply(
    event: PhoneNotificationEvent,
    message: string,
  ): Promise<ActionResult> {
    // Direct reply via RemoteInput (requires APK build with notification listener)
    if (event.canReply && event.replyActionKey) {
      return this.directReply(event, message);
    }

    // No direct reply available — use fallback chain
    return this.fallbackReply(event, message);
  }

  /**
   * Check whether a direct reply is possible for this event.
   * In Expo Go this always returns false.
   */
  canReplyDirectly(event: PhoneNotificationEvent): boolean {
    return Boolean(event.canReply && event.replyActionKey);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Direct reply via native RemoteInput (APK builds only).
   * This is a stub — the actual native module call would be injected
   * via NativeModules.JarvisNotificationReply when the APK build is active.
   */
  private async directReply(
    event: PhoneNotificationEvent,
    message: string,
  ): Promise<ActionResult> {
    try {
      // Attempt to use the native reply module (APK only)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { NativeModules } = require('react-native');
      const replyModule = (NativeModules.JarvisNotificationListener ||
        NativeModules.JarvisNotificationReply ||
        NativeModules.JarvisEarbudModule) as {
        replyToNotification: (key: string, message: string) => Promise<boolean>;
      } | undefined;

      if (!replyModule?.replyToNotification) {
        // Native module not present (Expo Go) — fall through to fallback
        return this.fallbackReply(event, message);
      }

      const sent = await replyModule.replyToNotification(event.replyActionKey!, message);
      if (sent) {
        return { success: true, message: 'Sent.' };
      }
      // Native module returned failure — try fallback
      return this.fallbackReply(event, message, 'native-reply-failed');
    } catch {
      return this.fallbackReply(event, message, 'native-reply-error');
    }
  }

  /** Fallback: open conversation or app without sending the message. */
  private async fallbackReply(
    event: PhoneNotificationEvent,
    _message: string,
    reason = 'direct-reply-unavailable',
  ): Promise<ActionResult> {
    // Try to open the specific conversation
    if (event.conversationKey) {
      const conversationResult = await appIntegration.openConversation(
        event.app,
        event.conversationKey,
      );

      if (conversationResult.success) {
        return {
          success: false,
          fallbackUsed: true,
          fallbackReason: reason,
          message: `I can't reply directly. Opening your ${event.app} conversation with ${event.sender}.`,
        };
      }
    }

    // Try to open the app root
    const appResult = await appIntegration.openApp(event.app);
    if (appResult.success) {
      return {
        success: false,
        fallbackUsed: true,
        fallbackReason: reason,
        message: `I can't reply directly. Opening ${event.app}.`,
      };
    }

    // Complete failure
    return {
      success: false,
      fallbackUsed: true,
      fallbackReason: reason,
      message: `I couldn't send that reply. ${event.app} may not be installed.`,
      error: appResult.error,
    };
  }
}

export const notificationReplyExecutor = new NotificationReplyExecutor();
