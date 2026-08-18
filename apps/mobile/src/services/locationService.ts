import * as Location from 'expo-location';
import { LocationContext } from '@jarvis/shared';
import { apiClient } from './apiClient';

export type LocationPermissionState = 'GRANTED' | 'DENIED' | 'UNDETERMINED' | 'DISABLED';

export class MobileLocationService {
  private lastUpdateTimestamp = 0;
  private minIntervalMs = 60000; // 1 minute throttle to save battery

  async getPermissionStatus(): Promise<LocationPermissionState> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') return 'GRANTED';
      if (status === 'denied') return 'DENIED';
      return 'UNDETERMINED';
    } catch {
      return 'DISABLED';
    }
  }

  async requestPermission(): Promise<LocationPermissionState> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') return 'GRANTED';
      if (status === 'denied') return 'DENIED';
      return 'UNDETERMINED';
    } catch {
      return 'DISABLED';
    }
  }

  async syncCurrentLocation(force = false): Promise<LocationContext | null> {
    const now = Date.now();
    if (!force && now - this.lastUpdateTimestamp < this.minIntervalMs) {
      return apiClient.getCurrentLocation();
    }

    try {
      const isEnabled = await Location.hasServicesEnabledAsync();
      if (!isEnabled) return null;

      const perm = await this.getPermissionStatus();
      if (perm !== 'GRANTED') return null;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      this.lastUpdateTimestamp = now;

      const context = await apiClient.updateLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
        altitude: loc.coords.altitude ?? undefined,
        speed: loc.coords.speed ?? undefined,
        heading: loc.coords.heading ?? undefined,
        timestamp: new Date(loc.timestamp).toISOString(),
      });

      return context;
    } catch {
      return null;
    }
  }
}

export const mobileLocationService = new MobileLocationService();
