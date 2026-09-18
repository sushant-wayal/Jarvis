import { EarbudEventType, EarbudSettings, EarbudStatus } from '@jarvis/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioPlayer, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import {
  ERROR_CHIME_BASE64,
  PROCESS_CHIME_BASE64,
  SILENT_CARRIER_BASE64,
  WAKE_CHIME_BASE64,
} from '../utils/audioChimes';
import { apiClient } from './apiClient';

type EarbudListener = (event: EarbudEventType) => void;

const EARBUD_STORAGE_KEY = 'jarvis:earbud_settings';

// Default brain URL — matches apiClient
const DEFAULT_BRAIN_URL =
  process.env.EXPO_PUBLIC_JARVIS_API_URL || 'https://brainofjarvis.vercel.app/api/v1';

// Native module reference (only available in real builds, not Expo Go)
const { JarvisEarbudModule } = NativeModules as {
  JarvisEarbudModule?: {
    startService: (brainUrl: string) => Promise<void>;
    stopService: () => Promise<void>;
    EARBUD_TAP_EVENT: string;
  };
};

const hasNativeModule = Boolean(JarvisEarbudModule);

class EarbudService {
  private listeners: Set<EarbudListener> = new Set();
  private carrierSound: AudioPlayer | null = null;
  private chimeSound: AudioPlayer | null = null;
  private nativeEventSubscription: ReturnType<NativeEventEmitter['addListener']> | null = null;
  private isStandbyRunning = false;
  private lastTapTimestamp = 0;
  private tapTimeout: ReturnType<typeof setTimeout> | null = null;
  private isInternalPause = false;
  private wasPlayingBefore = true;
  private isJarvisSpeakingOrChiming = false;

  private settings: EarbudSettings = {
    enabled: true,
    singleTapAction: 'TOGGLE_VOICE',
    doubleTapAction: 'STOP_OR_INTERRUPT',
    playFeedbackChimes: true,
    autoSilenceStop: true,
    silenceThresholdSeconds: 4.5,
    backgroundStandby: true,
  };

  private status: EarbudStatus = {
    isStandbyActive: false,
    isConnected: true,
  };

  public getSettings(): EarbudSettings {
    return { ...this.settings };
  }

  public async updateSettings(partial: Partial<EarbudSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial };
    try {
      await AsyncStorage.setItem(EARBUD_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Non-critical persistence error
    }

    if (this.settings.enabled && this.settings.backgroundStandby) {
      await this.startCarrierStandby();
    } else {
      await this.stopCarrierStandby();
    }
  }

  public getStatus(): EarbudStatus {
    return { ...this.status, isStandbyActive: this.isStandbyRunning };
  }

  public subscribe(listener: EarbudListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Initializes audio session and earbud tap detection.
   *
   * Dual-layer strategy:
   *  1. JavaScript Carrier Standby: Plays an ultra-low silent audio carrier via expo-av
   *     so Android AVRCP registers active audio playback and routes earbud taps.
   *  2. Native Android Service (when built into APK): Runs JarvisForegroundService with
   *     native MediaSession + AudioTrack for deep background / screen-off / pocket persistence.
   */
  public async initialize(): Promise<void> {
    // Load persisted settings
    try {
      const raw = await AsyncStorage.getItem(EARBUD_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EarbudSettings>;
        this.settings = { ...this.settings, ...parsed };
      }
    } catch {
      // Fallback to defaults
    }

    // Set up audio mode — single source of truth for the entire app
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
    } catch {
      // Audio mode fallback — non-fatal
    }

    // Initialize native service if available
    if (hasNativeModule && Platform.OS === 'android') {
      await this.initNativeService();
    }

    // Web MediaSession fallback
    this.setupWebMediaSession();

    // Start carrier standby loop — critical for hardware earbud AVRCP routing
    if (this.settings.enabled && this.settings.backgroundStandby) {
      await this.startCarrierStandby();
    }
  }

  // ─── Native service path (real Android build) ───────────────────────────

