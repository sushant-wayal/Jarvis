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

const UpdateTaskInputSchema = z.object({
  taskId: z.string().optional().describe('UUID of the task or reminder to update (if known)'),
  query: z.string().optional().describe('Keywords or title of the task to search for if taskId is not known (e.g. "rent", "pay rent", "groceries")'),
  status: z.enum(['ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED']).optional().describe('New status for the task (e.g. COMPLETED, CANCELLED, ACTIVE)'),
  title: z.string().optional().describe('New title for the task or reminder'),
  schedule: z.string().optional().describe('New schedule or time description (e.g. "tomorrow at 8 PM" or ISO string)'),
  description: z.string().optional().describe('Updated notes or details for the task'),
});

export const updateTaskTool: JarvisTool<
  z.infer<typeof UpdateTaskInputSchema>,
  { success: boolean; taskId?: string; title?: string; status?: string; message: string }
> = {
  name: 'task_update',
  description: 'Updates an existing task or reminder (e.g. update status to COMPLETED, reschedule time, or rename). Can find the task by ID or by title keywords (e.g. "rent").',
  category: 'PRODUCTIVITY',
  riskLevel: 'LOW_RISK',
  inputSchema: UpdateTaskInputSchema,
  async execute(input, context) {
    let task = null;

    if (input.taskId) {
      task = await prisma.task.findFirst({
        where: { id: input.taskId, userId: context.userId },
      });
    }

    if (!task && input.query) {
      const q = input.query.toLowerCase().trim();
      const candidates = await prisma.task.findMany({
        where: { userId: context.userId },
        orderBy: { updatedAt: 'desc' },
      });
      task = candidates.find(
        (t) => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))
      );
    }

    if (!task) {
      // Check event reminders if no task matched
      if (input.query) {
        const q = input.query.toLowerCase().trim();
        const reminders = await prisma.eventReminder.findMany({
          where: { userId: context.userId },
          orderBy: { createdAt: 'desc' },
        });
        const reminder = reminders.find(
          (r) => r.title.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q))
        );
        if (reminder) {
          const newStatus = input.status === 'COMPLETED' ? 'COMPLETED' : input.status === 'CANCELLED' ? 'CANCELLED' : reminder.status;
          await prisma.eventReminder.update({
            where: { id: reminder.id },
            data: { status: newStatus },
          });
          return {
            success: true,
            taskId: reminder.id,
            title: reminder.title,
            status: newStatus,
            message: `Updated reminder "${reminder.title}" to status ${newStatus}.`,
          };
        }
      }

      return {
        success: false,
        message: `Could not find an active task or reminder matching "${input.query || input.taskId}".`,
      };
    }

    let nextRun: Date | undefined;
    if (input.schedule) {
      const parsed = new Date(input.schedule);
      if (!isNaN(parsed.getTime())) {
        nextRun = parsed;
      }
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.schedule ? { schedule: input.schedule, nextRunAt: nextRun } : {}),
      },
    });

    return {
      success: true,
      taskId: updated.id,
      title: updated.title,
      status: updated.status,
      message: `Updated task "${updated.title}" to status ${updated.status}.`,
    };
  },
};

const CompleteTaskInputSchema = z.object({
  query: z.string().optional().describe('Title, keyword, or summary of the task/reminder to mark as completed (e.g. "rent", "pay rent", "call mom", "grocery")'),
  taskId: z.string().optional().describe('UUID of the task or reminder (if known)'),
});

export const completeTaskTool: JarvisTool<
  z.infer<typeof CompleteTaskInputSchema>,
  { success: boolean; taskId?: string; title?: string; message: string }
> = {
  name: 'task_complete',
  description: 'Marks a reminder or task as COMPLETED in the database. Use whenever the user states they finished, paid, completed, or handled a reminder (e.g. "I paid the rent", "Done with grocery shopping", "I called mom").',
  category: 'PRODUCTIVITY',
  riskLevel: 'LOW_RISK',
  inputSchema: CompleteTaskInputSchema,
  async execute(input, context) {
    let task = null;

    if (input.taskId) {
      task = await prisma.task.findFirst({
        where: { id: input.taskId, userId: context.userId },
      });
    }

    if (!task && input.query) {
      const q = input.query.toLowerCase().trim();
      const candidates = await prisma.task.findMany({
        where: { userId: context.userId, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
      });
      task = candidates.find(
        (t) => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))
      );
      if (!task) {
        // Fallback: search across all tasks including completed/paused
        const allCandidates = await prisma.task.findMany({
          where: { userId: context.userId },
          orderBy: { updatedAt: 'desc' },
        });
        task = allCandidates.find(
          (t) => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))
        );
      }
    }

    if (task) {
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { status: 'COMPLETED' },
      });
      return {
        success: true,
        taskId: updated.id,
        title: updated.title,
        message: `Marked "${updated.title}" as completed.`,
      };
    }

    // Check location/event reminders
    if (input.query) {
      const q = input.query.toLowerCase().trim();
      const reminders = await prisma.eventReminder.findMany({
        where: { userId: context.userId, status: 'PENDING' },
      });
      const reminder = reminders.find(
        (r) => r.title.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q))
      );
      if (reminder) {
        await prisma.eventReminder.update({
          where: { id: reminder.id },
          data: { status: 'COMPLETED' },
        });
        return {
          success: true,
          taskId: reminder.id,
          title: reminder.title,
          message: `Marked event reminder "${reminder.title}" as completed.`,
        };
      }
    }

    return {
      success: false,
      message: `No active task or reminder matching "${input.query || input.taskId}" was found.`,
    };
  },
};

const DeleteTaskInputSchema = z.object({
  query: z.string().optional().describe('Title, keyword, or summary of the task/reminder to delete or cancel (e.g. "rent", "meeting")'),
  taskId: z.string().optional().describe('UUID of the task or reminder to delete (if known)'),
});

export const deleteTaskTool: JarvisTool<
  z.infer<typeof DeleteTaskInputSchema>,
  { success: boolean; taskId?: string; title?: string; message: string }
> = {
  name: 'task_delete',
  description: 'Deletes or cancels a task or reminder from the database. Use when the user asks to remove, delete, or cancel a reminder.',
  category: 'PRODUCTIVITY',
  riskLevel: 'LOW_RISK',
  inputSchema: DeleteTaskInputSchema,
  async execute(input, context) {
    let task = null;

    if (input.taskId) {
      task = await prisma.task.findFirst({
        where: { id: input.taskId, userId: context.userId },
      });
    }

    if (!task && input.query) {
      const q = input.query.toLowerCase().trim();
      const candidates = await prisma.task.findMany({
        where: { userId: context.userId },
        orderBy: { updatedAt: 'desc' },
      });
      task = candidates.find(
        (t) => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))
      );
    }

    if (task) {
      await prisma.task.delete({ where: { id: task.id } });
      return {
        success: true,
        taskId: task.id,
        title: task.title,
        message: `Deleted reminder "${task.title}".`,
      };
    }

    // Check location/event reminders
    if (input.query) {
      const q = input.query.toLowerCase().trim();
      const reminders = await prisma.eventReminder.findMany({
        where: { userId: context.userId },
      });
      const reminder = reminders.find(
        (r) => r.title.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q))
      );
      if (reminder) {
        await prisma.eventReminder.delete({ where: { id: reminder.id } });
        return {
          success: true,
          taskId: reminder.id,
          title: reminder.title,
          message: `Deleted event reminder "${reminder.title}".`,
        };
      }
    }

    return {
      success: false,
      message: `No task or reminder matching "${input.query || input.taskId}" was found to delete.`,
    };
  },
};
