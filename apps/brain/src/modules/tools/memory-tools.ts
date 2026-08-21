import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { memoryService } from '@/modules/memory/memory-service';
import { JarvisTool } from './types';

const CreateMemoryInputSchema = z.object({
  content: z.string().describe('Clear personal fact, preference, habit, or project detail to remember forever'),
  type: z
    .enum(['FACT', 'PREFERENCE', 'PERSON', 'PROJECT', 'ROUTINE', 'GOAL', 'CONSTRAINT', 'HABIT', 'CONTEXT'])
    .optional()
    .default('FACT')
    .describe('Category of memory'),
  importance: z.number().min(1).max(5).optional().default(3),
});

export const createMemoryTool: JarvisTool<z.infer<typeof CreateMemoryInputSchema>, { success: boolean; memoryId: string; content: string }> = {
  name: 'memory_create',
  description: 'Explicitly stores a user preference, personal rule, habit, or long-term fact into memory.',
  category: 'PERSONAL',
  riskLevel: 'LOW_RISK',
  inputSchema: CreateMemoryInputSchema,
  async execute(input, context) {
    const memory = await memoryService.saveMemory(
      context.userId,
      input.type || 'FACT',
      input.content,
      input.importance || 3
    );

    return {
      success: true,
      memoryId: memory.id,
      content: memory.content,
    };
  },
};

const SearchMemoryInputSchema = z.object({
  query: z.string().describe('Search query to find stored memories and knowledge about the user'),
});

export const searchMemoryTool: JarvisTool<z.infer<typeof SearchMemoryInputSchema>, { memories: Array<{ id: string; type: string; content: string }> }> = {
  name: 'memory_search',
  description: 'Searches user long-term memory for previously remembered preferences, facts, or instructions.',
  category: 'PERSONAL',
  riskLevel: 'SAFE',
  inputSchema: SearchMemoryInputSchema,
  async execute(input, context) {
    const memories = await memoryService.getRelevantMemories(context.userId, input.query, 6);
    return {
      memories: memories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
      })),
    };
  },
};
