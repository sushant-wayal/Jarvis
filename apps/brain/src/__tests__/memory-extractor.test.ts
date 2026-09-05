import { describe, it, expect, beforeAll, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { aiClient } from '@/lib/ai/gemini';
import { memoryExtractor } from '../modules/brain/memory-extractor';

describe('MemoryExtractor Hardening & False-Inference Prevention', () => {
  const testUserId = 'test_user_extractor_hardening';

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: testUserId },
      update: { name: 'Sushant' },
      create: { id: testUserId, name: 'Sushant' },
    });
    await prisma.memory.deleteMany({ where: { userId: testUserId } });
  });

  it('does NOT extract memory when user asks casual questions like "what is mom\'s phone number"', async () => {
    await memoryExtractor.extractAndStoreMemories(
      testUserId,
      "what is mom's phone number",
      "Darshan's mom: +919876543210"
    );

    const memories = await prisma.memory.findMany({ where: { userId: testUserId } });
    expect(memories.length).toBe(0);
  });

  it('never extracts false user identity from third-party contact names in assistant response', async () => {
    await memoryExtractor.extractAndStoreMemories(
      testUserId,
      "give me Darshan's mom's number",
      "Darshan's mom is +919876543210"
    );

    const memories = await prisma.memory.findMany({ where: { userId: testUserId } });
    const hasDarshan = memories.some((m) => m.content.toLowerCase().includes('name is darshan'));
    expect(hasDarshan).toBe(false);
  });

  it('correctly extracts persistent facts when user explicitly declares them in first-person', async () => {
    const spy = vi.spyOn(aiClient.models, 'generateContent').mockResolvedValueOnce({
      text: JSON.stringify([
        {
          type: 'FACT',
          content: 'User is allergic to shellfish and peanuts',
          importance: 5,
          ttlDays: 365,
        },
      ]),
    } as never);

    await memoryExtractor.extractAndStoreMemories(
      testUserId,
      "Remember that I am allergic to shellfish and peanuts",
      "I'll remember that you are allergic to shellfish and peanuts."
    );

    const memories = await prisma.memory.findMany({ where: { userId: testUserId } });
    expect(memories.length).toBeGreaterThanOrEqual(1);
    const allergyMem = memories.find((m) => m.content.toLowerCase().includes('shellfish') || m.content.toLowerCase().includes('allergic'));
    expect(allergyMem).toBeDefined();

    spy.mockRestore();
  });
});
