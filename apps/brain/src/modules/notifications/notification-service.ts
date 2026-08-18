import { NotificationItem } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';

export interface CreateNotificationParams {
  userId: string;
  taskId?: string;
  title: string;
  body: string;
  deepLink?: string;
}

export class NotificationService {
  async createNotification(params: CreateNotificationParams): Promise<NotificationItem> {
    const { userId, taskId, title, body, deepLink } = params;

    // Deduplication check: Don't create identical unread notification within 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        title,
        createdAt: { gte: fiveMinutesAgo },
      },
    });

    if (existing) {
      return this.mapToItem(existing);
    }

    const created = await prisma.notification.create({
      data: {
        userId,
        taskId,
        title,
        body,
        deepLink,
        status: 'SENT',
      },
    });

    return this.mapToItem(created);
  }

  async listNotifications(userId: string, limit = 20): Promise<NotificationItem[]> {
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return notifications.map((n) => this.mapToItem(n));
  }

  async dismissNotification(id: string, userId: string): Promise<boolean> {
    const existing = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!existing) return false;

    await prisma.notification.update({
      where: { id },
      data: { status: 'DISMISSED' },
    });

    return true;
  }

  private mapToItem(n: {
    id: string;
    userId: string;
    taskId: string | null;
    title: string;
    body: string;
    deepLink: string | null;
    status: string;
    createdAt: Date;
  }): NotificationItem {
    return {
      id: n.id,
      userId: n.userId,
      taskId: n.taskId ?? undefined,
      title: n.title,
      body: n.body,
      deepLink: n.deepLink ?? undefined,
      status: n.status as NotificationItem['status'],
      createdAt: n.createdAt.toISOString(),
    };
  }
}

export const notificationService = new NotificationService();
