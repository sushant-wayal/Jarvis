import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { eventService } from '@/modules/events/event-service';
import { locationService } from '@/modules/location/location-service';
import { JarvisTool } from './types';
import { semanticMatcher } from '../brain/semantic-matcher';

const CreateEventInputSchema = z.object({
  title: z.string().describe('Title of the event or trip, e.g. "Goa Trip", "Bangalore Visit"'),
  locationName: z.string().optional().describe('Target city or location, e.g. "Goa", "Mumbai"'),
  type: z.enum(['TRIP', 'MEETING', 'APPOINTMENT', 'PLAN', 'ACTIVITY', 'DEADLINE', 'PERSONAL_EVENT']).optional().default('TRIP'),
  description: z.string().optional().describe('Details or intentions for this event'),
  startAt: z.string().optional().describe('Optional start datetime or date description'),
});

export const createEventTool: JarvisTool<z.infer<typeof CreateEventInputSchema>, { success: boolean; eventId: string; title: string; location?: string }> = {
  name: 'event_create',
  description: 'Creates a future trip, plan, or upcoming event in the user schedule.',
  category: 'PRODUCTIVITY',
  riskLevel: 'LOW_RISK',
  inputSchema: CreateEventInputSchema,
  async execute(input, context) {
    const event = await eventService.createEvent({
      userId: context.userId,
      title: input.title,
      locationName: input.locationName,
      type: input.type || 'TRIP',
      description: input.description,
    });

    return {
      success: true,
      eventId: event.id,
      title: event.title,
      location: event.locationName,
    };
  },
};

const CreateEventReminderInputSchema = z.object({
  title: z.string().describe('What to remind the user about, e.g. "Go parasailing", "Check passport"'),
  targetLocation: z.string().describe('Location or place that triggers this reminder, e.g. "Goa", "Airport", "Home"'),
  triggerType: z.enum(['LOCATION_ENTER', 'LOCATION_NEAR', 'LOCATION_EXIT', 'EVENT_ACTIVE']).optional().default('LOCATION_ENTER'),
  isRecurring: z.boolean().optional().default(false).describe('Set to true if this should trigger every time the user is in this location'),
  description: z.string().optional().describe('Additional context or instructions'),
});

export const createEventReminderTool: JarvisTool<
  z.infer<typeof CreateEventReminderInputSchema>,
  { success: boolean; reminderId: string; title: string; targetLocation: string }
> = {
  name: 'event_reminder_create',
  description: 'Creates a location-aware or event-triggered reminder (e.g. "When I reach Goa, remind me to go parasailing").',
  category: 'PRODUCTIVITY',
  riskLevel: 'LOW_RISK',
  inputSchema: CreateEventReminderInputSchema,
  async execute(input, context) {
    const reminder = await eventService.createEventReminder({
      userId: context.userId,
      title: input.title,
      targetLocation: input.targetLocation,
      triggerType: input.triggerType || 'LOCATION_ENTER',
      isRecurring: input.isRecurring ?? false,
      description: input.description,
    });

    return {
      success: true,
      reminderId: reminder.id,
      title: reminder.title,
      targetLocation: reminder.targetLocation || input.targetLocation,
    };
  },
};