  private async initNativeService(): Promise<void> {
    try {
      const brainUrl = await apiClient.initializeUrl();
      // Start the foreground service — it keeps itself alive via START_STICKY
      await JarvisEarbudModule!.startService(brainUrl);
      this.isStandbyRunning = true;
      this.status.isStandbyActive = true;

      // Subscribe to native media button events from the service
      if (this.nativeEventSubscription) {
        this.nativeEventSubscription.remove();
        this.nativeEventSubscription = null;
      }
      const emitter = new NativeEventEmitter(NativeModules.JarvisEarbudModule);
      const eventName = JarvisEarbudModule?.EARBUD_TAP_EVENT || 'JarvisEarbudTap';
      this.nativeEventSubscription = emitter.addListener(
        eventName,
        (eventType: string) => {
          this.emitEvent(eventType as EarbudEventType);
        }
      );
    } catch (err) {
      console.warn('[EarbudService] Native service failed to start, falling back to carrier:', err);
      await this.startCarrierStandby();
    }
  }

  // ─── Tap guard API (used by useEarbudManager) ───────────────────────────

  /**
   * Suppresses tap detection during recording so audio mode changes
   * don't cause false-trigger events.
   */
  public suppressTapDetection(): void {
    this.isInternalPause = true;
  }

  /**
   * Guards against false tap events caused by OS audio focus changes
   * when Jarvis is actively speaking or playing audio.
   */
  public setSpeakingActive(active: boolean): void {
    this.isJarvisSpeakingOrChiming = active;
    if (active) {
      this.isInternalPause = true;
      if (this.tapTimeout) {
        clearTimeout(this.tapTimeout);
        this.tapTimeout = null;
      }
    } else {
      setTimeout(() => {
        if (!this.isJarvisSpeakingOrChiming) {
          this.isInternalPause = false;
          this.wasPlayingBefore = true;
        }
      }, 500);
    }
  }

  /**
   * Re-enables tap detection after a recording/processing cycle completes.
   * Includes a settling delay so audio mode transitions stabilise.
   */
  public resumeTapDetection(delayMs = 400): void {
    setTimeout(() => {
      if (!this.isJarvisSpeakingOrChiming) {
        this.isInternalPause = false;
        this.wasPlayingBefore = true;
      }
    }, delayMs);
  }

  // ─── Event emission ─────────────────────────────────────────────────────

