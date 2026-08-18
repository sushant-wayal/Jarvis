import { CreateTaskRequest, TaskItem, UpdateTaskRequest } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';

export class TaskService {
  async createTask(input: CreateTaskRequest): Promise<TaskItem> {
    const userId = input.userId || 'default-user';
    let nextRun: Date | undefined;

    if (input.nextRunAt) {
      nextRun = new Date(input.nextRunAt);
    } else if (input.schedule) {
      const parsed = new Date(input.schedule);
      if (!isNaN(parsed.getTime())) {
        nextRun = parsed;
      }
    }

    const task = await prisma.task.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        description: input.description,
        status: 'ACTIVE',
        schedule: input.schedule,
        condition: input.condition,
        timezone: input.timezone || 'UTC',
        nextRunAt: nextRun,
      },
    });

    return this.mapToItem(task);
  }

  async listTasks(userId: string, status?: string): Promise<TaskItem[]> {
    const where: Record<string, unknown> = { userId };
    if (status && status !== 'ALL') {
      where.status = status;
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { nextRunAt: 'asc' },
    });

    return tasks.map((t) => this.mapToItem(t));
  }

  async getTask(id: string, userId: string): Promise<TaskItem | null> {
    const task = await prisma.task.findFirst({
      where: { id, userId },
    });
    return task ? this.mapToItem(task) : null;
  }

  async updateTask(id: string, userId: string, data: UpdateTaskRequest): Promise<TaskItem | null> {
    const existing = await prisma.task.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (data.title) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status) updateData.status = data.status;
    if (data.schedule !== undefined) updateData.schedule = data.schedule;
    if (data.condition !== undefined) updateData.condition = data.condition;
    if (data.nextRunAt !== undefined) {
      updateData.nextRunAt = data.nextRunAt ? new Date(data.nextRunAt) : null;
    }

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    return this.mapToItem(updated);
  }

  async deleteTask(id: string, userId: string): Promise<boolean> {
    const existing = await prisma.task.findFirst({ where: { id, userId } });
    if (!existing) return false;

    await prisma.task.delete({ where: { id } });
    return true;
  }

  private mapToItem(task: {
    id: string;
    userId: string;
    type: string;
    title: string;
    description: string | null;
    status: string;
    schedule: string | null;
    condition: string | null;
    timezone: string;
    nextRunAt: Date | null;
    lastRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): TaskItem {
    return {
      id: task.id,
      userId: task.userId,
      type: task.type as TaskItem['type'],
      title: task.title,
      description: task.description ?? undefined,
      status: task.status as TaskItem['status'],
      schedule: task.schedule ?? undefined,
      condition: task.condition ?? undefined,
      timezone: task.timezone,
      nextRunAt: task.nextRunAt?.toISOString(),
      lastRunAt: task.lastRunAt?.toISOString(),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}

export const taskService = new TaskService();
