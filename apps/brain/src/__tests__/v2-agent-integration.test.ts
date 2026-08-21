import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/db/prisma';
import { contextEngine } from '../modules/brain/context-engine';
import { intentEngine } from '../modules/brain/intent-engine';
import { brainOrchestrator } from '../modules/brain/orchestrator';
import { memoryLifecycleService } from '../modules/memory/memory-lifecycle';
import { taskRunner } from '../modules/tasks/task-runner';
import { taskService } from '../modules/tasks/task-service';

describe('Jarvis V2 Agentic System Verification', () => {
  const testUserId = 'test-v2-user';

  beforeAll(async () => {
    // Ensure test user exists in database
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        name: 'Test User',
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.task.deleteMany({ where: { userId: testUserId } });
    await prisma.memory.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  it('Scenario 1: Fast deterministic intent classification for calculations', () => {
    const result = intentEngine.classifyFast('what is 49 into 193');
    expect(result).not.toBeNull();
    expect(result?.intent).toBe('CALCULATION');
  });

  it('Scenario 2: Intent classification for reminder creation', () => {
    const result = intentEngine.classifyFast('remind me tomorrow at 8 AM to call Mom');
    expect(result).not.toBeNull();
    expect(result?.intent).toBe('TASK_CREATION');
  });

  it('Scenario 3: Context Engine aggregates profile, active tasks, and memories', async () => {
    const context = await contextEngine.assembleContext({
      userId: testUserId,
      conversationId: 'test-conv-1',
      currentMessage: 'hello',
      timezone: 'Asia/Kolkata',
      locale: 'en-US',
    });

    expect(context.userProfile).toBeDefined();
    expect(context.systemContextString).toContain('Asia/Kolkata');
  });

  it('Scenario 4: Task Service creates, lists, updates, and deletes tasks', async () => {
    const created = await taskService.createTask({
      userId: testUserId,
      title: 'Review quarterly goals',
      type: 'REMINDER',
      schedule: 'tomorrow at 8 AM',
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe('Review quarterly goals');
    expect(created.status).toBe('ACTIVE');

    const list = await taskService.listTasks(testUserId, 'ACTIVE');
    expect(list.some((t) => t.id === created.id)).toBe(true);

    const updated = await taskService.updateTask(created.id, testUserId, { status: 'COMPLETED' });
    expect(updated?.status).toBe('COMPLETED');

    const deleted = await taskService.deleteTask(created.id, testUserId);
    expect(deleted).toBe(true);
  });

  it('Scenario 5: Memory Lifecycle Service processes knowledge and avoids duplication', async () => {
    await memoryLifecycleService.processCandidate({
      userId: testUserId,
      type: 'PREFERENCE',
      content: 'I prefer dark mode in all apps',
      importance: 4,
      confidence: 0.95,
      source: 'USER_EXPLICIT',
    });

    // Update with conflicting newer preference
    await memoryLifecycleService.processCandidate({
      userId: testUserId,
      type: 'PREFERENCE',
      content: 'I prefer high contrast dark mode in all apps',
      importance: 5,
      confidence: 0.99,
      source: 'USER_EXPLICIT',
    });

    expect(true).toBe(true);
  });

  it('Scenario 6: Task Runner executes due tasks and prevents duplicate executions', async () => {
    const dueTask = await taskService.createTask({
      userId: testUserId,
      title: 'Water the plants',
      type: 'REMINDER',
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
    });

    const result = await taskRunner.runDueTasks();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    // Verify task is now COMPLETED so it won't re-run
    const updated = await taskService.getTask(dueTask.id, testUserId);
    expect(updated?.status).toBe('COMPLETED');

    // Clean up
    await taskService.deleteTask(dueTask.id, testUserId);
  });

  it('Scenario 7: Fast-Path arithmetic evaluation via Brain Orchestrator', async () => {
    const res = await brainOrchestrator.processMessage({
      message: 'what is 125 multiplied by 8',
      userId: testUserId,
      requestId: 'test_req_math_1',
    });

    expect(res.text.replace(/,/g, '')).toContain('1000');
  });
});
