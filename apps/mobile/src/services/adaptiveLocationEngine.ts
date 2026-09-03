/**
 * Adaptive Cadence Location Engine
 * Dynamically adjusts GPS polling between 5 minutes (in transit) and 2 hours (stationary)
 * with Destination Proximity Scaling to minimize battery usage while never missing reminders.
 */

import { AppState, AppStateStatus } from 'react-native';
import { EventReminderItem, KnownPlaceItem, LocationContext } from '@jarvis/shared';
import { apiClient } from './apiClient';
import { mobileLocationService } from './locationService';

export const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const PROXIMITY_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
export const MAX_INTERVAL_MS = 120 * 60 * 1000; // 2 hours (120 minutes)
export const STATIONARY_RADIUS_METERS = 100; // 100 meters
export const WALKING_SPEED_THRESHOLD_MS = 1.2; // 1.2 m/s (~4.3 km/h)
export const PROXIMITY_RADIUS_METERS = 1500; // 1.5 km to destination

export const STATIONARY_LADDER_MS = [
  5 * 60 * 1000, // 5 min
  15 * 60 * 1000, // 15 min
  30 * 60 * 1000, // 30 min
  60 * 60 * 1000, // 60 min
  120 * 60 * 1000, // 120 min (2 hrs)
];

export interface CoordinateSample {
  latitude: number;
  longitude: number;
  speed?: number; // m/s from GPS
  timestamp: number;
}

