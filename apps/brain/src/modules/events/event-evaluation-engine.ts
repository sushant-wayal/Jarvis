import { LocationContext } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { geocodingService } from '@/modules/location/geocoding-service';
import { notificationService } from '@/modules/notifications/notification-service';

export class EventEvaluationEngine {
  /**
   * Evaluates current user location context against pending event reminders
   */
  async evaluateLocationUpdate(userId: string, location: LocationContext): Promise<{ triggeredCount: number }> {
    const now = new Date();

    // 1. Fetch pending event reminders for user
    const pendingReminders = await prisma.eventReminder.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'TRIGGERED'] },
      },
      include: {
        event: true,
      },
    });

    let triggeredCount = 0;

    for (const reminder of pendingReminders) {
      // Check expiration
      if (reminder.expiresAt && reminder.expiresAt < now) {
        await prisma.eventReminder.update({
          where: { id: reminder.id },
          data: { status: 'EXPIRED' },
        });
        continue;
      }

      // Check anti-spam cooldown window
      if (reminder.lastTriggeredAt) {
        const cooldownMs = reminder.cooldownMinutes * 60 * 1000;
        const timeSinceLast = now.getTime() - reminder.lastTriggeredAt.getTime();
        if (timeSinceLast < cooldownMs) {
          continue; // On cooldown, do not spam duplicate reminder
        }
      }

      // If already triggered once and not recurring, skip
      if (reminder.status === 'TRIGGERED' && !reminder.isRecurring) {
        continue;
      }

      // 2. Evaluate Location Matching
      let isMatch = false;

      // Coordinate distance check
      if (reminder.targetLatitude && reminder.targetLongitude) {
        const distance = geocodingService.calculateDistanceMeters(
          location.latitude,
          location.longitude,
          reminder.targetLatitude,
          reminder.targetLongitude
        );
        const radius = reminder.radiusMeters || 5000;
        if (distance <= radius) {
          isMatch = true;
        }
      }

      // Semantic place / city / state string check
      if (!isMatch && reminder.targetLocation) {
        const target = reminder.targetLocation.toLowerCase().trim();
        const currentCity = location.city?.toLowerCase();
        const currentState = location.state?.toLowerCase();
        const currentArea = location.area?.toLowerCase();
        const currentPlace = location.knownPlace?.name?.toLowerCase();

        if (
          (currentCity && (currentCity.includes(target) || target.includes(currentCity))) ||
          (currentState && (currentState.includes(target) || target.includes(currentState))) ||
          (currentArea && (currentArea.includes(target) || target.includes(currentArea))) ||
          (currentPlace && (currentPlace.includes(target) || target.includes(currentPlace)))
        ) {
          isMatch = true;
        }
      }

      // 3. Trigger Reminder Notification & Update States
      if (isMatch) {
        triggeredCount++;
        logger.info(`Event reminder triggered: ${reminder.title}`, {
          reminderId: reminder.id,
          targetLocation: reminder.targetLocation,
          currentCity: location.city,
        });

        // Compose conversational, human notification body
        const locName = location.city || location.state || reminder.targetLocation || 'here';
        const notifTitle = `Jarvis`;
        const notifBody = `You're in ${locName}. ${reminder.description || `You wanted to remember: ${reminder.title}`}`;

        await notificationService.createNotification({
          userId,
          title: notifTitle,
          body: notifBody,
          deepLink: `/tasks?eventReminderId=${reminder.id}`,
        });

        // Update reminder state
        const nextStatus = reminder.isRecurring ? 'TRIGGERED' : 'COMPLETED';
        await prisma.eventReminder.update({
          where: { id: reminder.id },
          data: {
            status: nextStatus,
            lastTriggeredAt: now,
          },
        });

        // If linked to an upcoming/planned event, transition event to ACTIVE
        if (reminder.eventId && reminder.event && reminder.event.status !== 'ACTIVE') {
          await prisma.userEvent.update({
            where: { id: reminder.eventId },
            data: { status: 'ACTIVE' },
          });
        }
      }
    }

    return { triggeredCount };
  }
}

export const eventEvaluationEngine = new EventEvaluationEngine();
