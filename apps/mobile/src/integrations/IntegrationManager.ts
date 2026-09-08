/**
 * IntegrationManager
 * Central orchestrator for all phone integration capabilities.
 *
 * The rest of the app talks only to IntegrationManager — never directly
 * to individual integration modules.
 *
 * Responsibilities:
 *  1. Initialize and hold references to all integrations
 *  2. Execute JarvisPhoneAction descriptors received from the brain
 *  3. Assemble PhoneContext snapshots for brain requests
 *  4. Report back ambiguity and failures for conversational recovery
 */

import {
  ActionResult,
  IntegrationCapabilities,
  JarvisPhoneAction,
  PhoneContext,
  PhoneNotificationEvent,
} from '@jarvis/shared';
import { contactsIntegration } from './ContactsIntegration';
import { phoneIntegration } from './PhoneIntegration';
import { appIntegration } from './AppIntegration';
import { notificationContextStore } from './NotificationContextStore';
import { notificationIntegration } from './NotificationIntegration';
import { notificationReplyExecutor } from './NotificationReplyExecutor';
import { MAX_CONTEXT_EVENTS } from './constants';

export class IntegrationManager {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([
      contactsIntegration.initialize(),
      notificationContextStore.initialize(),
    ]);

    // Start notification listener if available (APK builds)
    if (notificationIntegration.isAvailable()) {
      await notificationIntegration.startListening();
      await notificationIntegration.syncActiveNotifications();
    }