export interface AdaptiveEngineMetrics {
  currentIntervalMs: number;
  currentIntervalMinutes: number;
  movementState: 'STATIONARY' | 'IN_TRANSIT' | 'PROXIMITY_ALERT';
  stationaryStreak: number;
  lastDisplacementMeters: number;
  estimatedSpeedMps: number;
  proximityDestination?: string;
  lastSyncTimestamp?: string;
  nextScheduledSyncTimestamp?: string;
  isRunning: boolean;
}

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class AdaptiveLocationEngine {
  private isRunning = false;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private lastSample: CoordinateSample | null = null;
  private stationaryStreak = 0;
  private currentIntervalMs = MIN_INTERVAL_MS;
  private movementState: 'STATIONARY' | 'IN_TRANSIT' | 'PROXIMITY_ALERT' = 'STATIONARY';
  private lastDisplacementMeters = 0;
  private estimatedSpeedMps = 0;
  private proximityDestination?: string;
  private lastSyncTimestamp?: string;
  private nextScheduledSyncTimestamp?: string;
  private listeners: Set<(metrics: AdaptiveEngineMetrics) => void> = new Set();
  private appStateSubscription: { remove: () => void } | null = null;

  public subscribe(listener: (metrics: AdaptiveEngineMetrics) => void): () => void {
    this.listeners.add(listener);
    listener(this.getMetrics());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getMetrics(): AdaptiveEngineMetrics {
    return {
      currentIntervalMs: this.currentIntervalMs,
      currentIntervalMinutes: Math.round(this.currentIntervalMs / 60000),
      movementState: this.movementState,
      stationaryStreak: this.stationaryStreak,
      lastDisplacementMeters: Math.round(this.lastDisplacementMeters),
      estimatedSpeedMps: parseFloat(this.estimatedSpeedMps.toFixed(2)),
      proximityDestination: this.proximityDestination,
      lastSyncTimestamp: this.lastSyncTimestamp,
      nextScheduledSyncTimestamp: this.nextScheduledSyncTimestamp,
      isRunning: this.isRunning,
    };
  }

  private emitMetrics(): void {
    const metrics = this.getMetrics();
    for (const listener of this.listeners) {
      try {
        listener(metrics);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  /**
   * Start the adaptive location cycle
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Listen to AppState (when user returns to app, sync if stale)
    this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const elapsed = this.lastSyncTimestamp
          ? Date.now() - new Date(this.lastSyncTimestamp).getTime()
          : Infinity;
        if (elapsed > MIN_INTERVAL_MS) {
          void this.executeCycle(true);
        }
      }
    });

    // Execute first cycle immediately
    await this.executeCycle(false);
  }

  /**
   * Stop the adaptive tracking cycle
   */
  public stop(): void {
    this.isRunning = false;
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.nextScheduledSyncTimestamp = undefined;
    this.emitMetrics();
  }

  /**
   * Force an immediate sync and re-cadence
   */
  public async triggerNow(): Promise<LocationContext | null> {
    return this.executeCycle(true);
  }

  /**
   * Executes a single location sample, re-calculates velocity and proximity,
   * updates the brain, and schedules the next run with the adapted interval.
   */
  private async executeCycle(isForced = false): Promise<LocationContext | null> {
    if (!this.isRunning && !isForced) return null;

    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }

    let syncedContext: LocationContext | null = null;

    try {
      // 1. Sync current coordinates through location service
      const syncResult = await mobileLocationService.syncCurrentLocation(true);
      if (syncResult.success && syncResult.context) {
        syncedContext = syncResult.context;
        this.lastSyncTimestamp = new Date().toISOString();

        const currentSample: CoordinateSample = {
          latitude: syncResult.context.latitude,
          longitude: syncResult.context.longitude,
          timestamp: Date.now(),
        };

        // 2. Fetch known places and pending event reminders for proximity check
        let knownPlaces: KnownPlaceItem[] = [];
        let pendingReminders: EventReminderItem[] = [];
        try {
          [knownPlaces, pendingReminders] = await Promise.all([
            apiClient.getKnownPlaces().catch(() => [] as KnownPlaceItem[]),
            apiClient.getEventReminders('PENDING').catch(() => [] as EventReminderItem[]),
          ]);
        } catch {
          // fallback to empty
        }

        // 3. Compute adaptive interval
        this.computeCadence(currentSample, knownPlaces, pendingReminders);
      } else {
        // If GPS is disabled or permission denied, back off to 15 mins to avoid battery spin
        this.currentIntervalMs = Math.max(this.currentIntervalMs, 15 * 60 * 1000);
      }
    } catch {
      this.currentIntervalMs = Math.max(this.currentIntervalMs, 15 * 60 * 1000);
    }

    // 4. Schedule next cycle
    if (this.isRunning) {
      const nextRunTime = Date.now() + this.currentIntervalMs;
      this.nextScheduledSyncTimestamp = new Date(nextRunTime).toISOString();
      this.timerHandle = setTimeout(() => {
        void this.executeCycle(false);
      }, this.currentIntervalMs);
    }

    this.emitMetrics();
    return syncedContext;
  }

  /**
   * Core Adaptive Algorithm:
   * 1. Displacement & Velocity evaluation
   * 2. Ladder backoff (Stationary) vs Snap-back (Moving)
   * 3. Target Proximity Scaling:
   *    ONLY triggers when there is a PENDING reminder for a place within 1.5km.
   *    If no reminders are pending for that place, standard moving/stationary cadence applies.
   */
  private computeCadence(
    current: CoordinateSample,
    knownPlaces: KnownPlaceItem[],
    pendingReminders: EventReminderItem[]
  ): void {
    if (!this.lastSample) {
      this.lastSample = current;
      this.currentIntervalMs = MIN_INTERVAL_MS;
      this.movementState = 'STATIONARY';
      this.stationaryStreak = 0;
      this.lastDisplacementMeters = 0;
      this.estimatedSpeedMps = current.speed ?? 0;
      return;
    }

    // Displacement in meters
    const displacement = calculateDistanceMeters(
      this.lastSample.latitude,
      this.lastSample.longitude,
      current.latitude,
      current.longitude
    );
    this.lastDisplacementMeters = displacement;

    // Time elapsed in seconds
    const dtSeconds = Math.max(1, (current.timestamp - this.lastSample.timestamp) / 1000);

    // Velocity calculation: prefer GPS speed if positive, otherwise displacement / dt
    let speed = current.speed !== undefined && current.speed >= 0
      ? current.speed
      : displacement / dtSeconds;

    if (isNaN(speed) || !isFinite(speed)) speed = 0;
    this.estimatedSpeedMps = speed;

    // Check if user is stationary
    const isStationary =
      displacement < STATIONARY_RADIUS_METERS && speed < WALKING_SPEED_THRESHOLD_MS;

    if (isStationary) {
      this.stationaryStreak++;
      this.movementState = 'STATIONARY';

      // Ladder backoff: 5m -> 15m -> 30m -> 60m -> 120m
      const ladderIndex = Math.min(this.stationaryStreak, STATIONARY_LADDER_MS.length - 1);
      this.currentIntervalMs = STATIONARY_LADDER_MS[ladderIndex];
    } else {
      // User is moving actively: snap back immediately to minimum interval
      this.stationaryStreak = 0;
      this.movementState = 'IN_TRANSIT';
      this.currentIntervalMs = MIN_INTERVAL_MS;
    }

    // Destination Proximity Scaling:
    // ONLY activates if the user has a PENDING reminder for a nearby location!
    this.proximityDestination = undefined;

    if (pendingReminders.length > 0) {
      for (const reminder of pendingReminders) {
        let targetLat: number | undefined = reminder.targetLatitude ?? undefined;
        let targetLon: number | undefined = reminder.targetLongitude ?? undefined;
        let locationName = reminder.targetLocation || reminder.title;

        // If reminder doesn't have direct coordinates, match against known places
        if ((targetLat === undefined || targetLon === undefined) && reminder.targetLocation) {
          const normTarget = reminder.targetLocation.toLowerCase().trim();
          const matchedPlace = knownPlaces.find(
            (p) =>
              p.name.toLowerCase().includes(normTarget) ||
              normTarget.includes(p.name.toLowerCase())
          );
          if (matchedPlace) {
            targetLat = matchedPlace.latitude;
            targetLon = matchedPlace.longitude;
            locationName = matchedPlace.name;
          }
        }

        if (targetLat !== undefined && targetLon !== undefined) {
          const distToTarget = calculateDistanceMeters(
            current.latitude,
            current.longitude,
            targetLat,
            targetLon
          );

          if (distToTarget <= PROXIMITY_RADIUS_METERS) {
            this.proximityDestination = `"${reminder.title}" at ${locationName} (${Math.round(distToTarget)}m away)`;
            this.movementState = 'PROXIMITY_ALERT';
            this.currentIntervalMs = Math.min(this.currentIntervalMs, PROXIMITY_INTERVAL_MS);
            break;
          }
        }
      }
    }

    // Update last sample
    this.lastSample = current;
  }
}

export const adaptiveLocationEngine = new AdaptiveLocationEngine();
