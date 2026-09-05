/**
 * Phone Tools — Jarvis Brain
 *
 * These tools do NOT execute native Android calls directly.
 * They return structured ACTION DESCRIPTORS that the mobile app executes.
 *
 * The separation means:
 *  - Brain stays platform-agnostic
 *  - Actions are testable without a physical device
 *  - Mobile app is the sole executor of native capabilities
 *
 * Tools registered here:
 *  - initiate_phone_call
 *  - send_message_to_contact
 *  - read_phone_messages
 *  - search_phone_messages
 *  - open_application
 *  - get_phone_capabilities
 */

import { z } from 'zod';
import { PhoneContext, PhoneNotificationEvent } from '@jarvis/shared';
import { JarvisTool } from './types';
import { proactiveIntelligenceService } from '../phone/proactive-intelligence';
import { semanticEntityResolver } from '../brain/semantic-entity-resolver';

// ── Helper ──────────────────────────────────────────────────────────────────

function getPhoneContext(context: { phoneContext?: PhoneContext }): PhoneContext | null {
  return context.phoneContext ?? null;
}

function filterNotifications(
  notifications: PhoneNotificationEvent[],
  sender?: string,
  app?: string,
  query?: string,
  timePeriod?: string
): PhoneNotificationEvent[] {
  let results = [...notifications];

  if (sender) {
    const q = sender.toLowerCase().trim();
    results = results.filter((n) => {
      const s = n.sender.toLowerCase();
      if (s === q) return true;
      // Do not match third-party possessives (e.g. "Darshan's mom") when querying direct relation (e.g. "mom")
      if (/^[a-zA-Z]+'s\s+/i.test(s) && !/^[a-zA-Z]+'s\s+/i.test(q)) {
        return false;
      }
      return s.includes(q);
    });
  }
  if (app) {
    const a = app.toLowerCase();
    results = results.filter((n) => n.app.toLowerCase().includes(a));
  }
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (n) => n.content?.toLowerCase().includes(q) || n.sender.toLowerCase().includes(q)
    );
  }
  if (timePeriod) {
    const now = Date.now();
    const cutoff = (() => {
      switch (timePeriod.toLowerCase()) {
        case 'today': return new Date().setHours(0, 0, 0, 0);
        case 'yesterday': return Date.now() - 2 * 86_400_000;
        case 'this_morning': return new Date().setHours(0, 0, 0, 0);
        case 'last_night': return Date.now() - 86_400_000;
        case 'recently': return now - 3 * 3_600_000;
        case 'this_week': return now - 7 * 86_400_000;
        default: return now - 24 * 3_600_000;
      }
    })();
    results = results.filter((n) => new Date(n.timestamp).getTime() >= cutoff);
  }

  return results;
}

function formatNotificationsForBrain(events: PhoneNotificationEvent[]): string {
  if (!events.length) return 'No messages found.';
  return events
    .slice(0, 10)
    .map((e) =>
      `[${e.app}] ${e.sender} (${new Date(e.timestamp).toLocaleTimeString()}): ${e.content ?? '[content not stored]'}`
    )
    .join('\n');
}

// ── Tools ────────────────────────────────────────────────────────────────────

export const initiatePhoneCallTool: JarvisTool<{ contactName: string; phoneNumber?: string }> = {
  name: 'initiate_phone_call',
  description:
    'Initiate a phone call to a named contact or direct phone number. Returns an action descriptor for the mobile app to execute. Use when the user says "call [name]" or "call [number]".',
  category: 'COMMUNICATION',
  riskLevel: 'LOW_RISK',
  requiresConfirmation: false,
  inputSchema: z.object({
    contactName: z.string().describe('The name of the contact or phone number to call, as spoken by the user.'),
    phoneNumber: z.string().optional().describe('Direct phone number if provided by user or looked up.'),
  }),
  execute: async (input) => {
    const digits = input.contactName.replace(/[^0-9+]/g, '');
    const resolvedNumber = input.phoneNumber || (digits.length >= 7 ? input.contactName : undefined);
    return {
      type: 'CALL_CONTACT' as const,
      action: 'CALL_CONTACT' as const,
      contactName: input.contactName,
      phoneNumber: resolvedNumber,
      response: `Calling ${input.contactName}.`,
    };
  },
};

