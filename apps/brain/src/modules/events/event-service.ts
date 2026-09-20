import {
  CreateEventReminderRequest,
  CreateUserEventRequest,
  EventReminderItem,
  UpdateEventReminderRequest,
  UpdateUserEventRequest,
  UserEventItem,
} from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { geocodingService } from '@/modules/location/geocoding-service';

export class EventService {
  async createEvent(input: CreateUserEventRequest): Promise<UserEventItem> {
    const userId = input.userId || 'default-user';
    let lat = input.latitude;
    let lon = input.longitude;

    if ((!lat || !lon) && input.locationName) {
      const geo = await geocodingService.forwardGeocode(input.locationName);
      if (geo) {
        lat = geo.latitude;
        lon = geo.longitude;
      }
    }

    const event = await prisma.userEvent.create({
      data: {
        userId,
        type: input.type || 'TRIP',
        title: input.title,
        description: input.description,
        locationName: input.locationName,
        latitude: lat,
        longitude: lon,
        radiusMeters: input.radiusMeters || 10000,
        startAt: input.startAt ? new Date(input.startAt) : undefined,
        endAt: input.endAt ? new Date(input.endAt) : undefined,
        status: input.status || 'PLANNED',
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      },
    });

    return this.mapEventToItem(event);
  }

  async listEvents(userId: string, status?: string): Promise<UserEventItem[]> {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const events = await prisma.userEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return events.map((e) => this.mapEventToItem(e));
  }

  async updateEvent(id: string, userId: string, data: UpdateUserEventRequest): Promise<UserEventItem | null> {
    const existing = await prisma.userEvent.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (data.title) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.locationName !== undefined) updateData.locationName = data.locationName;
    if (data.status) updateData.status = data.status;
    if (data.startAt !== undefined) updateData.startAt = data.startAt ? new Date(data.startAt) : null;
    if (data.endAt !== undefined) updateData.endAt = data.endAt ? new Date(data.endAt) : null;
    if (data.metadata) updateData.metadata = JSON.stringify(data.metadata);

    const updated = await prisma.userEvent.update({
      where: { id },
      data: updateData,
    });

    // If event was cancelled, also cancel pending reminders
    if (data.status === 'CANCELLED') {
      await prisma.eventReminder.updateMany({
        where: { eventId: id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    }

    return this.mapEventToItem(updated);
  }

  async deleteEvent(id: string, userId: string): Promise<boolean> {
    const existing = await prisma.userEvent.findFirst({ where: { id, userId } });
    if (!existing) return false;

    await prisma.userEvent.delete({ where: { id } });
    return true;
  }

  async createEventReminder(input: CreateEventReminderRequest): Promise<EventReminderItem> {
    const userId = input.userId || 'default-user';
    let lat = input.targetLatitude;
    let lon = input.targetLongitude;

    if ((!lat || !lon) && input.targetLocation) {
      const geo = await geocodingService.forwardGeocode(input.targetLocation);
      if (geo) {
        lat = geo.latitude;
        lon = geo.longitude;
      }
    }

    // Auto-link to existing event if matching location/title exists
    let eventId = input.eventId;
    if (!eventId && input.targetLocation) {
      const matched = await prisma.userEvent.findFirst({
        where: {
          userId,
          status: { in: ['PLANNED', 'UPCOMING', 'ACTIVE'] },
          OR: [
            { locationName: { contains: input.targetLocation } },
            { title: { contains: input.targetLocation } },
          ],
        },
      });
      if (matched) eventId = matched.id;
    }

    const reminder = await prisma.eventReminder.create({
      data: {
        userId,
        eventId,
        title: input.title,
        description: input.description,
        triggerType: input.triggerType || 'LOCATION_ENTER',
        targetLocation: input.targetLocation,
        targetLatitude: lat,
        targetLongitude: lon,
        radiusMeters: input.radiusMeters || 5000,
        isRecurring: input.isRecurring ?? false,
        status: 'PENDING',
        cooldownMinutes: input.cooldownMinutes || 120,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      },
    });

    return this.mapReminderToItem(reminder);
  }

  async listEventReminders(userId: string, status?: string): Promise<EventReminderItem[]> {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const reminders = await prisma.eventReminder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return reminders.map((r) => this.mapReminderToItem(r));
  }

  async updateEventReminder(id: string, userId: string, data: UpdateEventReminderRequest): Promise<EventReminderItem | null> {
    const existing = await prisma.eventReminder.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (data.title) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status) updateData.status = data.status;
    if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
    if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

    const updated = await prisma.eventReminder.update({
      where: { id },
      data: updateData,
    });

    return this.mapReminderToItem(updated);
  }

  async deleteEventReminder(id: string, userId: string): Promise<boolean> {
    const existing = await prisma.eventReminder.findFirst({ where: { id, userId } });
    if (!existing) return false;

    await prisma.eventReminder.delete({ where: { id } });
    return true;
  }

  private mapEventToItem(e: {
    id: string;
    userId: string;
    type: string;
    title: string;
    description: string | null;
    locationName: string | null;
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number | null;
    startAt: Date | null;
    endAt: Date | null;
    status: string;
    metadata: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserEventItem {
    return {
      id: e.id,
      userId: e.userId,
      type: e.type as UserEventItem['type'],
      title: e.title,
      description: e.description ?? undefined,
      locationName: e.locationName ?? undefined,
      latitude: e.latitude ?? undefined,
      longitude: e.longitude ?? undefined,
      radiusMeters: e.radiusMeters ?? undefined,
      startAt: e.startAt?.toISOString(),
      endAt: e.endAt?.toISOString(),
      status: e.status as UserEventItem['status'],
      metadata: e.metadata ? JSON.parse(e.metadata) : undefined,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  private mapReminderToItem(r: {
    id: string;
    userId: string;
    eventId: string | null;
    title: string;
    description: string | null;
    triggerType: string;
    targetLocation: string | null;
    targetLatitude: number | null;
    targetLongitude: number | null;
    radiusMeters: number | null;
    isRecurring: boolean;
    status: string;
    lastTriggeredAt: Date | null;
    cooldownMinutes: number;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): EventReminderItem {
    return {
      id: r.id,
      userId: r.userId,
      eventId: r.eventId ?? undefined,
      title: r.title,
      description: r.description ?? undefined,
      triggerType: r.triggerType as EventReminderItem['triggerType'],
      targetLocation: r.targetLocation ?? undefined,
      targetLatitude: r.targetLatitude ?? undefined,
      targetLongitude: r.targetLongitude ?? undefined,
      radiusMeters: r.radiusMeters ?? undefined,
      isRecurring: r.isRecurring,
      status: r.status as EventReminderItem['status'],
      lastTriggeredAt: r.lastTriggeredAt?.toISOString(),
      cooldownMinutes: r.cooldownMinutes,
      expiresAt: r.expiresAt?.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

export const eventService = new EventService();
