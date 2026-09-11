import { describe, expect, it } from 'vitest';
import { ChatRequestSchema } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { brainOrchestrator } from '@/modules/brain/orchestrator';
import { notificationService } from '@/modules/notifications/notification-service';

describe('Asynchronous Deep Work Mode (Background Execution)', () => {
  const testUserId = `test_user_deepwork_${Date.now()}`;

  it('ChatRequestSchema parses asyncMode cleanly with false as default', () => {
    const defaultParsed = ChatRequestSchema.parse({
      message: 'Analyze the system architecture',
    });
    expect(defaultParsed.asyncMode).toBe(false);

    const asyncParsed = ChatRequestSchema.parse({
      message: 'Analyze the system architecture',
      asyncMode: true,
    });
    expect(asyncParsed.asyncMode).toBe(true);
  });

  it('brainOrchestrator routes asyncMode: true immediately to Deep Work with mode: PROGRESS', async () => {
    const requestId = `req_deepwork_test_${Date.now()}`;
    const message = `Please do deep research in the background on repository architecture`;

    const response = await brainOrchestrator.processMessage({
      message,
      userId: testUserId,
      requestId,
      asyncMode: true,
    });

    expect(response.mode).toBe('PROGRESS');
    expect(response.agentRunId).toBeDefined();
    expect(response.text).toContain('started deep background');
    expect(response.text).toContain(response.agentRunId!);

    // Verify AgentRun record was created in database
    const agentRun = await prisma.agentRun.findUnique({
      where: { id: response.agentRunId },
    });
    expect(agentRun).toBeDefined();
    expect(agentRun?.userId).toBe(testUserId);
    expect(agentRun?.goal).toBe(message);

    // Verify messages in DB: User request + Initial acknowledgment
    const messages = await prisma.message.findMany({
      where: { conversationId: response.conversationId },
      orderBy: { createdAt: 'asc' },
    });
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].role).toBe('USER');
    expect(messages[0].content).toBe(message);
    expect(messages[1].role).toBe('ASSISTANT');
    expect(messages[1].metadata).toContain('PROGRESS');
  });

  it('brainOrchestrator auto-detects phrases like "in the background" without explicit asyncMode flag', async () => {
    const requestId = `req_autodetect_${Date.now()}`;
    const message = `Investigate serenity repo in the background and write a report`;

    const response = await brainOrchestrator.processMessage({
      message,
      userId: testUserId,
      requestId,
    });

    expect(response.mode).toBe('PROGRESS');
    expect(response.agentRunId).toBeDefined();

    const agentRun = await prisma.agentRun.findUnique({
      where: { id: response.agentRunId },
    });
    expect(agentRun).toBeDefined();
  });

  it('creates in-app notifications on completion of deep work', async () => {
    const notif = await notificationService.createNotification({
      userId: testUserId,
      title: 'Deep Work Analysis Complete',
      body: 'Completed research for: serenity repo architecture',
      deepLink: '/chat?conversationId=test-conv',
    });

    expect(notif.id).toBeDefined();
    expect(notif.title).toBe('Deep Work Analysis Complete');
    expect(notif.status).toBe('SENT');

    const list = await notificationService.listNotifications(testUserId);
    expect(list.some((n) => n.id === notif.id)).toBe(true);
  });
});
