import { describe, expect, it, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { brainOrchestrator } from '@/modules/brain/orchestrator';
import { dataRetentionService } from '@/modules/brain/data-retention-service';
import { ttlEngine } from '@/modules/brain/ttl-engine';
import { memoryService } from '@/modules/memory/memory-service';

describe('Jarvis Dynamic TTL & Data Retention', () => {
  const testUserId = 'test-ttl-user';

  it('calculates dynamic and bounded TTLs via TtlEngine', async () => {
    const convTtl = await ttlEngine.suggestConversationTtl('What is the weather today?');
    expect(convTtl).toBeGreaterThanOrEqual(1);
    expect(convTtl).toBeLessThanOrEqual(365);

    const memoryTtl = await ttlEngine.suggestMemoryTtl('I am allergic to penicillin and peanuts', 'FACT');
    expect(memoryTtl).toBeGreaterThanOrEqual(1);
    expect(memoryTtl).toBeLessThanOrEqual(365);

    const expiryDate = ttlEngine.calculateExpiryDate(10);
    const diffDays = Math.round((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(10);
  });

  it('assigns dynamic TTL on memory creation and filters out expired memories', async () => {
    // Ensure test user exists
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: { id: testUserId, name: 'Sushant' },
    });

    // Cleanup previous test state
    await prisma.memory.deleteMany({ where: { userId: testUserId } });

    // 1. Create an active memory
    const activeMem = await memoryService.saveMemory(
      testUserId,
      'PREFERENCE',
      'I prefer concise bullet points in code reviews',
      4,
      30 // 30 days
    );
    expect(activeMem.expiresAt).toBeDefined();

    // 2. Create an already expired memory directly
    const expiredPastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5); // 5 days ago
    await prisma.memory.create({
      data: {
        userId: testUserId,
        type: 'ROUTINE',
        content: 'Old temporary gym routine for last week',
        importance: 2,
        expiresAt: expiredPastDate,
      },
    });

    // 3. Query relevant memories - should only retrieve the active memory
    const retrieved = await memoryService.getRelevantMemories(testUserId, 'bullet points');
    expect(retrieved.some((m) => m.content.includes('concise bullet points'))).toBe(true);
    expect(retrieved.some((m) => m.content.includes('Old temporary gym routine'))).toBe(false);
  });

  it('renews memory TTL when a memory record is updated', async () => {
    const memoryContent = 'I drink oat milk latte every morning';
    const initialExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2); // 2 days TTL

    const mem1 = await memoryService.saveMemory(
      testUserId,
      'HABIT',
      memoryContent,
      2,
      undefined,
      initialExpiry
    );
    expect(mem1.expiresAt).toBe(initialExpiry.toISOString());

    // Update the same memory with higher importance and 60 days TTL
    const updatedMem = await memoryService.saveMemory(
      testUserId,
      'HABIT',
      memoryContent,
      5,
      60
    );

    expect(updatedMem.importance).toBe(5);
    expect(updatedMem.expiresAt).toBeDefined();
    const updatedExpiryDate = new Date(updatedMem.expiresAt!);
    expect(updatedExpiryDate.getTime()).toBeGreaterThan(initialExpiry.getTime());
  });

  it('assigns initial TTL to conversation and renews sliding TTL on Jarvis response', async () => {
    const userMessage = 'Let us plan the system architecture for our new project';
    const response = await brainOrchestrator.processMessage({
      message: userMessage,
      userId: testUserId,
      requestId: 'test-req-ttl-1',
    });

    expect(response.conversationId).toBeDefined();

    const conversation = await prisma.conversation.findUnique({
      where: { id: response.conversationId },
    });

    expect(conversation).not.toBeNull();
    expect(conversation?.expiresAt).toBeDefined();
    expect(conversation!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('prunes expired conversations, messages, and memories during data retention cleanup', async () => {
    // 1. Create an expired conversation with messages
    const expiredConvDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3); // 3 days ago
    const expiredConv = await prisma.conversation.create({
      data: {
        userId: testUserId,
        title: 'Old Expired Conversation',
        expiresAt: expiredConvDate,
      },
    });

    await prisma.message.create({
      data: {
        conversationId: expiredConv.id,
        role: 'USER',
        content: 'This message should be deleted with the conversation',
      },
    });

    // 2. Create an active conversation
    const activeConv = await prisma.conversation.create({
      data: {
        userId: testUserId,
        title: 'Active Living Conversation',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });

    // 3. Create an expired memory
    const expiredMemory = await prisma.memory.create({
      data: {
        userId: testUserId,
        type: 'CONTEXT',
        content: 'Temporary debug session context from yesterday',
        expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
      },
    });

    // 4. Run data retention cleanup
    const cleanupStats = await dataRetentionService.cleanupAllExpired();
    expect(cleanupStats.success).toBe(true);
    expect(cleanupStats.recordsDeleted.conversations).toBeGreaterThanOrEqual(1);
    expect(cleanupStats.recordsDeleted.messages).toBeGreaterThanOrEqual(1);
    expect(cleanupStats.recordsDeleted.memories).toBeGreaterThanOrEqual(1);

    // 5. Verify database state
    const fetchedExpiredConv = await prisma.conversation.findUnique({
      where: { id: expiredConv.id },
    });
    expect(fetchedExpiredConv).toBeNull();

    const fetchedActiveConv = await prisma.conversation.findUnique({
      where: { id: activeConv.id },
    });
    expect(fetchedActiveConv).not.toBeNull();

    const fetchedExpiredMem = await prisma.memory.findUnique({
      where: { id: expiredMemory.id },
    });
    expect(fetchedExpiredMem).toBeNull();

    // Clean up active test conversation
    await prisma.conversation.delete({ where: { id: activeConv.id } });
  });

  afterAll(async () => {
    await prisma.memory.deleteMany({ where: { userId: testUserId } });
    await prisma.conversation.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });
});
