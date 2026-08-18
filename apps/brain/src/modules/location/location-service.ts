import { KnownPlaceItem, LocationContext, LocationUpdateRequest } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { eventEvaluationEngine } from '@/modules/events/event-evaluation-engine';
import { geocodingService } from './geocoding-service';

export class LocationService {
  /**
   * Updates user's current location, matches known places, reverse geocodes, and evaluates event triggers
   */
  async updateLocation(input: LocationUpdateRequest): Promise<LocationContext> {
    const userId = input.userId || 'default-user';

    // 1. Reverse geocode semantic location
    const address = await geocodingService.reverseGeocode(input.latitude, input.longitude);

    // 2. Check for matching KnownPlaces
    const knownPlaces = await prisma.knownPlace.findMany({
      where: { userId },
    });

    let matchedPlace: { id: string; name: string } | undefined;

    for (const place of knownPlaces) {
      const distance = geocodingService.calculateDistanceMeters(
        input.latitude,
        input.longitude,
        place.latitude,
        place.longitude
      );
      if (distance <= place.radiusMeters) {
        matchedPlace = { id: place.id, name: place.name };
        break;
      }
    }

    // 3. Upsert latest location state in database
    await prisma.userLocationState.upsert({
      where: { userId },
      update: {
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy,
        city: address.city,
        state: address.state,
        country: address.country,
        area: address.area,
        knownPlaceId: matchedPlace?.id,
      },
      create: {
        userId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy,
        city: address.city,
        state: address.state,
        country: address.country,
        area: address.area,
        knownPlaceId: matchedPlace?.id,
      },
    });

    const locationContext: LocationContext = {
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      city: address.city,
      state: address.state,
      country: address.country,
      area: address.area,
      knownPlace: matchedPlace,
      timestamp: new Date().toISOString(),
    };

    // 4. Trigger Event & Reminder Evaluation Engine in background
    eventEvaluationEngine
      .evaluateLocationUpdate(userId, locationContext)
      .catch((err) => logger.warn('EventEvaluationEngine evaluation error', { error: String(err) }));

    return locationContext;
  }

  /**
   * Retrieves user's latest location context
   */
  async getCurrentLocation(userId: string): Promise<LocationContext | null> {
    const record = await prisma.userLocationState.findUnique({
      where: { userId },
    });

    if (!record) return null;

    let knownPlace: { id: string; name: string } | undefined;
    if (record.knownPlaceId) {
      const place = await prisma.knownPlace.findUnique({ where: { id: record.knownPlaceId } });
      if (place) knownPlace = { id: place.id, name: place.name };
    }

    return {
      latitude: record.latitude,
      longitude: record.longitude,
      accuracy: record.accuracy ?? undefined,
      city: record.city ?? undefined,
      state: record.state ?? undefined,
      country: record.country ?? undefined,
      area: record.area ?? undefined,
      knownPlace,
      timestamp: record.updatedAt.toISOString(),
    };
  }

  /**
   * Saves or updates a user KnownPlace (e.g. Home, Office, Gym)
   */
  async saveKnownPlace(params: {
    userId: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters?: number;
  }): Promise<KnownPlaceItem> {
    const { userId, name, latitude, longitude, radiusMeters = 200 } = params;

    const place = await prisma.knownPlace.create({
      data: {
        userId,
        name,
        latitude,
        longitude,
        radiusMeters,
      },
    });

    return {
      id: place.id,
      userId: place.userId,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      radiusMeters: place.radiusMeters,
      createdAt: place.createdAt.toISOString(),
      updatedAt: place.updatedAt.toISOString(),
    };
  }

  async listKnownPlaces(userId: string): Promise<KnownPlaceItem[]> {
    const places = await prisma.knownPlace.findMany({ where: { userId } });
    return places.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      radiusMeters: p.radiusMeters,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }
}

export const locationService = new LocationService();
