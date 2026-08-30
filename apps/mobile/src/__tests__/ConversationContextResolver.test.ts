/**
 * Tests for ConversationContextResolver
 */

import { ConversationContextResolver } from '../integrations/ConversationContextResolver';
import { PhoneNotificationEvent } from '@jarvis/shared';

function makeEvent(
  sender: string,
  app: string,
  content: string,
  overrides: Partial<PhoneNotificationEvent> = {}
): PhoneNotificationEvent {
  return {
    id: `${sender}-${Date.now()}-${Math.random()}`,
    app,
    packageName: `com.${app}`,
    sender,
    content,
    timestamp: new Date().toISOString(),
    canReply: true,
    ...overrides,
  };
}

describe('ConversationContextResolver', () => {
  const resolver = new ConversationContextResolver();

  const rahul = makeEvent('Rahul Sharma', 'whatsapp', 'Hey, are you coming?');
  const priya = makeEvent('Priya', 'instagram', 'Loved your post!');
  const rahulTelegram = makeEvent('Rahul Verma', 'telegram', 'About the project...');

  const events = [rahul, priya, rahulTelegram];

  describe('resolveMostRecent', () => {
    it('returns most recent event when no context sender', () => {
      const result = resolver.resolveMostRecent(events);
      expect(result.reference?.sender).toBe('Rahul Sharma');
      expect(result.reference?.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('returns context sender event when context sender is provided', () => {
      const result = resolver.resolveMostRecent(events, 'Priya');
      expect(result.reference?.sender).toBe('Priya');
    });

    it('returns unresolved when no events', () => {
      const result = resolver.resolveMostRecent([]);
      expect(result.unresolved).toBe(true);
    });
  });

  describe('resolveByName', () => {
    it('resolves single matching sender', () => {
      const result = resolver.resolveByName('priya', events);
      expect(result.reference?.sender).toBe('Priya');
      expect(result.ambiguous).toBeUndefined();
    });

    it('returns ambiguous when multiple senders match', () => {
      const result = resolver.resolveByName('rahul', events);
      expect(result.ambiguous).toBe(true);
      expect(result.candidates?.length).toBe(2);
    });

    it('returns unresolved for unknown name', () => {
      const result = resolver.resolveByName('nobody', events);
      expect(result.unresolved).toBe(true);
    });
  });

  describe('resolve', () => {
    it('resolves pronouns to most recent sender', () => {
      const result = resolver.resolve('him', events);
      expect(result.reference?.sender).toBeDefined();
    });

    it('resolves "that" to most recent', () => {
      const result = resolver.resolve('that', events);
      expect(result.reference).toBeDefined();
    });

    it('resolves explicit name', () => {
      const result = resolver.resolve('Priya', events);
      expect(result.reference?.sender).toBe('Priya');
    });

    it('returns ambiguous for partial match with multiple senders', () => {
      const result = resolver.resolve('Rahul', events);
      expect(result.ambiguous).toBe(true);
    });
  });

  describe('extractNameFromUtterance', () => {
    it('extracts name from "what did X say"', () => {
      expect(resolver.extractNameFromUtterance('what did Rahul say')).toBe('Rahul');
    });
    it('extracts name from "reply to X"', () => {
      expect(resolver.extractNameFromUtterance('reply to Priya')).toBe('Priya');
    });
    it('returns null for no match', () => {
      expect(resolver.extractNameFromUtterance('hello there')).toBeNull();
    });
  });
});
