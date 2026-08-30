/**
 * Tests for NotificationContextStore
 * Tests are scoped to in-memory logic (AsyncStorage is mocked).
 */

import { NotificationContextStore } from '../integrations/NotificationContextStore';
import { PhoneNotificationEvent } from '@jarvis/shared';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

function makeEvent(
  sender: string,
  app: string,
  content = 'test message',
  daysAgo = 0
): PhoneNotificationEvent {
  const ts = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    id: `${sender}-${ts}`,
    app,
    packageName: `com.${app}`,
    sender,
    content,
    timestamp: ts,
    canReply: false,
  };
}

describe('NotificationContextStore', () => {
  let store: NotificationContextStore;

  beforeEach(async () => {
    store = new NotificationContextStore();
    await store.initialize();
  });

  describe('ingest', () => {
    it('adds event to store', () => {
      store.ingest(makeEvent('Rahul', 'whatsapp'));
      expect(store.size()).toBe(1);
    });

    it('rejects duplicate events (same id)', () => {
      const ev = makeEvent('Rahul', 'whatsapp');
      store.ingest(ev);
      store.ingest(ev);
      expect(store.size()).toBe(1);
    });

    it('strips content when storeContent is false', async () => {
      await store.updateSettings({ storeContent: false });
      const ev = makeEvent('Rahul', 'whatsapp', 'secret text');
      store.ingest(ev);
      const events = store.getRecentEvents();
      expect(events[0].content).toBeUndefined();
    });

    it('ignores events from disabled apps', async () => {
      await store.updateSettings({ enabledApps: { whatsapp: false, instagram: true, telegram: true, sms: true, gmail: false, discord: false, slack: false, messenger: true } });
      store.ingest(makeEvent('Rahul', 'whatsapp'));
      expect(store.size()).toBe(0);
    });
  });

  describe('getRecentEvents', () => {
    beforeEach(() => {
      store.ingest(makeEvent('Rahul', 'whatsapp', 'Hey'));
      store.ingest(makeEvent('Priya', 'instagram', 'Liked your post'));
      store.ingest(makeEvent('Rahul', 'telegram', 'Project update'));
    });

    it('returns all events when no filter', () => {
      expect(store.getRecentEvents().length).toBe(3);
    });

    it('filters by sender', () => {
      const results = store.getRecentEvents({ sender: 'Rahul' });
      expect(results.length).toBe(2);
    });

    it('filters by app', () => {
      const results = store.getRecentEvents({ app: 'whatsapp' });
      expect(results.length).toBe(1);
    });

    it('applies limit', () => {
      const results = store.getRecentEvents(undefined, 2);
      expect(results.length).toBe(2);
    });
  });

  describe('searchEvents', () => {
    beforeEach(() => {
      store.ingest(makeEvent('Rahul', 'whatsapp', 'Let us go to Goa next weekend'));
      store.ingest(makeEvent('Priya', 'instagram', 'The Goa trip looks amazing!'));
      store.ingest(makeEvent('Mom', 'sms', 'Call me when free'));
    });

    it('finds events matching query', () => {
      const results = store.searchEvents('Goa');
      expect(results.length).toBe(2);
    });

    it('returns empty for no match', () => {
      const results = store.searchEvents('xyznotexist');
      expect(results.length).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('empties the store', async () => {
      store.ingest(makeEvent('Rahul', 'whatsapp'));
      await store.clearAll();
      expect(store.size()).toBe(0);
    });
  });

  describe('clearByApp', () => {
    it('removes only events from specified app', async () => {
      store.ingest(makeEvent('Rahul', 'whatsapp'));
      store.ingest(makeEvent('Priya', 'instagram'));
      await store.clearByApp('whatsapp');
      expect(store.size()).toBe(1);
      expect(store.getRecentEvents()[0].app).toBe('instagram');
    });
  });
});
