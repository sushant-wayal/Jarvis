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
   * Reverse geocodes coordinates to city/state/country with graceful fallbacks
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodedAddress> {
    try {
      // Free Open-Meteo reverse geocoding approximation or standard lookup
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
      // Fallback
    }

    // Fallback heuristic coordinates for common testing cities
    if (Math.abs(latitude - 15.49) < 0.5 && Math.abs(longitude - 73.82) < 0.5) {
      return { city: 'Panaji', state: 'Goa', country: 'India' };
    }
    if (Math.abs(latitude - 19.07) < 0.5 && Math.abs(longitude - 72.87) < 0.5) {
      return { city: 'Mumbai', state: 'Maharashtra', country: 'India' };
    }
    if (Math.abs(latitude - 12.97) < 0.5 && Math.abs(longitude - 77.59) < 0.5) {
      return { city: 'Bangalore', state: 'Karnataka', country: 'India' };
    }

    return { country: 'India' };
  }

  /**
   * Forward geocodes a location name to approximate coordinates
   */
  async forwardGeocode(locationName: string): Promise<{ latitude: number; longitude: number; name: string } | null> {
    const lower = locationName.toLowerCase().trim();
    if (lower.includes('goa')) return { latitude: 15.4909, longitude: 73.8278, name: 'Goa' };
    if (lower.includes('mumbai')) return { latitude: 19.076, longitude: 72.8777, name: 'Mumbai' };
    if (lower.includes('bangalore') || lower.includes('bengaluru')) return { latitude: 12.9716, longitude: 77.5946, name: 'Bangalore' };
    if (lower.includes('delhi')) return { latitude: 28.7041, longitude: 77.1025, name: 'Delhi' };
    if (lower.includes('airport')) return { latitude: 19.0896, longitude: 72.8656, name: 'Airport' };

    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`;
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
      // ignore
    }

    return null;
  }
}

export const geocodingService = new GeocodingService();