export const sendMessageToContactTool: JarvisTool<{
  contactName: string;
  message: string;
  preferredApp?: string;
}> = {
  name: 'send_message_to_contact',
  description:
    'Send a text message to a contact. Prefers messaging app notifications if available, otherwise SMS. Returns action descriptor for mobile execution.',
  category: 'COMMUNICATION',
  riskLevel: 'LOW_RISK',
  requiresConfirmation: false,
  inputSchema: z.object({
    contactName: z.string().describe('Name of the contact to message.'),
    message: z.string().describe('The message text to send.'),
    preferredApp: z
      .string()
      .optional()
      .describe(
        'Preferred app: "whatsapp", "telegram", "sms", etc. If omitted, use the app where the most recent conversation was found.'
      ),
  }),
  execute: async (input, context) => {
    const phone = getPhoneContext(context as unknown as { phoneContext?: PhoneContext });
    const userName = context.userName || 'Sushant';
    let targetContactName = input.contactName;

    // Resolve target contact name semantically if contacts exist
    if (phone?.contacts && phone.contacts.length > 0) {
      const resolved = await semanticEntityResolver.resolveContact(
        input.contactName,
        userName,
        phone.contacts,
        phone.aliases
      );
      if (resolved.found && resolved.contact) {
        targetContactName = resolved.contact.name;
      }
    }

    // Try to find recent notification to determine the preferred channel
    const targetLower = targetContactName.toLowerCase();
    const recentEvent = phone?.recentNotifications.find((n) => {
      const s = n.sender.toLowerCase();
      if (s === targetLower) return true;
      if (/^[a-zA-Z]+'s\s+/i.test(s) && !/^[a-zA-Z]+'s\s+/i.test(targetLower)) {
        return false;
      }
      return s.includes(targetLower);
    });

    const resolvedApp = input.preferredApp ?? recentEvent?.app ?? 'sms';

    if (resolvedApp === 'sms') {
      return {
        type: 'SEND_SMS' as const,
        action: 'SEND_SMS' as const,
        contactName: targetContactName,
        message: input.message,
        response: `Sending SMS to ${targetContactName}: "${input.message}"`,
      };
    }

    return {
      type: 'REPLY_TO_NOTIFICATION' as const,
      action: 'REPLY_TO_NOTIFICATION' as const,
      app: resolvedApp,
      sender: targetContactName,
      conversationKey: recentEvent?.conversationKey,
      message: input.message,
      notificationId: recentEvent?.id,
      response: `Sending on ${resolvedApp}: "${input.message}"`,
    };
  },
};

export const readPhoneMessagesTool: JarvisTool<{
  senderName?: string;
  app?: string;
  timePeriod?: string;
}> = {
  name: 'read_phone_messages',
  description:
    'Read recent messages from the device notification context. Use when user asks "what did X say?", "read my messages", "what did he/she send?". Returns a formatted list.',
  category: 'COMMUNICATION',
  riskLevel: 'SAFE',
  requiresConfirmation: false,
  inputSchema: z.object({
    senderName: z.string().optional().describe('Filter by sender name. Leave empty for all senders.'),
    app: z.string().optional().describe('Filter by app: "whatsapp", "instagram", "telegram", "sms". Leave empty for all.'),
    timePeriod: z
      .string()
      .optional()
      .describe(
        'Temporal filter: "today", "yesterday", "this_morning", "last_night", "recently", "this_week". Leave empty for all stored messages.'
      ),
  }),
  execute: async (input, context) => {
    const phone = getPhoneContext(context as unknown as { phoneContext?: PhoneContext });
    if (!phone || !phone.recentNotifications.length) {
      const listenerActive = phone?.capabilities?.notificationListener;
      return {
        messages: [],
        summary: listenerActive
          ? 'You currently have no unread notifications or new messages in your status bar.'
          : 'Notification Access is not enabled for Jarvis. Please grant Notification Access in Android Settings (Special app access > Device & app notifications) so I can read incoming messages.',
        noContext: true,
      };
    }

    const filtered = filterNotifications(
      phone.recentNotifications,
      input.senderName,
      input.app,
      undefined,
      input.timePeriod
    );

    return {
      messages: filtered.slice(0, 10),
      summary: formatNotificationsForBrain(filtered),
      count: filtered.length,
    };
  },
};

