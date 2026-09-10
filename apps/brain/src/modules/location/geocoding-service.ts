import { aiClient, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';

export interface GeocodedAddress {
  city?: string;
  state?: string;
  country?: string;
  area?: string;
}

export class GeocodingService {
  /**
   * Computes great-circle distance between two GPS points using Haversine formula (returns meters)
   */
  calculateDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Reverse geocodes coordinates to city/state/country
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodedAddress> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Jarvis-Personal-Assistant/2.0' },
      });

      if (res.ok) {
        const data = (await res.json()) as {
          address?: {
            city?: string;
            town?: string;
            village?: string;
            state?: string;
            country?: string;
            suburb?: string;
            neighbourhood?: string;
          };
        };

        if (data.address) {
          const city = data.address.city || data.address.town || data.address.village;
          return {
            city: city || undefined,
            state: data.address.state || undefined,
            country: data.address.country || undefined,
            area: data.address.suburb || data.address.neighbourhood || undefined,
          };
        }
      }
    } catch {
      // Fall through to LLM reverse geocode
    }

    // Semantic LLM reverse geocode fallback
    try {
      const prompt = `Identify the city, state/region, and country for coordinates latitude: ${latitude}, longitude: ${longitude}.
Respond strictly in JSON: {"city": "string or null", "state": "string or null", "country": "string or null", "area": "string or null"}`;
      const res = await aiClient.models.generateContent({
        model: FAST_FALLBACK_MODELS[0] || 'gemini-flash-lite-latest',
        contents: prompt,
      });
      const text = res.text?.trim() || '';
      const cleanJson = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
      if (cleanJson) {
        const parsed = JSON.parse(cleanJson);
        return {
          city: parsed.city || undefined,
          state: parsed.state || undefined,
          country: parsed.country || undefined,
          area: parsed.area || undefined,
        };
      }
    } catch (err) {
      logger.warn('LLM reverse geocoding fallback failed', { err: String(err) });
    }

    return {};
  }

  /**
   * Forward geocodes a location name to approximate coordinates using API + LLM semantic resolution
   */
  async forwardGeocode(locationName: string): Promise<{ latitude: number; longitude: number; name: string } | null> {
    const trimmed = locationName.trim();
    if (!trimmed) return null;

    // 1. Query real Open-Meteo Geocoding API
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`;
      const res = await fetch(geoUrl);
      const data = (await res.json()) as { results?: Array<{ latitude: number; longitude: number; name: string }> };
      if (data.results && data.results.length > 0) {
        return {
          latitude: data.results[0].latitude,
          longitude: data.results[0].longitude,
          name: data.results[0].name,
        };
      }
    } catch {
      // Fall through to LLM geocoding
    }

    // 2. Semantic LLM Geocoding for landmarks, local areas, or when network API misses
    try {
      const prompt = `Estimate approximate geographic coordinates (latitude, longitude) for location or landmark: "${trimmed}".
Respond strictly in JSON: {"latitude": number, "longitude": number, "name": "string"}`;
      const res = await aiClient.models.generateContent({
        model: FAST_FALLBACK_MODELS[0] || 'gemini-flash-lite-latest',
        contents: prompt,
      });
      const text = res.text?.trim() || '';
      const cleanJson = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
      if (cleanJson) {
        const parsed = JSON.parse(cleanJson) as { latitude?: number; longitude?: number; name?: string };
        if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
          return {
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            name: parsed.name || trimmed,
          };
        }
      }
    } catch (err) {
      logger.warn('LLM forward geocoding fallback failed', { err: String(err) });
    }

    return null;
  }
}

export const geocodingService = new GeocodingService();
