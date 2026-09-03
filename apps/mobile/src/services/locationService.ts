import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { LocationContext } from '@jarvis/shared';
import { apiClient } from './apiClient';

export type LocationPermissionState = 'GRANTED' | 'DENIED' | 'UNDETERMINED' | 'DISABLED';

export type LocationSyncResult =
  | { success: true; context: LocationContext }
  | {
      success: false;
      error: 'SERVICES_DISABLED' | 'PERMISSION_DENIED' | 'FETCH_FAILED';
      message: string;
    };

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

  async hasServicesEnabled(): Promise<boolean> {
    try {
      return await Location.hasServicesEnabledAsync();
    } catch {
      return false;
    }
  }

  async promptEnableServices(): Promise<boolean> {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (enabled) return true;

      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
          return await Location.hasServicesEnabledAsync();
        } catch {
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async syncCurrentLocation(force = false): Promise<LocationSyncResult> {
    const now = Date.now();
    if (!force && now - this.lastUpdateTimestamp < this.minIntervalMs) {
      const cached = await apiClient.getCurrentLocation();
      if (cached) {
        return { success: true, context: cached };
      }
    }

    try {
      let isEnabled = await Location.hasServicesEnabledAsync();
      if (!isEnabled) {
        if (Platform.OS === 'android') {
          try {
            await Location.enableNetworkProviderAsync();
            isEnabled = await Location.hasServicesEnabledAsync();
          } catch {
            // User declined prompt or not supported
          }
        }

        if (!isEnabled) {
          return {
            success: false,
            error: 'SERVICES_DISABLED',
            message: 'Device location is turned off. Please turn on Location in device settings to sync coordinates.',
          };
        }
      }

      let perm = await this.getPermissionStatus();
      if (perm !== 'GRANTED') {
        perm = await this.requestPermission();
        if (perm !== 'GRANTED') {
          return {
            success: false,
            error: 'PERMISSION_DENIED',
            message: 'Location permission was denied. Please grant location permission in device settings.',
          };
        }
      }

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

      if (!context) {
        return {
          success: false,
          error: 'FETCH_FAILED',
          message: 'Unable to synchronize location coordinates with server.',
        };
      }

      return { success: true, context };
    } catch (err) {
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: err instanceof Error ? err.message : 'Unable to retrieve GPS coordinates.',
      };
    }
  }
}

export const mobileLocationService = new MobileLocationService();