export const searchPhoneMessagesTool: JarvisTool<{
  query: string;
  senderName?: string;
}> = {
  name: 'search_phone_messages',
  description:
    'Semantic search over captured notification messages. Use when user asks "did anyone mention X?", "what was said about the meeting?", "find messages about Goa".',
  category: 'COMMUNICATION',
  riskLevel: 'SAFE',
  requiresConfirmation: false,
  inputSchema: z.object({
    query: z.string().describe('The search query or topic to look for in messages.'),
    senderName: z.string().optional().describe('Optionally restrict search to messages from this person.'),
  }),
  execute: async (input, context) => {
    const phone = getPhoneContext(context as unknown as { phoneContext?: PhoneContext });
    if (!phone || !phone.recentNotifications.length) {
      const listenerActive = phone?.capabilities?.notificationListener;
      return {
        results: [],
        summary: listenerActive
          ? 'You currently have no unread notifications or messages in your status bar.'
          : 'Notification Access is not enabled for Jarvis. Please grant Notification Access in Android Settings (Special app access > Device & app notifications) so I can read incoming messages.',
      };
    }

    const filtered = filterNotifications(
      phone.recentNotifications,
      input.senderName,
      undefined,
      input.query
    );

    return {
      results: filtered.slice(0, 10),
      summary: formatNotificationsForBrain(filtered),
      count: filtered.length,
    };
  },
};

export const openApplicationTool: JarvisTool<{ appName: string }> = {
  name: 'open_application',
  description:
    'Open any app on the user\'s phone (e.g. WhatsApp, YouTube, Spotify, Uber, Swiggy, Camera, Calculator, Chrome, Settings, etc.). Returns an action descriptor for the mobile app to execute.',
  category: 'SYSTEM',
  riskLevel: 'SAFE',
  requiresConfirmation: false,
  inputSchema: z.object({
    appName: z.string().describe(
      'The name of the application to open, e.g. "WhatsApp", "YouTube", "Spotify", "Calculator", "Camera", "Uber", etc.'
    ),
  }),
  execute: async (input) => {
    return {
      type: 'OPEN_APP' as const,
      action: 'OPEN_APP' as const,
      app: input.appName.toLowerCase(),
      response: `Opening ${input.appName}.`,
    };
  },
};

export const getPhoneCapabilitiesTool: JarvisTool<Record<string, never>> = {
  name: 'get_phone_capabilities',
  description:
    'Get current phone integration capabilities: what actions are available, whether notification listener is active, etc. Call before attempting phone actions when uncertain.',
  category: 'SYSTEM',
  riskLevel: 'SAFE',
  requiresConfirmation: false,
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const phone = getPhoneContext(context as unknown as { phoneContext?: PhoneContext });
    if (!phone) {
      return {
        available: false,
        reason: 'No phone context received. The mobile app did not include integration data.',
        capabilities: null,
      };
    }
    return {
      available: true,
      capabilities: phone.capabilities,
      recentNotificationCount: phone.recentNotifications.length,
      notificationListenerNote: phone.capabilities.notificationListener
        ? 'Notification listener is active. Can read messages.'
        : 'Notification listener is NOT active (Expo Go). Message reading unavailable until APK build.',
    };
  },
};

export const generateMessageBriefingTool: JarvisTool<{ timePeriod?: string }> = {
  name: 'generate_message_briefing',
  description:
    'Generate a proactive voice summary of all incoming messages across apps (WhatsApp, Instagram, Telegram, SMS). Use when user says "summarize my messages", "what did I miss?", "give me a briefing of today\'s messages", "any new updates?".',
  category: 'COMMUNICATION',
  riskLevel: 'SAFE',
  requiresConfirmation: false,
  inputSchema: z.object({
    timePeriod: z.string().optional().describe('Time filter: "today", "yesterday", "this_morning", "recently", "this_week".'),
  }),
  execute: async (input, context) => {
    const phone = getPhoneContext(context as unknown as { phoneContext?: PhoneContext });
    if (!phone || !phone.recentNotifications.length) {
      const listenerActive = phone?.capabilities?.notificationListener;
      return {
        summary: listenerActive
          ? 'You currently have no new notifications or unread messages across your connected apps.'
          : 'No phone notifications available. Please grant Notification Access for Jarvis in Settings to read messages.',
        totalMessages: 0,
      };
    }
    const briefing = proactiveIntelligenceService.generateBriefing(phone, input.timePeriod);
    return briefing;
  },
};

