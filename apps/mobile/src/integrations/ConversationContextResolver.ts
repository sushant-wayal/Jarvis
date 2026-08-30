/**
 * ConversationContextResolver
 * Resolves pronouns and entity references in user utterances against the
 * captured notification context.
 *
 * Examples:
 *   "Tell him I'm coming" → resolves "him" to most-recent male sender
 *   "What did Rahul say?" → finds all events from sender matching "Rahul"
 *   "Reply to that message" → finds most recent event overall
 */

import { PhoneNotificationEvent } from '@jarvis/shared';

export interface ConversationReference {
  /** The resolved sender name */
  sender: string;
  /** App the conversation is on */
  app: string;
  /** The matching notification event (most recent match) */
  event: PhoneNotificationEvent;
  /** 0–1 confidence score */
  confidence: number;
}

export interface ReferenceResolutionResult {
  reference?: ConversationReference;
  /** Multiple plausible senders — need clarification */
  ambiguous?: boolean;
  /** Possible senders when ambiguous */
  candidates?: Array<{ sender: string; app: string }>;
  /** Could not resolve */
  unresolved?: boolean;
}

// Pronouns that should resolve to the most-recent or named sender
const THIRD_PERSON_SINGULAR = ['him', 'her', 'them', 'he', 'she', 'they', 'it'];
const RECENT_REFERENCE = ['that', 'this', 'last', 'latest', 'recent', 'above'];

export class ConversationContextResolver {
  /**
   * Try to resolve "him", "her", "Rahul", "that message", etc.
   * against the captured notification history.
   *
   * @param referenceHint  The pronoun or name from the user utterance.
   * @param events         Recent events, most-recent-first.
   * @param contextSender  If Jarvis already knows who we're talking about (from prior turn).
   */
  resolve(
    referenceHint: string,
    events: PhoneNotificationEvent[],
    contextSender?: string,
  ): ReferenceResolutionResult {
    if (!events.length) return { unresolved: true };

    const normalized = referenceHint.trim().toLowerCase();

    // Case 1: pronoun or "that"/"last" — resolve to most-recent sender
    if (
      THIRD_PERSON_SINGULAR.includes(normalized) ||
      RECENT_REFERENCE.includes(normalized)
    ) {
      return this.resolveMostRecent(events, contextSender);
    }

    // Case 2: explicit name — search for sender matching the name
    return this.resolveByName(normalized, events);
  }

  /**
   * Resolve the most recent conversation contact.
   * If contextSender is supplied (from previous turn), that takes priority.
   */
  resolveMostRecent(
    events: PhoneNotificationEvent[],
    contextSender?: string,
  ): ReferenceResolutionResult {
    if (!events.length) return { unresolved: true };

    // If there's an established context sender, find their most recent event
    if (contextSender) {
      const match = events.find(
        (e) => e.sender.toLowerCase().includes(contextSender.toLowerCase())
      );
      if (match) {
        return {
          reference: {
            sender: match.sender,
            app: match.app,
            event: match,
            confidence: 0.95,
          },
        };
      }
    }

    // Otherwise, the most recent event across all apps
    const recent = events[0];
    return {
      reference: {
        sender: recent.sender,
        app: recent.app,
        event: recent,
        confidence: 0.8,
      },
    };
  }

  /**
   * Resolve by sender name.
   * Returns ambiguous result if multiple distinct senders match.
   */
  resolveByName(
    name: string,
    events: PhoneNotificationEvent[],
  ): ReferenceResolutionResult {
    const matches = events.filter((e) =>
      e.sender.toLowerCase().includes(name)
    );

    if (!matches.length) {
      return { unresolved: true };
    }

    // Deduplicate by sender+app
    const uniqueSenders = this.deduplicateSenders(matches);

    if (uniqueSenders.length === 1) {
      const best = matches[0];
      return {
        reference: {
          sender: best.sender,
          app: best.app,
          event: best,
          confidence: 0.9,
        },
      };
    }

    // Multiple distinct senders/apps — need clarification
    if (uniqueSenders.length > 1) {
      return {
        ambiguous: true,
        candidates: uniqueSenders.map((e) => ({ sender: e.sender, app: e.app })),
      };
    }

    return { unresolved: true };
  }

  /**
   * Extract the implied sender name from an utterance.
   * E.g. "What did Rahul say?" → "Rahul"
   */
  extractNameFromUtterance(utterance: string): string | null {
    const patterns = [
      /what did (\w+) say/i,
      /what did (\w+) message/i,
      /what did (\w+) send/i,
      /message from (\w+)/i,
      /reply to (\w+)/i,
      /tell (\w+)/i,
      /send (\w+)/i,
    ];

    for (const pattern of patterns) {
      const match = utterance.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }
    return null;
  }

  private deduplicateSenders(
    events: PhoneNotificationEvent[],
  ): PhoneNotificationEvent[] {
    const seen = new Set<string>();
    return events.filter((e) => {
      const key = `${e.sender}:${e.app}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export const conversationContextResolver = new ConversationContextResolver();
