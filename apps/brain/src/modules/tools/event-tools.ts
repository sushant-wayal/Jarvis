import { z } from 'zod';
import { eventService } from '@/modules/events/event-service';
import { locationService } from '@/modules/location/location-service';
import { JarvisTool } from './types';

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

export const placeSaveTool: JarvisTool<z.infer<typeof PlaceSaveInputSchema>, { success: boolean; placeId: string; name: string }> = {
  name: 'place_save',
  description: 'Saves the current or specified coordinates as a named semantic place (e.g. Home, Office, Gym).',
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

    return {
      success: true,
      placeId: place.id,
      name: place.name,
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
