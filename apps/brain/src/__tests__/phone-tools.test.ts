import { describe, expect, it } from 'vitest';
import {
  getPhoneCapabilitiesTool,
  initiatePhoneCallTool,
  openApplicationTool,
  readPhoneMessagesTool,
  searchPhoneMessagesTool,
  sendMessageToContactTool,
} from '../modules/tools/phone-tools';
import { PhoneContext, ToolContext } from '@jarvis/shared';

describe('Phone Tools (Brain)', () => {
  const mockPhoneContext: PhoneContext = {
    capabilities: {
      contacts: true,
      phoneCall: true,
      sms: true,
      notificationListener: true,
      notificationReply: true,
      openApp: true,
    },
    recentNotifications: [
      {
        id: 'n1',
        app: 'whatsapp',
        packageName: 'com.whatsapp',
        sender: 'Rahul',
        content: 'Hey, are you free tonight?',
        timestamp: new Date().toISOString(),
        canReply: true,
        conversationKey: 'conv_rahul',
      },
      {
        id: 'n2',
        app: 'instagram',
        packageName: 'com.instagram.android',
        sender: 'Priya',
        content: 'Check out this post!',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        canReply: false,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  const mockToolContext: ToolContext = {
    userId: 'test-user',
    conversationId: 'conv-123',
    requestId: 'req-1',
    timezone: 'UTC',
    locale: 'en-US',
    phoneContext: mockPhoneContext,
  };

  it('initiatePhoneCallTool generates CALL_CONTACT action', async () => {
    const res = (await initiatePhoneCallTool.execute({ contactName: 'Rahul' }, mockToolContext)) as Record<string, any>;
    expect(res.action).toBe('CALL_CONTACT');
    expect(res.contactName).toBe('Rahul');
    expect(res.response).toContain('Rahul');
  });

  it('sendMessageToContactTool auto-resolves app from recent notification context', async () => {
    const res = (await sendMessageToContactTool.execute(
      { contactName: 'Rahul', message: "I'll be there!" },
      mockToolContext
    )) as Record<string, any>;
    expect(res.action).toBe('REPLY_TO_NOTIFICATION');
    expect(res.app).toBe('whatsapp');
    expect(res.message).toBe("I'll be there!");
  });

  it('sendMessageToContactTool falls back to SMS when no app notification found', async () => {
    const res = (await sendMessageToContactTool.execute(
      { contactName: 'Unknown Person', message: 'Hello' },
      mockToolContext
    )) as Record<string, any>;
    expect(res.action).toBe('SEND_SMS');
    expect(res.contactName).toBe('Unknown Person');
  });

  it('readPhoneMessagesTool returns filtered messages', async () => {
    const res = (await readPhoneMessagesTool.execute({ senderName: 'Rahul' }, mockToolContext)) as Record<string, any>;
    expect(res.count).toBe(1);
    expect(res.messages[0].sender).toBe('Rahul');
    expect(res.summary).toContain('Rahul');
  });

  it('searchPhoneMessagesTool finds matching content across apps', async () => {
    const res = (await searchPhoneMessagesTool.execute({ query: 'free tonight' }, mockToolContext)) as Record<string, any>;
    expect(res.count).toBe(1);
    expect(res.results[0].content).toContain('free tonight');
  });

  it('openApplicationTool returns OPEN_APP action', async () => {
    const res = (await openApplicationTool.execute({ appName: 'WhatsApp' }, mockToolContext)) as Record<string, any>;
    expect(res.type).toBe('OPEN_APP');
    expect(res.action).toBe('OPEN_APP');
    expect(res.app).toBe('whatsapp');
  });

  it('getPhoneCapabilitiesTool reports accurate device status', async () => {
    const res = (await getPhoneCapabilitiesTool.execute({}, mockToolContext)) as Record<string, any>;
    expect(res.available).toBe(true);
    expect(res.capabilities?.contacts).toBe(true);
    expect(res.recentNotificationCount).toBe(2);
  });

  it('initiatePhoneCallTool resolves direct numbers without needing contact book', async () => {
    const res = (await initiatePhoneCallTool.execute({ contactName: '9876543210' }, mockToolContext)) as Record<string, any>;
    expect(res.action).toBe('CALL_CONTACT');
    expect(res.phoneNumber).toBe('9876543210');
    expect(res.response).toBe('Calling 9876543210.');
  });

  it('initiatePhoneCallTool supports video call', async () => {
    const res = (await initiatePhoneCallTool.execute({ contactName: 'Rahul', callType: 'video' }, mockToolContext)) as Record<string, any>;
    expect(res.action).toBe('CALL_CONTACT');
    expect(res.callType).toBe('video');
    expect(res.app).toBe('phone');
    expect(res.response).toBe('Starting video call with Rahul.');
  });

  it('initiatePhoneCallTool supports WhatsApp voice and video call', async () => {
    const resVoice = (await initiatePhoneCallTool.execute({ contactName: 'Rahul on WhatsApp', app: 'whatsapp' }, mockToolContext)) as Record<string, any>;
    expect(resVoice.action).toBe('CALL_CONTACT');
    expect(resVoice.callType).toBe('voice');
    expect(resVoice.app).toBe('whatsapp');
    expect(resVoice.contactName).toBe('Rahul');
    expect(resVoice.response).toBe('Calling Rahul on WhatsApp.');

    const resVideo = (await initiatePhoneCallTool.execute({ contactName: 'Rahul', app: 'whatsapp', callType: 'video' }, mockToolContext)) as Record<string, any>;
    expect(resVideo.action).toBe('CALL_CONTACT');
    expect(resVideo.callType).toBe('video');
    expect(resVideo.app).toBe('whatsapp');
    expect(resVideo.response).toBe('Starting WhatsApp video call with Rahul.');
  });
});
