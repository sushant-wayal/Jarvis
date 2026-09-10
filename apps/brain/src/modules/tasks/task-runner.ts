import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { notificationService } from '@/modules/notifications/notification-service';

export class TaskRunner {
  /**
   * Executes due tasks idempotently and creates proactive user notifications
   */
  async runDueTasks(): Promise<{ processed: number; executed: number }> {
    const now = new Date();

    const dueTasks = await prisma.task.findMany({
      where: {
        status: 'ACTIVE',
        nextRunAt: {
          lte: now,
        },
      },
      take: 20,
    });

    let executed = 0;

    for (const task of dueTasks) {
      const startTime = Date.now();
      try {
        logger.info(`Executing due task: ${task.title}`, { taskId: task.id });

        // 1. Dispatch Notification
        await notificationService.createNotification({
          userId: task.userId,
          taskId: task.id,
          title: `Reminder: ${task.title}`,
          body: task.description || task.title,
          deepLink: `/tasks?id=${task.id}`,
        });

        // 2. Compute next execution or mark COMPLETED
        let newStatus = task.status;
        let nextRun: Date | null = null;

        if (task.type === 'REMINDER' || task.type === 'SCHEDULED_TASK') {
          newStatus = 'COMPLETED';
        } else if (task.type === 'RECURRING_TASK') {
          // Default daily recurrence step
          nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);
        }

        const durationMs = Date.now() - startTime;

        // 3. Persist TaskExecution and update task state atomically
        await prisma.$transaction([
          prisma.taskExecution.create({
            data: {
              taskId: task.id,
              status: 'SUCCESS',
              result: JSON.stringify({ message: `Triggered notification for "${task.title}"` }),
              durationMs,
            },
          }),
          prisma.task.update({
            where: { id: task.id },
            data: {
              status: newStatus,
              lastRunAt: now,
              nextRunAt: nextRun,
            },
          }),
        ]);

        executed++;
      } catch (err) {
        const durationMs = Date.now() - startTime;
        logger.error(`Task execution failed: ${task.id}`, err);

        await prisma.taskExecution.create({
          data: {
            taskId: task.id,
            status: 'FAILED',
            result: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            durationMs,
          },
        });
      }
    }

    return { processed: dueTasks.length, executed };
  }
}

export const taskRunner = new TaskRunner();
