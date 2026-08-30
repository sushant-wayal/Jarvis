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
      const granted = await notificationIntegration.isPermissionGranted();
      if (granted) {
        await notificationIntegration.startListening();
      }
    }

    this.initialized = true;
  }

  // ── Capability map ─────────────────────────────────────────────────────────

  async getCapabilities(): Promise<IntegrationCapabilities> {
    const [canCall, canSms] = await Promise.all([
      phoneIntegration.canMakeCall(),
      phoneIntegration.canSendSms(),
    ]);

    return {
      contacts: contactsIntegration.isPermissionGranted(),
      phoneCall: canCall,
      sms: canSms,
      notificationListener: notificationIntegration.isAvailable(),
      notificationReply: false, // Requires APK + listener + active canReply notification
      openApp: true,
    };
  }

  // ── Phone context assembly ─────────────────────────────────────────────────

  /** Build a lightweight PhoneContext snapshot to send with brain requests. */
  async buildPhoneContext(): Promise<PhoneContext> {
    const capabilities = await this.getCapabilities();
    const recentNotifications = notificationContextStore.getRecentEvents(
      undefined,
      MAX_CONTEXT_EVENTS
    );

    return {
      recentNotifications,
      capabilities,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Action execution ───────────────────────────────────────────────────────

  /**
   * Execute a JarvisPhoneAction returned by the brain.
   * Returns an ActionResult that the earbud manager can speak back to the user.
   */
  async executeAction(action: JarvisPhoneAction): Promise<ActionResult> {
    switch (action.type) {
      case 'CALL_CONTACT':
        return this.executeCall(action.contactName, action.phoneNumber);

      case 'SEND_SMS':
        return this.executeSms(action.contactName, action.message, action.phoneNumber);

      case 'REPLY_TO_NOTIFICATION':
        return this.executeReply(action);

      case 'OPEN_APP':
        return appIntegration.openApp(action.app);

      case 'OPEN_CONVERSATION':
        return appIntegration.openConversation(
          action.app,
          action.conversationKey,
          undefined,
        );

      default:
        return { success: false, error: 'Unknown action type.' };
    }
  }

  // ── Private action handlers ────────────────────────────────────────────────

  private async executeCall(
    contactName: string,
    preResolvedNumber?: string,
  ): Promise<ActionResult> {
    if (preResolvedNumber) {
      return phoneIntegration.makeCall({
        id: 'resolved',
        name: contactName,
        displayName: contactName,
        phoneNumbers: [{ number: preResolvedNumber, label: 'mobile' }],
      });
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

    return phoneIntegration.makeCall(resolution.contact);
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
  }): Promise<ActionResult> {
    // Find the matching notification event for canReply + replyActionKey
    const event: PhoneNotificationEvent | null =
      notificationContextStore.getMostRecent(action.sender, action.app) ??
      notificationContextStore.getMostRecent(action.sender);

    if (!event) {
      // No stored event — fall back to opening the app/conversation
      return appIntegration.openConversation(
        action.app,
        action.conversationKey,
        undefined
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