const PlaceSaveInputSchema = z.object({
  name: z.string().describe('Name of the place, e.g. "Home", "Office", "Gym"'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().optional().default(200),
});

export const placeSaveTool: JarvisTool<
  z.infer<typeof PlaceSaveInputSchema>,
  {
    success: boolean;
    placeId: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    message: string;
  }
> = {
  name: 'place_save',
  description: 'Saves the current or specified coordinates as a named semantic place (e.g. Home, Office, Gym, PG).',
  category: 'LOCATION',
  riskLevel: 'LOW_RISK',
  inputSchema: PlaceSaveInputSchema,
  async execute(input, context) {
    let lat = input.latitude;
    let lon = input.longitude;

    if (!lat || !lon) {
      const curr = await locationService.getCurrentLocation(context.userId);
      lat = curr?.latitude || 19.076;
      lon = curr?.longitude || 72.8777;
    }

    const place = await locationService.saveKnownPlace({
      userId: context.userId,
      name: input.name,
      latitude: lat,
      longitude: lon,
      radiusMeters: input.radiusMeters || 200,
    });

    // Automatically associate current location with this known place
    try {
      await prisma.userLocationState.updateMany({
        where: { userId: context.userId },
        data: { knownPlaceId: place.id },
      });
    } catch {
      // ignore
    }

    return {
      success: true,
      placeId: place.id,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      radiusMeters: place.radiusMeters,
      message: `Saved "${place.name}" at coordinates (${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}) with a ${place.radiusMeters}m geofence.`,
    };
  },
};

const LocationGetInputSchema = z.object({});

export const locationGetTool: JarvisTool<z.infer<typeof LocationGetInputSchema>, { city?: string; state?: string; country?: string; knownPlace?: string }> = {
  name: 'location_get',
  description: 'Retrieves the user current detected location, city, state, or known place.',
  category: 'LOCATION',
  riskLevel: 'SAFE',
  inputSchema: LocationGetInputSchema,
  async execute(_input, context) {
    const loc = await locationService.getCurrentLocation(context.userId);
    return {
      city: loc?.city,
      state: loc?.state,
      country: loc?.country,
      knownPlace: loc?.knownPlace?.name,
    };
  },
};

const ListEventsInputSchema = z.object({
  status: z.enum(['PLANNED', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ALL']).optional().default('ALL'),
});

export const listEventsTool: JarvisTool<
  z.infer<typeof ListEventsInputSchema>,
  { events: Array<{ id: string; title: string; type: string; status: string; locationName?: string; startAt?: string }> }
> = {
  name: 'event_list',
  description: 'Lists all planned trips, upcoming meetings, appointments, and events.',
  category: 'PRODUCTIVITY',
  riskLevel: 'SAFE',
  inputSchema: ListEventsInputSchema,
  async execute(input, context) {
    const events = await eventService.listEvents(
      context.userId,
      input.status === 'ALL' ? undefined : input.status
    );
    return {
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        status: e.status,
        locationName: e.locationName,
        startAt: e.startAt,
      })),
    };
  },
};