  public emitEvent(event: EarbudEventType): void {
    this.status.lastEvent = event;
    this.status.lastEventTimestamp = Date.now();
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  public triggerSimulatedTap(eventType: EarbudEventType = 'SINGLE_TAP'): void {
    this.emitEvent(eventType);
  }

  // ─── Carrier standby (Expo Go / iOS fallback) ───────────────────────────

  public async startCarrierStandby(): Promise<void> {
    if (this.isStandbyRunning) return;

    try {
      this.isInternalPause = true;
      if (this.carrierSound) {
        try { this.carrierSound.remove(); } catch {}
        this.carrierSound = null;
      }

      const player = createAudioPlayer({ uri: `data:audio/wav;base64,${SILENT_CARRIER_BASE64}` });
      player.loop = true;
      player.volume = 0.01;
      player.play();

      this.carrierSound = player;
      this.isStandbyRunning = true;
      this.status.isStandbyActive = true;
      this.wasPlayingBefore = true;

      // Delay clearing the guard so the initial status update doesn't false-fire
      setTimeout(() => {
        if (!this.isJarvisSpeakingOrChiming) {
          this.isInternalPause = false;
        }
      }, 500);

      (player as any).addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (!status.isLoaded) return;

        // If Jarvis is currently speaking, playing a chime, or tap detection is suppressed,
        // ignore all pause/play changes on the carrier sound!
        if (this.isInternalPause || this.isJarvisSpeakingOrChiming) {
          this.wasPlayingBefore = status.playing;
          return;
        }

        if (this.isStandbyRunning) {
          if (this.wasPlayingBefore && !status.playing) {
            const now = Date.now();
            if (now - this.lastTapTimestamp > 500) {
              this.handleRawMediaButton('PLAY_PAUSE');
            }
            // Re-prime carrier with isInternalPause guard to prevent self-triggering
            this.isInternalPause = true;
            player.play();
            setTimeout(() => {
              if (!this.isJarvisSpeakingOrChiming) {
                this.isInternalPause = false;
                this.wasPlayingBefore = true;
              }
            }, 300);
            return;
          }
        }
        this.wasPlayingBefore = status.playing;
      });
    } catch (err) {
      console.warn('[EarbudService] Carrier standby failed:', err);
      this.isStandbyRunning = false;
      this.status.isStandbyActive = false;
      this.isInternalPause = false;
    }
  }

  public async stopCarrierStandby(): Promise<void> {
    this.isInternalPause = true;
    if (this.carrierSound) {
      try {
        this.carrierSound.pause();
        this.carrierSound.remove();
      } catch {
        // ignore
      }
      this.carrierSound = null;
    }
    this.isStandbyRunning = false;
    this.status.isStandbyActive = false;
    this.isInternalPause = false;
  }

  /**
   * Web/browser MediaSession API — works in Expo Go web preview only.
   */
  private setupWebMediaSession(): void {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Jarvis Neural Interface',
          artist: 'Earbud Standby Active',
          album: 'Jarvis AI Assistant',
        });

        const handle = (type: 'PLAY_PAUSE' | 'NEXT' | 'PREV' | 'STOP') => {
          if (!this.settings.enabled) return;
          this.handleRawMediaButton(type);
        };

        navigator.mediaSession.setActionHandler('play',          () => handle('PLAY_PAUSE'));
        navigator.mediaSession.setActionHandler('pause',         () => handle('PLAY_PAUSE'));
        navigator.mediaSession.setActionHandler('nexttrack',     () => handle('NEXT'));
        navigator.mediaSession.setActionHandler('previoustrack', () => handle('PREV'));
        navigator.mediaSession.setActionHandler('stop',          () => handle('STOP'));
      } catch {
        // MediaSession not supported in this runtime
      }
    }
  }

  /**
   * Single/double tap discriminator for the carrier-sound / web fallback paths.
   */
  private handleRawMediaButton(type: 'PLAY_PAUSE' | 'NEXT' | 'PREV' | 'STOP'): void {
    if (type === 'NEXT')  { this.emitEvent('DOUBLE_TAP'); return; }
    if (type === 'PREV')  { this.emitEvent('TRIPLE_TAP'); return; }
    if (type === 'STOP')  { this.emitEvent('LONG_PRESS'); return; }

    const now = Date.now();
    if (this.tapTimeout) {
      clearTimeout(this.tapTimeout);
      this.tapTimeout = null;
      this.lastTapTimestamp = 0;
      this.emitEvent('DOUBLE_TAP');
    } else {
      this.lastTapTimestamp = now;
      this.tapTimeout = setTimeout(() => {
        this.tapTimeout = null;
        this.emitEvent('SINGLE_TAP');
      }, 350);
    }
  }

  // ─── Chime playback ─────────────────────────────────────────────────────

  private async playChime(base64Wav: string, volume = 1.0): Promise<void> {
    if (!this.settings.playFeedbackChimes) return;

    // Guard: suppress carrier tap detection while chime is playing
    this.isInternalPause = true;

    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          if (!this.isJarvisSpeakingOrChiming) {
            this.isInternalPause = false;
          }
          resolve();
        }
      };

      // Fallback timeout in case audio focus or status update hangs (chimes are max 360ms)
      const timeout = setTimeout(done, 600);

      try {
        if (this.chimeSound) {
          try { this.chimeSound.remove(); } catch {}
          this.chimeSound = null;
        }

        const player = createAudioPlayer({ uri: `data:audio/wav;base64,${base64Wav}` });
        player.volume = volume;
        player.play();
        this.chimeSound = player;

        (player as any).addListener('playbackStatusUpdate', (status: AudioStatus) => {
          if (status.isLoaded && status.didJustFinish) {
            clearTimeout(timeout);
            try { player.remove(); } catch {}
            this.chimeSound = null;
            setTimeout(done, 80);
          }
        });
      } catch {
        clearTimeout(timeout);
        done();
      }
    });
  }

  public async playWakeChime():    Promise<void> { await this.playChime(WAKE_CHIME_BASE64, 1.0); }
  public async playProcessChime(): Promise<void> { await this.playChime(PROCESS_CHIME_BASE64, 0.95); }
  public async playErrorChime():   Promise<void> { await this.playChime(ERROR_CHIME_BASE64, 1.0); }

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  public async destroy(): Promise<void> {
    this.nativeEventSubscription?.remove();
    this.nativeEventSubscription = null;
    if (hasNativeModule && Platform.OS === 'android') {
      try { await JarvisEarbudModule!.stopService(); } catch { /* ignore */ }
    }
    await this.stopCarrierStandby();
  }
}

export const earbudService = new EarbudService();
