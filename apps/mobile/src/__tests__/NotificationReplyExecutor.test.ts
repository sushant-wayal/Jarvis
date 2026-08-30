/**
 * Tests for NotificationReplyExecutor
 */

import { NotificationReplyExecutor } from '../integrations/NotificationReplyExecutor';
import { PhoneNotificationEvent } from '@jarvis/shared';
import * as AppIntegrationModule from '../integrations/AppIntegration';

// Mock the app integration
const mockOpenApp = jest.fn().mockResolvedValue({ success: true, message: 'Opened whatsapp.' });
const mockOpenConversation = jest.fn().mockResolvedValue({ success: true });

jest.mock('../integrations/AppIntegration', () => ({
  appIntegration: {
    openApp: (...args: unknown[]) => mockOpenApp(...args),
    openConversation: (...args: unknown[]) => mockOpenConversation(...args),
  },
}));

function makeEvent(canReply: boolean, replyActionKey?: string): PhoneNotificationEvent {
  return {
    id: 'ev-1',
    app: 'whatsapp',
    packageName: 'com.whatsapp',
    sender: 'Rahul',
    content: 'Hey!',
    timestamp: new Date().toISOString(),
    canReply,
    replyActionKey,
    conversationKey: 'rahul-conv-key',
  };
}

describe('NotificationReplyExecutor', () => {
  let executor: NotificationReplyExecutor;

  beforeEach(() => {
    executor = new NotificationReplyExecutor();
    mockOpenApp.mockClear();
    mockOpenConversation.mockClear();
  });

  describe('canReplyDirectly', () => {
    it('returns true when canReply and replyActionKey are set', () => {
      expect(executor.canReplyDirectly(makeEvent(true, 'key-123'))).toBe(true);
    });

    it('returns false when canReply is false', () => {
      expect(executor.canReplyDirectly(makeEvent(false, 'key-123'))).toBe(false);
    });

    it('returns false when replyActionKey is missing', () => {
      expect(executor.canReplyDirectly(makeEvent(true, undefined))).toBe(false);
    });
  });

  describe('reply', () => {
    it('falls back to conversation link when canReply is false', async () => {
      const event = makeEvent(false);
      const result = await executor.reply(event, 'I am on my way');
      expect(result.fallbackUsed).toBe(true);
      expect(result.success).toBe(false);
      expect(result.message).toContain('whatsapp');
    });

    it('falls back to openApp when no conversation key', async () => {
      const event: PhoneNotificationEvent = {
        ...makeEvent(false),
        conversationKey: undefined,
      };
      const result = await executor.reply(event, 'I am on my way');
      expect(result.fallbackUsed).toBe(true);
      // openApp or openConversation should have been called
      expect(mockOpenApp.mock.calls.length + mockOpenConversation.mock.calls.length).toBeGreaterThan(0);
    });

    it('fallback reports accurate failure message — never claims success', async () => {
      mockOpenApp.mockResolvedValueOnce({ success: false, error: 'App not installed' });
      mockOpenConversation.mockResolvedValueOnce({ success: false, error: 'No deep link' });

      const event: PhoneNotificationEvent = { ...makeEvent(false), conversationKey: undefined };
      const result = await executor.reply(event, 'Okay');
      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
    });
  });
});