const UpdateEventInputSchema = z.object({
  eventId: z.string().optional().describe('ID of the event or trip (if known)'),
  query: z.string().optional().describe('Title or destination keyword of the event/trip if ID is unknown (e.g. "Goa", "trip", "meeting")'),
  status: z.enum(['PLANNED', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional().describe('New status for the event/trip'),
  title: z.string().optional().describe('Updated title for the event'),
  locationName: z.string().optional().describe('Updated city or location destination'),
  description: z.string().optional().describe('Updated details or notes'),
});

export const updateEventTool: JarvisTool<
  z.infer<typeof UpdateEventInputSchema>,
  { success: boolean; eventId?: string; title?: string; status?: string; message: string }
> = {
  name: 'event_update',
  description: 'Updates a planned trip, meeting, or event (e.g. mark as COMPLETED, CANCELLED, or change destination/dates). Can find by ID or title keyword.',
  category: 'PRODUCTIVITY',
  riskLevel: 'LOW_RISK',
  inputSchema: UpdateEventInputSchema,
  async execute(input, context) {
    let event = null;
    if (input.eventId) {
      event = await prisma.userEvent.findFirst({
        where: { id: input.eventId, userId: context.userId },
      });
    }

    if (!event && input.query) {
      const all = await prisma.userEvent.findMany({
        where: { userId: context.userId },
        orderBy: { createdAt: 'desc' },
      });
      const match = await semanticMatcher.matchItem(
        input.query,
        all,
        (e) => `${e.title} ${e.locationName || ''} ${e.description || ''}`,
        (e) => e.id,
        'event or trip'
      );
      if (match.status === 'AMBIGUOUS' && match.ambiguousCandidates?.length) {
        return {
          success: false,
          message: `Found multiple events matching "${input.query}": ${match.ambiguousCandidates.map((e) => `"${e.title}"`).join(', ')}. Please specify which one to update.`,
        };
      }
      event = match.matchedItem;
    }

    if (!event) {
      return {
        success: false,
        message: `Could not find an event or trip matching "${input.query || input.eventId}".`,
      };
    }

    const updated = await eventService.updateEvent(event.id, context.userId, {
      ...(input.title ? { title: input.title } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.locationName ? { locationName: input.locationName } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    });

    return {
      success: true,
      eventId: updated?.id,
      title: updated?.title,
      status: updated?.status,
      message: `Updated event "${updated?.title}" to status ${updated?.status}.`,
    };
  },
};

const DeleteEventInputSchema = z.object({
  eventId: z.string().optional().describe('ID of the event or trip (if known)'),
  query: z.string().optional().describe('Title or destination keyword of the event/trip to delete/cancel (e.g. "Goa")'),
});

export const deleteEventTool: JarvisTool<
  z.infer<typeof DeleteEventInputSchema>,
  { success: boolean; message: string; deletedTitle?: string }
> = {
  name: 'event_delete',
  description: 'Cancels or deletes a planned trip, meeting, or event from the schedule.',
  category: 'PRODUCTIVITY',
  riskLevel: 'LOW_RISK',
  inputSchema: DeleteEventInputSchema,
  async execute(input, context) {
    let event = null;
    if (input.eventId) {
      event = await prisma.userEvent.findFirst({
        where: { id: input.eventId, userId: context.userId },
      });
    }

    if (!event && input.query) {
      const all = await prisma.userEvent.findMany({
        where: { userId: context.userId },
        orderBy: { createdAt: 'desc' },
      });
      const match = await semanticMatcher.matchItem(
        input.query,
        all,
        (e) => `${e.title} ${e.locationName || ''} ${e.description || ''}`,
        (e) => e.id,
        'event or trip'
      );
      if (match.status === 'AMBIGUOUS' && match.ambiguousCandidates?.length) {
        return {
          success: false,
          message: `Found multiple events matching "${input.query}": ${match.ambiguousCandidates.map((e) => `"${e.title}"`).join(', ')}. Please specify which one to cancel.`,
        };
      }
      event = match.matchedItem;
    }

    if (!event) {
      return {
        success: false,
        message: `No event or trip matching "${input.query || input.eventId}" was found to delete.`,
      };
    }

    await eventService.deleteEvent(event.id, context.userId);
    return {
      success: true,
      deletedTitle: event.title,
      message: `Successfully cancelled event: "${event.title}".`,
    };
  },
};

const ListEventRemindersInputSchema = z.object({
  status: z.enum(['PENDING', 'TRIGGERED', 'COMPLETED', 'CANCELLED', 'ALL']).optional().default('PENDING'),
});

export const listEventRemindersTool: JarvisTool<
  z.infer<typeof ListEventRemindersInputSchema>,
  { reminders: Array<{ id: string; title: string; targetLocation: string; status: string }> }
> = {
  name: 'event_reminder_list',
  description: 'Lists all location-based reminders (e.g. reminders that trigger when arriving at a place).',
  category: 'PRODUCTIVITY',
  riskLevel: 'SAFE',
  inputSchema: ListEventRemindersInputSchema,
  async execute(input, context) {
    const reminders = await eventService.listEventReminders(
      context.userId,
      input.status === 'ALL' ? undefined : input.status
    );
    return {
      reminders: reminders.map((r) => ({
        id: r.id,
        title: r.title,
        targetLocation: r.targetLocation || '',
        status: r.status,
      })),
    };
  },
};

const UpdateEventReminderInputSchema = z.object({
  reminderId: z.string().optional().describe('ID of the reminder if known'),
  query: z.string().optional().describe('Keyword or title of the location reminder (e.g. "parasailing", "passport")'),
  status: z.enum(['PENDING', 'TRIGGERED', 'COMPLETED', 'CANCELLED']).optional().describe('New status for the reminder'),
  title: z.string().optional().describe('New title for the reminder'),
  description: z.string().optional().describe('Updated details'),
});

export const updateEventReminderTool: JarvisTool<
  z.infer<typeof UpdateEventReminderInputSchema>,
  { success: boolean; reminderId?: string; title?: string; status?: string; message: string }
> = {
  name: 'event_reminder_update',
  description: 'Updates a location-based reminder (e.g. mark COMPLETED or CANCELLED, rename, or modify).',
  category: 'PRODUCTIVITY',
  riskLevel: 'LOW_RISK',
  inputSchema: UpdateEventReminderInputSchema,
  async execute(input, context) {
    let reminder = null;
    if (input.reminderId) {
      reminder = await prisma.eventReminder.findFirst({
        where: { id: input.reminderId, userId: context.userId },
      });
    }

    if (!reminder && input.query) {
      const all = await prisma.eventReminder.findMany({
        where: { userId: context.userId },
        orderBy: { createdAt: 'desc' },
      });
      const match = await semanticMatcher.matchItem(
        input.query,
        all,
        (r) => `${r.title} ${r.targetLocation || ''} ${r.description || ''}`,
        (r) => r.id,
        'location reminder'
      );
      if (match.status === 'AMBIGUOUS' && match.ambiguousCandidates?.length) {
        return {
          success: false,
          message: `Found multiple reminders matching "${input.query}": ${match.ambiguousCandidates.map((r) => `"${r.title}"`).join(', ')}. Please specify which one to update.`,
        };
      }
      reminder = match.matchedItem;
    }

    if (!reminder) {
      return {
        success: false,
        message: `Could not find any location reminder matching "${input.query || input.reminderId}".`,
      };
    }

    const updated = await eventService.updateEventReminder(reminder.id, context.userId, {
      ...(input.title ? { title: input.title } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    });

    return {
      success: true,
      reminderId: updated?.id,
      title: updated?.title,
      status: updated?.status,
      message: `Updated location reminder "${updated?.title}" to status ${updated?.status}.`,
    };
  },
};

const DeleteEventReminderInputSchema = z.object({
  reminderId: z.string().optional().describe('ID of the reminder if known'),
  query: z.string().optional().describe('Keyword or title of the location reminder to remove'),
});

export const deleteEventReminderTool: JarvisTool<
  z.infer<typeof DeleteEventReminderInputSchema>,
  { success: boolean; message: string; deletedTitle?: string }
> = {
  name: 'event_reminder_delete',
  description: 'Deletes or cancels a location-based reminder.',
  category: 'PRODUCTIVITY',
  riskLevel: 'LOW_RISK',
  inputSchema: DeleteEventReminderInputSchema,
  async execute(input, context) {
    let reminder = null;
    if (input.reminderId) {
      reminder = await prisma.eventReminder.findFirst({
        where: { id: input.reminderId, userId: context.userId },
      });
    }

    if (!reminder && input.query) {
      const all = await prisma.eventReminder.findMany({
        where: { userId: context.userId },
        orderBy: { createdAt: 'desc' },
      });
      const match = await semanticMatcher.matchItem(
        input.query,
        all,
        (r) => `${r.title} ${r.targetLocation || ''} ${r.description || ''}`,
        (r) => r.id,
        'location reminder'
      );
      if (match.status === 'AMBIGUOUS' && match.ambiguousCandidates?.length) {
        return {
          success: false,
          message: `Found multiple reminders matching "${input.query}": ${match.ambiguousCandidates.map((r) => `"${r.title}"`).join(', ')}. Please specify which one to delete.`,
        };
      }
      reminder = match.matchedItem;
    }

    if (!reminder) {
      return {
        success: false,
        message: `No location reminder matching "${input.query || input.reminderId}" was found to delete.`,
      };
    }

    await eventService.deleteEventReminder(reminder.id, context.userId);
    return {
      success: true,
      deletedTitle: reminder.title,
      message: `Successfully deleted location reminder: "${reminder.title}".`,
    };
  },
};

const ListPlacesInputSchema = z.object({});

export const listPlacesTool: JarvisTool<
  z.infer<typeof ListPlacesInputSchema>,
  { places: Array<{ id: string; name: string; latitude: number; longitude: number; radiusMeters: number }> }
> = {
  name: 'place_list',
  description: 'Lists all saved semantic places (Home, Work, Gym, etc.).',
  category: 'LOCATION',
  riskLevel: 'SAFE',
  inputSchema: ListPlacesInputSchema,
  async execute(_input, context) {
    const places = await locationService.listKnownPlaces(context.userId);
    return {
      places: places.map((p) => ({
        id: p.id,
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        radiusMeters: p.radiusMeters,
      })),
    };
  },
};

const DeletePlaceInputSchema = z.object({
  placeId: z.string().optional().describe('ID of the place to delete (if known)'),
  name: z.string().optional().describe('Name of the place to delete (e.g. "Gym", "Office")'),
});

export const deletePlaceTool: JarvisTool<
  z.infer<typeof DeletePlaceInputSchema>,
  { success: boolean; deletedName?: string; message: string }
> = {
  name: 'place_delete',
  description: 'Deletes a saved semantic place (e.g. remove "Gym" or "Office").',
  category: 'LOCATION',
  riskLevel: 'LOW_RISK',
  inputSchema: DeletePlaceInputSchema,
  async execute(input, context) {
    let place = null;
    if (input.placeId) {
      place = await prisma.knownPlace.findFirst({
        where: { id: input.placeId, userId: context.userId },
      });
    }

    if (!place && input.name) {
      const all = await prisma.knownPlace.findMany({
        where: { userId: context.userId },
      });
      const match = await semanticMatcher.matchItem(
        input.name,
        all,
        (p) => p.name,
        (p) => p.id,
        'saved place'
      );
      place = match.matchedItem;
    }

    if (!place) {
      return {
        success: false,
        message: `No saved place matching "${input.name || input.placeId}" was found.`,
      };
    }

    await locationService.deleteKnownPlace(place.id, context.userId);
    return {
      success: true,
      deletedName: place.name,
      message: `Successfully removed saved place: "${place.name}".`,
    };
  },
};
