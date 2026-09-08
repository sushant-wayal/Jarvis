import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { eventEvaluationEngine } from '@/modules/events/event-evaluation-engine';
import { eventService } from '@/modules/events/event-service';
import { geocodingService } from '@/modules/location/geocoding-service';
import { locationService } from '@/modules/location/location-service';
import { notificationService } from '@/modules/notifications/notification-service';

describe('Jarvis V2 Extension: Location Awareness & Event-Based Reminders', () => {
  const testUserId = 'test-location-user';

  it('calculates Haversine distances accurately', () => {
    // Distance between Panaji (15.4909, 73.8278) and Calangute (15.5439, 73.7554) ~9.7km
    const distanceM = geocodingService.calculateDistanceMeters(15.4909, 73.8278, 15.5439, 73.7554);
    expect(distanceM).toBeGreaterThan(8000);
    expect(distanceM).toBeLessThan(12000);
  });

  it('reverse geocodes coordinates to semantic city and state', async () => {
    const geo = await geocodingService.reverseGeocode(15.4909, 73.8278);
    expect(geo.state || geo.city).toContain('Goa');
  });

  it('Step 1-6: End-to-End Goa Trip & Parasailing Reminder Lifecycle', async () => {
    // 0. Ensure user exists for Prisma FK constraints
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: { id: testUserId, name: 'Sushant' },
    });

    // Cleanup previous test state
    await prisma.eventReminder.deleteMany({ where: { userId: testUserId } });
    await prisma.userEvent.deleteMany({ where: { userId: testUserId } });
    await prisma.notification.deleteMany({ where: { userId: testUserId } });

    // Step 1: User says "I'm going to Goa next month" -> Create Goa Trip Event
    const goaTrip = await eventService.createEvent({
      userId: testUserId,
      title: 'Goa Trip',
      locationName: 'Goa',
      type: 'TRIP',
      status: 'PLANNED',
    });
    expect(goaTrip.id).toBeDefined();
    expect(goaTrip.title).toBe('Goa Trip');

    // Step 2: User says "Make sure I go parasailing there" -> Auto-linked Event Reminder
    const reminder = await eventService.createEventReminder({
      userId: testUserId,
      title: 'Go parasailing',
      targetLocation: 'Goa',
      description: 'You mentioned wanting to go parasailing here.',
      triggerType: 'LOCATION_ENTER',
      cooldownMinutes: 120,
    });
    expect(reminder.id).toBeDefined();
    expect(reminder.eventId).toBe(goaTrip.id);
    expect(reminder.status).toBe('PENDING');

    // Step 3: Phone GPS reports user is in Bangalore (12.9716, 77.5946) -> Should NOT trigger
    const bglContext = await locationService.updateLocation({
      userId: testUserId,
      latitude: 12.9716,
      longitude: 77.5946,
    });
    const evalResult1 = await eventEvaluationEngine.evaluateLocationUpdate(testUserId, bglContext);
    expect(evalResult1.triggeredCount).toBe(0);

    // Step 4: Phone GPS reports user arrived in Goa (15.4909, 73.8278) -> Should TRIGGER reminder!
    const goaContext = await locationService.updateLocation({
      userId: testUserId,
      latitude: 15.4909,
      longitude: 73.8278,
    });
    await eventEvaluationEngine.evaluateLocationUpdate(testUserId, goaContext);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify Notification Created
    const notifs = await notificationService.listNotifications(testUserId);
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].body).toContain('parasailing');

    // Verify Event transitioned to ACTIVE
    const events = await eventService.listEvents(testUserId);
    const updatedGoa = events.find((e) => e.id === goaTrip.id);
    expect(updatedGoa?.status).toBe('ACTIVE');

    // Step 5: Deduplication Check — Send another GPS update inside Goa -> NO duplicate notification!
    const evalResult3 = await eventEvaluationEngine.evaluateLocationUpdate(testUserId, goaContext);
    expect(evalResult3.triggeredCount).toBe(0);

    // Step 6: User says "I already went parasailing" -> Mark COMPLETED
    const updatedReminder = await eventService.updateEventReminder(reminder.id, testUserId, {
      status: 'COMPLETED',
    });
    expect(updatedReminder?.status).toBe('COMPLETED');
  }, 25000);

  it('handles Event Cancellation ("I am not going to Goa anymore")', async () => {
    // Create new trip
    const trip = await eventService.createEvent({
      userId: testUserId,
      title: 'Manali Trip',
      locationName: 'Manali',
    });

    const rem = await eventService.createEventReminder({
      userId: testUserId,
      eventId: trip.id,
      title: 'Carry warm jacket',
      targetLocation: 'Manali',
    });

    // Cancel trip
    await eventService.updateEvent(trip.id, testUserId, { status: 'CANCELLED' });

    // Verify associated reminders are also cancelled
    const reminders = await eventService.listEventReminders(testUserId);
    const manaliRem = reminders.find((r) => r.id === rem.id);
    expect(manaliRem?.status).toBe('CANCELLED');
  }, 20000);

  it('handles Recurring Location Reminders ("Every time I am in Goa...")', async () => {
    const recReminder = await eventService.createEventReminder({
      userId: testUserId,
      title: 'Try seafood at Britto',
      targetLocation: 'Goa',
      isRecurring: true,
      cooldownMinutes: 1,
    });

    expect(recReminder.isRecurring).toBe(true);

    const goaContext = await locationService.updateLocation({
      userId: testUserId,
      latitude: 15.4909,
      longitude: 73.8278,
    });

    // First trigger
    const res1 = await eventEvaluationEngine.evaluateLocationUpdate(testUserId, goaContext);
    expect(res1.triggeredCount).toBe(1);

    // Immediate duplicate check -> blocked by cooldown
    const res2 = await eventEvaluationEngine.evaluateLocationUpdate(testUserId, goaContext);
    expect(res2.triggeredCount).toBe(0);
  }, 20000);

  it('correctly associates known place inside geofence and clears knownPlaceId outside geofence', async () => {
    // Cleanup any existing known places for test user
    await prisma.knownPlace.deleteMany({ where: { userId: testUserId } });

    // Save a known place (e.g. PG with 100m radius)
    const place = await locationService.saveKnownPlace({
      userId: testUserId,
      name: 'Test PG',
      latitude: 12.9875,
      longitude: 77.6980,
      radiusMeters: 100,
    });

    // 1. Move to within 5m of Test PG -> should match 'Test PG'
    const inside = await locationService.updateLocation({
      userId: testUserId,
      latitude: 12.98751,
      longitude: 77.69801,
    });
    expect(inside.knownPlace?.name).toBe('Test PG');
    const dbLocInside = await locationService.getCurrentLocation(testUserId);
    expect(dbLocInside?.knownPlace?.name).toBe('Test PG');

    // 2. Move to 800m away (outside 200m radius) -> should clear knownPlace to undefined/null
    const outside = await locationService.updateLocation({
      userId: testUserId,
      latitude: 12.9837,
      longitude: 77.7043,
    });
    expect(outside.knownPlace).toBeUndefined();
    const dbLocOutside = await locationService.getCurrentLocation(testUserId);
    expect(dbLocOutside?.knownPlace).toBeUndefined();
  }, 20000);
});