    this.initialized = true;
  }

  // ── Capability map ─────────────────────────────────────────────────────────

  async getCapabilities(): Promise<IntegrationCapabilities> {
    const [canCall, canSms, notifGranted] = await Promise.all([
      phoneIntegration.canMakeCall(),
      phoneIntegration.canSendSms(),
      notificationIntegration.isPermissionGranted(),
    ]);

    return {
      contacts: contactsIntegration.isPermissionGranted(),
      phoneCall: canCall,
      sms: canSms,
      notificationListener: notifGranted,
      notificationReply: false, // Requires APK + listener + active canReply notification
      openApp: true,
    };
  }

  // ── Phone context assembly ─────────────────────────────────────────────────

  /** Build a lightweight PhoneContext snapshot to send with brain requests. */
  async buildPhoneContext(): Promise<PhoneContext> {
    const capabilities = await this.getCapabilities();

    // Proactively sync latest status bar notifications if listener is available
    if (capabilities.notificationListener) {
      await notificationIntegration.syncActiveNotifications().catch(() => false);
    }

    const recentNotifications = notificationContextStore.getRecentEvents(
      undefined,
      MAX_CONTEXT_EVENTS
    );

    let contactsList: import('@jarvis/shared').PhoneContactSummary[] | undefined;
    let aliasesMap: Record<string, string> | undefined;

    if (capabilities.contacts) {
      try {
        const rawContacts = await contactsIntegration.getAllContacts();
        contactsList = rawContacts
          .filter((c) => Boolean(c.name && c.phoneNumbers.length > 0))
          .map((c) => ({
            name: c.name,
            number: c.phoneNumbers[0].number,
            label: c.phoneNumbers[0].label,
          }))
          .slice(0, 150);
        aliasesMap = contactsIntegration.getAliases();
      } catch {
        // Safe fallback
      }
    }

    return {
      recentNotifications,
      capabilities,
      timestamp: new Date().toISOString(),
      contacts: contactsList,
      aliases: aliasesMap,
    };
  }

  // ── Action execution ───────────────────────────────────────────────────────

  /**
   * Execute a JarvisPhoneAction returned by the brain.
   * Returns an ActionResult that the earbud manager can speak back to the user.
   */
  async executeAction(action: JarvisPhoneAction): Promise<ActionResult> {
    const actionType = ((action.type || (action as any).action || '') as string).toUpperCase();
    switch (actionType) {
      case 'CALL_CONTACT':
        return this.executeCall(
          (action as any).contactName,
          (action as any).phoneNumber,
          (action as any).callType,
          (action as any).app,
        );

      case 'SEND_SMS':
        return this.executeSms((action as any).contactName, (action as any).message, (action as any).phoneNumber);

      case 'REPLY_TO_NOTIFICATION':
        return this.executeReply(action as any);

      case 'OPEN_APP':
        return appIntegration.openApp((action as any).app);

      case 'OPEN_CONVERSATION':
        return appIntegration.openConversation(
          (action as any).app,
          (action as any).conversationKey,
          (action as any).phoneNumber,
          (action as any).message,
        );

      case 'PLAY_MEDIA':
        return appIntegration.playMedia(
          (action as any).query,
          (action as any).app,
          (action as any).videoId,
          (action as any).audioUrl,
          (action as any).title,
          (action as any).artist,
          (action as any).artworkUrl,
        );

      case 'OPEN_URL':
        return appIntegration.openUrl((action as any).url);

      default:
        return { success: false, error: `Unknown action type: "${actionType}".` };
    }
  }

  // ── Private action handlers ────────────────────────────────────────────────

  private async executeCall(
    contactName: string,
    preResolvedNumber?: string,
    callType: 'voice' | 'video' = 'voice',
    app: string = 'phone',
  ): Promise<ActionResult> {
    if (preResolvedNumber) {
      return phoneIntegration.makeCall(
        {
          id: 'resolved',
          name: contactName,
          displayName: contactName,
          phoneNumbers: [{ number: preResolvedNumber, label: 'mobile' }],
        },
        callType,
        app,
      );
    }

    // Direct phone number check: if contactName is a phone number (e.g. 7+ digits)
    const cleanDigits = contactName.replace(/[^0-9+*#]/g, '');
    if (cleanDigits.length >= 7) {
      return phoneIntegration.makeCall(
        {
          id: 'direct-number',
          name: contactName,
          displayName: contactName,
          phoneNumbers: [{ number: cleanDigits, label: 'mobile' }],
        },
        callType,
        app,
      );
    }

    if (!contactsIntegration.isPermissionGranted()) {
      return {
        success: false,
        error: 'Contacts permission required to call by name. Please grant it in Settings.',
      };
    }

    const resolution = await contactsIntegration.findContact(contactName);

    if (resolution.error) {
      return { success: false, error: resolution.error };
    }

    if (resolution.ambiguous && resolution.candidates) {
      return {
        success: false,
        ambiguousCandidates: resolution.candidates.map((c) => c.displayName),
        message: `I found multiple contacts: ${resolution.candidates.map((c) => c.displayName).join(', ')}. Which one?`,
      };
    }

    if (!resolution.contact) {
      return { success: false, error: `Couldn't find ${contactName} in your contacts.` };
    }

    return phoneIntegration.makeCall(resolution.contact, callType, app);
  }

  private async executeSms(
    contactName: string,
    message: string,
    preResolvedNumber?: string,
  ): Promise<ActionResult> {
    if (preResolvedNumber) {
      return phoneIntegration.sendSms(
        {
          id: 'resolved',
          name: contactName,
          displayName: contactName,
          phoneNumbers: [{ number: preResolvedNumber, label: 'mobile' }],
        },
        message
      );
    }

    const resolution = await contactsIntegration.findContact(contactName);

    if (resolution.error) return { success: false, error: resolution.error };
    if (resolution.ambiguous && resolution.candidates) {
      return {
        success: false,
        ambiguousCandidates: resolution.candidates.map((c) => c.displayName),
        message: `Multiple contacts named ${contactName}. Which one?`,
      };
    }
    if (!resolution.contact) {
      return { success: false, error: `Couldn't find ${contactName} in your contacts.` };
    }

    return phoneIntegration.sendSms(resolution.contact, message);
  }

  private async executeReply(action: {
    app: string;
    sender: string;
    conversationKey?: string;
    message: string;
    notificationId?: string;
    phoneNumber?: string;
  }): Promise<ActionResult> {
    // Find the matching notification event for canReply + replyActionKey
    const event: PhoneNotificationEvent | null =
      notificationContextStore.getMostRecent(action.sender, action.app) ??
      notificationContextStore.getMostRecent(action.sender);

    if (!event) {
      // Look up contact in device address book to get their phone number if not pre-resolved
      let resolvedNumber = action.phoneNumber;
      if (!resolvedNumber && action.sender) {
        try {
          const resolution = await contactsIntegration.findContact(action.sender);
          if (resolution.contact?.phoneNumbers?.[0]?.number) {
            resolvedNumber = resolution.contact.phoneNumbers[0].number;
          }
        } catch {
          // Fall back
        }
      }

      // No stored event (or in Expo Go) — open conversation with pre-filled message
      return appIntegration.openConversation(
        action.app,
        action.conversationKey,
        resolvedNumber,
        action.message
      );
    }

    return notificationReplyExecutor.reply(event, action.message);
  }

  // ── Notification ingestion (called by NotificationIntegration) ─────────────

  ingestNotification(event: PhoneNotificationEvent): void {
    notificationContextStore.ingest(event);
  }
}

export const integrationManager = new IntegrationManager();
