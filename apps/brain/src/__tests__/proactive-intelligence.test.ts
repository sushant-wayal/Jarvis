import { describe, expect, it } from 'vitest';
import { proactiveIntelligenceService } from '../modules/phone/proactive-intelligence';
import { PhoneContext, PhoneNotificationEvent, TaskItem, UserEventItem } from '@jarvis/shared';

describe('Proactive Intelligence Service (Phase 6)', () => {
  const mockNotifications: PhoneNotificationEvent[] = [
    {
      id: 'n1',
      app: 'whatsapp',
      packageName: 'com.whatsapp',
      sender: 'Rahul',
      content: 'Hey, are you free for dinner at 8pm?',
      timestamp: new Date().toISOString(),
      canReply: true,
    },
    {
      id: 'n2',
      app: 'whatsapp',
      packageName: 'com.whatsapp',
      sender: 'Rahul',
      content: 'Let me know if we can meet at Bandra.',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      canReply: true,
    },
    {
      id: 'n3',
      app: 'telegram',
      packageName: 'org.telegram.messenger',
      sender: 'Priya',
      content: 'Please send the project deck urgently!',
      timestamp: new Date(Date.now() - 120000).toISOString(),
      canReply: false,
    },
    {
      id: 'n4',
      app: 'instagram',
      packageName: 'com.instagram.android',
      sender: 'Alex',
      content: 'Nice photos!',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      canReply: false,
    },
  ];

  const mockPhoneContext: PhoneContext = {
    capabilities: {
      contacts: true,
      phoneCall: true,
      sms: true,
      notificationListener: true,
      notificationReply: true,
      openApp: true,
    },
    recentNotifications: mockNotifications,
    timestamp: new Date().toISOString(),
  };

  it('generateBriefing synthesizes multi-app messages into clear summary', () => {
    const briefing = proactiveIntelligenceService.generateBriefing(mockPhoneContext);
    expect(briefing.totalMessages).toBe(4);
    expect(briefing.summaryText).toContain('Rahul');
    expect(briefing.summaryText).toContain('Priya');
    expect(briefing.unansweredCount).toBeGreaterThanOrEqual(2);
  });

  it('detectActionItems detects questions and urgent requests with appropriate urgency', () => {
    const actionItems = proactiveIntelligenceService.detectActionItems(mockNotifications);
    expect(actionItems.length).toBeGreaterThanOrEqual(2);

    const urgentItem = actionItems.find((a) => a.sender === 'Priya');
    expect(urgentItem?.urgency).toBe('HIGH');
    expect(urgentItem?.questionOrRequest).toContain('urgently');

    const questionItem = actionItems.find((a) => a.sender === 'Rahul');
    expect(questionItem?.questionOrRequest).toContain('8pm?');
  });

  it('summarizeContact returns per-contact conversation history and stats', () => {
    const summary = proactiveIntelligenceService.summarizeContact('Rahul', mockPhoneContext);
    expect(summary).toContain('2 messages from Rahul');
    expect(summary).toContain('whatsapp');
  });

  it('correlateWithPlans links incoming messages to upcoming user events and tasks', () => {
    const mockEvents: UserEventItem[] = [
      {
        id: 'e1',
        userId: 'u1',
        type: 'MEETING',
        title: 'Dinner at Bandra',
        locationName: 'Bandra',
        status: 'UPCOMING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const mockTasks: TaskItem[] = [
      {
        id: 't1',
        userId: 'u1',
        type: 'SCHEDULED_TASK',
        title: 'project deck',
        status: 'ACTIVE',
        timezone: 'UTC',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const insights = proactiveIntelligenceService.correlateWithPlans(
      mockPhoneContext,
      mockEvents,
      mockTasks
    );

    expect(insights.length).toBe(2);
    expect(insights.some((i) => i.includes('Bandra'))).toBe(true);
    expect(insights.some((i) => i.includes('project deck'))).toBe(true);
  });
});
