import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { JarvisTool } from './types';

const CreateTaskInputSchema = z.object({
  title: z.string().describe('Clear title or reminder summary, e.g. "Call Mom", "Submit monthly tax report"'),
  type: z
    .enum(['REMINDER', 'SCHEDULED_TASK', 'RECURRING_TASK', 'CONDITIONAL_TASK'])
    .optional()
    .default('REMINDER')
    .describe('Type of task to create'),
  schedule: z
    .string()
    .optional()
    .describe('ISO datetime string or description of when the task should trigger, e.g. "2026-08-19T08:00:00Z" or "tomorrow at 8 AM"'),
  description: z.string().optional().describe('Optional detailed notes or instructions for the task'),
});

export const createTaskTool: JarvisTool<z.infer<typeof CreateTaskInputSchema>, { success: boolean; taskId: string; title: string; scheduledFor?: string }> = {
  name: 'task_create',
  description: 'Creates a new reminder, scheduled task, or background routine for the user.',
  category: 'PRODUCTIVITY',
  riskLevel: 'LOW_RISK',
  inputSchema: CreateTaskInputSchema,
  async execute(input, context) {
    let nextRun: Date | undefined;

    if (input.schedule) {
      const parsedDate = new Date(input.schedule);
      if (!isNaN(parsedDate.getTime())) {
        nextRun = parsedDate;
      } else {
        // Simple relative parser for tomorrow or hours
        const lower = input.schedule.toLowerCase();
        if (lower.includes('tomorrow')) {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          d.setHours(8, 0, 0, 0);
          nextRun = d;
        } else {
          nextRun = new Date(Date.now() + 60 * 60 * 1000); // 1 hour default
        }
      }
    }

    const task = await prisma.task.create({
      data: {
        userId: context.userId,
        type: input.type || 'REMINDER',
        title: input.title,
        description: input.description,
        status: 'ACTIVE',
        schedule: input.schedule,
        timezone: context.timezone || 'UTC',
        nextRunAt: nextRun,
      },
    });

    return {
      success: true,
      taskId: task.id,
      title: task.title,
      scheduledFor: task.nextRunAt?.toISOString(),
    };
  },
};

const ListTasksInputSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'ALL']).optional().default('ACTIVE').describe('Status filter for tasks'),
});

export const listTasksTool: JarvisTool<z.infer<typeof ListTasksInputSchema>, { tasks: Array<{ id: string; title: string; type: string; nextRunAt?: string }> }> = {
  name: 'task_list',
  description: 'Retrieves current active tasks, reminders, and schedules for the user.',
  category: 'PRODUCTIVITY',
  riskLevel: 'SAFE',
  inputSchema: ListTasksInputSchema,
  async execute(input, context) {
    const whereClause = input.status === 'ALL' ? { userId: context.userId } : { userId: context.userId, status: input.status };

    const tasks = await prisma.task.findMany({
      where: whereClause,
      orderBy: { nextRunAt: 'asc' },
      take: 10,
    });

    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        nextRunAt: t.nextRunAt?.toISOString(),
      })),
    };
  },
};
