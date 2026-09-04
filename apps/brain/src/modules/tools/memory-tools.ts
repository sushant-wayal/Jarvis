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

const ListMemoriesInputSchema = z.object({
  type: z
    .enum(['FACT', 'PREFERENCE', 'PERSON', 'PROJECT', 'ROUTINE', 'GOAL', 'CONSTRAINT', 'HABIT', 'CONTEXT', 'ALL'])
    .optional()
    .default('ALL')
    .describe('Filter by memory category'),
  limit: z.number().optional().default(15),
});

export const listMemoriesTool: JarvisTool<
  z.infer<typeof ListMemoriesInputSchema>,
  { memories: Array<{ id: string; type: string; content: string; importance: number }> }
> = {
  name: 'memory_list',
  description: 'Lists all stored long-term memories, user preferences, habits, and facts.',
  category: 'PERSONAL',
  riskLevel: 'SAFE',
  inputSchema: ListMemoriesInputSchema,
  async execute(input, context) {
    const where: Record<string, unknown> = { userId: context.userId };
    if (input.type && input.type !== 'ALL') {
      where.type = input.type;
    }
    const memories = await prisma.memory.findMany({
      where,
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: input.limit || 15,
    });
    return {
      memories: memories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        importance: m.importance,
      })),
    };
  },
};

const UpdateMemoryInputSchema = z.object({
  memoryId: z.string().optional().describe('ID of the memory to update (if known)'),
  query: z.string().optional().describe('Keyword or phrase to identify which memory to update if ID is not known'),
  content: z.string().describe('New or updated memory content'),
  type: z
    .enum(['FACT', 'PREFERENCE', 'PERSON', 'PROJECT', 'ROUTINE', 'GOAL', 'CONSTRAINT', 'HABIT', 'CONTEXT'])
    .optional(),
  importance: z.number().min(1).max(5).optional(),
});

export const updateMemoryTool: JarvisTool<
  z.infer<typeof UpdateMemoryInputSchema>,
  { success: boolean; memoryId?: string; content?: string; message: string }
> = {
  name: 'memory_update',
  description: 'Updates an existing memory, preference, or fact. Can find the memory by ID or by keyword search.',
  category: 'PERSONAL',
  riskLevel: 'LOW_RISK',
  inputSchema: UpdateMemoryInputSchema,
  async execute(input, context) {
    let memory = null;
    if (input.memoryId) {
      memory = await prisma.memory.findFirst({
        where: { id: input.memoryId, userId: context.userId },
      });
    }

    if (!memory && input.query) {
      const q = input.query.toLowerCase().trim();
      const all = await prisma.memory.findMany({
        where: { userId: context.userId },
        orderBy: { updatedAt: 'desc' },
      });
      memory = all.find((m) => m.content.toLowerCase().includes(q));
    }

    if (!memory) {
      return {
        success: false,
        message: `Could not find any memory matching "${input.query || input.memoryId}".`,
      };
    }

    const updated = await prisma.memory.update({
      where: { id: memory.id },
      data: {
        content: input.content.trim(),
        ...(input.type ? { type: input.type } : {}),
        ...(input.importance !== undefined ? { importance: input.importance } : {}),
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      memoryId: updated.id,
      content: updated.content,
      message: `Updated memory to: "${updated.content}"`,
    };
  },
};

const DeleteMemoryInputSchema = z.object({
  memoryId: z.string().optional().describe('ID of the memory to delete (if known)'),
  query: z.string().optional().describe('Keyword, preference, or fact description to forget/delete (e.g. "coffee", "Pune", "tea")'),
});

export const deleteMemoryTool: JarvisTool<
  z.infer<typeof DeleteMemoryInputSchema>,
  { success: boolean; message: string; deletedContent?: string }
> = {
  name: 'memory_delete',
  description: 'Deletes or forgets a stored memory, preference, or personal fact. Use whenever the user asks you to forget something or remove a preference.',
  category: 'PERSONAL',
  riskLevel: 'LOW_RISK',
  inputSchema: DeleteMemoryInputSchema,
  async execute(input, context) {
    let memory = null;
    if (input.memoryId) {
      memory = await prisma.memory.findFirst({
        where: { id: input.memoryId, userId: context.userId },
      });
    }

    if (!memory && input.query) {
      const q = input.query.toLowerCase().trim();
      const all = await prisma.memory.findMany({
        where: { userId: context.userId },
        orderBy: { updatedAt: 'desc' },
      });
      memory = all.find((m) => m.content.toLowerCase().includes(q));
    }

    if (!memory) {
      return {
        success: false,
        message: `No memory matching "${input.query || input.memoryId}" was found to delete.`,
      };
    }

    await prisma.memory.delete({ where: { id: memory.id } });
    return {
      success: true,
      deletedContent: memory.content,
      message: `Successfully forgot: "${memory.content}"`,
    };
  },
};