export const detectUnansweredMessagesTool: JarvisTool<Record<string, never>> = {
  name: 'detect_unanswered_messages',
  description:
    'Identify pending questions, urgent requests, or unanswered messages waiting for the user\'s response across messaging apps. Use when user asks "did anyone ask me something?", "who is waiting for my reply?", "any urgent messages?".',
  category: 'COMMUNICATION',
  riskLevel: 'SAFE',
  requiresConfirmation: false,
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const phone = getPhoneContext(context as unknown as { phoneContext?: PhoneContext });
    if (!phone || !phone.recentNotifications.length) {
      return {
        actionItems: [],
        summary: 'No unread messages found.',
      };
    }
    const items = proactiveIntelligenceService.detectActionItems(phone.recentNotifications);
    return {
      count: items.length,
      actionItems: items,
      summary: items.length > 0
        ? `Found ${items.length} message(s) requiring attention: ${items.map((i) => `${i.sender} on ${i.app}: "${i.questionOrRequest}"`).join(', ')}`
        : 'No pending questions or action requests detected in recent messages.',
    };
  },
};

export const getContactInteractionSummaryTool: JarvisTool<{ contactName: string }> = {
  name: 'get_contact_interaction_summary',
  description:
    'Get a comprehensive summary of all recent messaging activity and conversation history with a specific contact across all apps. Use when user asks "what has Rahul sent?", "summarize my chats with Priya", "what is the context with Dad?".',
  category: 'COMMUNICATION',
  riskLevel: 'SAFE',
  requiresConfirmation: false,
  inputSchema: z.object({
    contactName: z.string().describe('The name of the contact to summarize.'),
  }),
  execute: async (input, context) => {
    const phone = getPhoneContext(context as unknown as { phoneContext?: PhoneContext });
    if (!phone || !phone.recentNotifications.length) {
      return {
        summary: `No message history available for ${input.contactName}.`,
      };
    }
    const summary = proactiveIntelligenceService.summarizeContact(input.contactName, phone);
    return {
      contact: input.contactName,
      summary,
    };
  },
};

export const lookupContactTool: JarvisTool<{ nameOrQuery: string }> = {
  name: 'lookup_contact',
  description:
    'Search for a contact\'s phone number, details, or relation (e.g. "mom", "dad", "Rahul", "Priya") in the user\'s phone contacts. Use when user asks "what is mom\'s number?", "tell me my mom\'s number", "find contact for Rahul", or needs someone\'s phone number or contact details.',
  category: 'COMMUNICATION',
  riskLevel: 'SAFE',
  requiresConfirmation: false,
  inputSchema: z.object({
    nameOrQuery: z.string().describe('The name, relationship, or alias of the contact to look up, e.g. "mom", "dad", "Rahul", "Priya"'),
  }),
  execute: async (input, context) => {
    const phone = getPhoneContext(context as unknown as { phoneContext?: PhoneContext });
    if (!phone) {
      return {
        found: false,
        message: 'Phone context is not available. Please ensure the mobile app is connected.',
      };
    }

    if (!phone.capabilities.contacts) {
      return {
        found: false,
        message: 'Contacts permission has not been granted on the mobile device. Please grant Contacts permission in Settings.',
      };
    }

    const query = input.nameOrQuery.toLowerCase().trim();
    const aliases = phone.aliases || {};
    const targetName = aliases[query] || query;
    const contacts = phone.contacts || [];
    const userName = context.userName || 'Sushant';

    // If alias is a phone number directly, return fast
    if (/^\+?[\d\s\-]{7,15}$/.test(targetName)) {
      return {
        found: true,
        contactName: input.nameOrQuery,
        phoneNumber: targetName,
        label: 'alias',
        formatted: `${input.nameOrQuery}: ${targetName}`,
      };
    }

    // Use Privacy-Masked Semantic Entity & Relationship Resolver
    const resolved = await semanticEntityResolver.resolveContact(
      input.nameOrQuery,
      userName,
      contacts,
      aliases
    );

    if (resolved.found && resolved.contact) {
      return {
        found: true,
        contactName: resolved.contact.name,
        phoneNumber: resolved.contact.number,
        label: resolved.contact.label || 'mobile',
        formatted: resolved.contact.formatted,
        reasoning: resolved.reasoning,
      };
    }

    return {
      found: false,
      status: resolved.status,
      message:
        resolved.disambiguationMessage ||
        `I looked through your contacts but couldn't find anyone matching "${input.nameOrQuery}". You can configure contact aliases in Settings if the name differs in your address book.`,
      availableContactCount: contacts.length,
      reasoning: resolved.reasoning,
    };
  },
};

export const phoneTools = [
  initiatePhoneCallTool,
  sendMessageToContactTool,
  lookupContactTool,
  readPhoneMessagesTool,
  searchPhoneMessagesTool,
  openApplicationTool,
  getPhoneCapabilitiesTool,
  generateMessageBriefingTool,
  detectUnansweredMessagesTool,
  getContactInteractionSummaryTool,
];

