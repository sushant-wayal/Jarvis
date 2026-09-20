import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { memoryLifecycleService } from '../modules/memory/memory-lifecycle';

describe('Semantic Memory Lifecycle & Identity Guard', () => {
  const testUserId = 'test_user_identity_guard';

  beforeEach(async () => {
    // Ensure test user exists with name 'Sushant'
    await prisma.user.upsert({
      where: { id: testUserId },
      update: { name: 'Sushant' },
      create: { id: testUserId, name: 'Sushant' },
    });
  });

  it('rejects candidate claiming a false identity that contradicts verified User.name', async () => {
    const result = await memoryLifecycleService.processCandidate({
      userId: testUserId,
      type: 'FACT',
      content: "User's name is Darshan",
      importance: 5,
      confidence: 0.95,
      source: 'EXTRACTED_CONVERSATION',
    });

    expect(result.action).toBe('REJECTED');
    expect(result.reason).toContain('Violates verified user identity');

    // Verify DB does not contain the false memory
    const memories = await prisma.memory.findMany({ where: { userId: testUserId } });
    const hasDarshan = memories.some((m) => m.content.includes('Darshan'));
    expect(hasDarshan).toBe(false);
  }, 120000);

  it('allows candidate confirming verified User.name', async () => {
    const result = await memoryLifecycleService.processCandidate({
      userId: testUserId,
      type: 'FACT',
      content: "User's name is Sushant",
      importance: 5,
      confidence: 1.0,
      source: 'USER_EXPLICIT',
    });

    expect(result.action).toBe('INSERTED');
  }, 120000);

  it('protects USER_EXPLICIT memory from being overwritten by EXTRACTED_CONVERSATION', async () => {
    // Explicit preference
    await memoryLifecycleService.processCandidate({
      userId: testUserId,
      type: 'PREFERENCE',
      content: 'I only drink black coffee without sugar',
      importance: 5,
      confidence: 1.0,
      source: 'USER_EXPLICIT',
    });

    // Weaker passive extraction that contradicts
    const result = await memoryLifecycleService.processCandidate({
      userId: testUserId,
      type: 'PREFERENCE',
      content: 'User drinks sweet milky latte',
      importance: 3,
      confidence: 0.6,
      source: 'EXTRACTED_CONVERSATION',
    });

    expect(['DISCARDED', 'INSERTED']).toContain(result.action);
    // Crucially, verify black coffee memory was NOT overwritten
    const blackCoffee = await prisma.memory.findFirst({
      where: { userId: testUserId, content: { contains: 'black coffee' } },
    });
    expect(blackCoffee).toBeDefined();
  }, 120000);
});
