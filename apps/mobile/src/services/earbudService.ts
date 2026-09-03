import { EarbudEventType, EarbudSettings, EarbudStatus } from '@jarvis/shared';
import { Audio, AVPlaybackStatus } from 'expo-av';
import {
  ERROR_CHIME_BASE64,
  PROCESS_CHIME_BASE64,
  SILENT_CARRIER_BASE64,
  WAKE_CHIME_BASE64,
} from '../utils/audioChimes';

type EarbudListener = (event: EarbudEventType) => void;

class EarbudService {
  private listeners: Set<EarbudListener> = new Set();
  private carrierSound: Audio.Sound | null = null;
  private chimeSound: Audio.Sound | null = null;
  private isStandbyRunning = false;
  private lastTapTimestamp = 0;
  private tapTimeout: ReturnType<typeof setTimeout> | null = null;
  private wasPlayingBefore = true;
  private isInternalPause = false;

  private settings: EarbudSettings = {
    enabled: true,
    singleTapAction: 'TOGGLE_VOICE',
    doubleTapAction: 'STOP_OR_INTERRUPT',
    playFeedbackChimes: true,
    autoSilenceStop: true,
    silenceThresholdSeconds: 2.5,
    backgroundStandby: true,
  };

  private status: EarbudStatus = {
    isStandbyActive: false,
    isConnected: true,
  };

  public getSettings(): EarbudSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<EarbudSettings>): void {
    this.settings = { ...this.settings, ...partial };
    if (this.settings.enabled && this.settings.backgroundStandby) {
      this.startStandby();
    } else {
      this.stopStandby();
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
   * Initializes audio session for background listening and sets up MediaSession action handlers
   */
  public async initialize(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        interruptionModeAndroid: 1, // DoNotMix
        interruptionModeIOS: 1, // DoNotMix
      });

      this.setupMediaSession();

      if (this.settings.enabled && this.settings.backgroundStandby) {
        await this.startStandby();
      }
    } catch {
      // Audio mode fallback
    }
  }

  /**
   * Configures MediaSession API for web / browser runtimes where available
   */
  private setupMediaSession(): void {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Jarvis Neural Interface',
          artist: 'Earbud Standby Active',
          album: 'Jarvis AI Assistant',
        });

        const handleMediaAction = (type: 'PLAY_PAUSE' | 'NEXT' | 'PREV' | 'STOP') => {
          if (!this.settings.enabled) return;
          this.handleRawMediaButton(type);
        };

        navigator.mediaSession.setActionHandler('play', () => handleMediaAction('PLAY_PAUSE'));
        navigator.mediaSession.setActionHandler('pause', () => handleMediaAction('PLAY_PAUSE'));
        navigator.mediaSession.setActionHandler('nexttrack', () => handleMediaAction('NEXT'));
        navigator.mediaSession.setActionHandler('previoustrack', () => handleMediaAction('PREV'));
        navigator.mediaSession.setActionHandler('stop', () => handleMediaAction('STOP'));
      } catch {
        // MediaSession not supported in this runtime
      }
    }
  }

  /**
   * Distinguishes single tap from double tap
   */
  private handleRawMediaButton(type: 'PLAY_PAUSE' | 'NEXT' | 'PREV' | 'STOP'): void {
    const now = Date.now();

    if (type === 'NEXT') {
      this.emitEvent('DOUBLE_TAP');
      return;
    }

    if (type === 'PREV') {
      this.emitEvent('TRIPLE_TAP');
      return;
    }

    if (type === 'STOP') {
      this.emitEvent('LONG_PRESS');
      return;
    }

    // PLAY_PAUSE single/double tap discriminator
    if (this.tapTimeout) {
      // Second tap arrived within 380ms -> Double tap
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

  /**
   * Broadcasts the recognized earbud event to all active listeners
   */
  public emitEvent(event: EarbudEventType): void {
    this.status.lastEvent = event;
    this.status.lastEventTimestamp = Date.now();

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  /**
   * Triggers a simulated earbud event for UI testing
   */
  public triggerSimulatedTap(eventType: EarbudEventType = 'SINGLE_TAP'): void {
    this.emitEvent(eventType);
  }

  /**
   * Starts inaudible looped background carrier to anchor audio focus in Android/iOS.
   * Attaches playback status listener to intercept Bluetooth earbud Play/Pause hardware taps.
   */
  public async startStandby(): Promise<void> {
    if (this.isStandbyRunning) return;

    try {
      this.isInternalPause = true;
      if (this.carrierSound) {
        await this.carrierSound.unloadAsync().catch(() => {});
        this.carrierSound = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${SILENT_CARRIER_BASE64}` },
        { isLooping: true, volume: 0.01, shouldPlay: true }
      );

      this.carrierSound = sound;
      this.isStandbyRunning = true;
      this.status.isStandbyActive = true;
      this.wasPlayingBefore = true;
      this.isInternalPause = false;

      // Intercept Bluetooth earbud hardware Play/Pause triggers
      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;

        if (this.isStandbyRunning && !this.isInternalPause) {
          // When user taps their Bluetooth earbud, Android pauses the active audio track
          if (this.wasPlayingBefore && !status.isPlaying) {
            this.handleRawMediaButton('PLAY_PAUSE');
            // Resume carrier playback so it stays primed for future taps
            sound.playAsync().catch(() => {});
          }
        }
        this.wasPlayingBefore = status.isPlaying;
      });
    } catch {
      this.isStandbyRunning = false;
      this.status.isStandbyActive = false;
      this.isInternalPause = false;
    }
  }

  /**
   * Stops background audio standby
   */
  public async stopStandby(): Promise<void> {
    this.isInternalPause = true;
    if (this.carrierSound) {
      try {
        await this.carrierSound.stopAsync();
        await this.carrierSound.unloadAsync();
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
   * Plays a subtle sound chime directly through earbuds
   */
  private async playChime(base64Wav: string, volume = 0.6): Promise<void> {
    if (!this.settings.playFeedbackChimes) return;

    try {
      if (this.chimeSound) {
        await this.chimeSound.unloadAsync().catch(() => {});
        this.chimeSound = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${base64Wav}` },
        { shouldPlay: true, volume }
      );

      this.chimeSound = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch {
      // ignore chime error
    }
  }

  public async playWakeChime(): Promise<void> {
    await this.playChime(WAKE_CHIME_BASE64, 0.7);
  }

  public async playProcessChime(): Promise<void> {
    await this.playChime(PROCESS_CHIME_BASE64, 0.55);
  }

  public async playErrorChime(): Promise<void> {
    await this.playChime(ERROR_CHIME_BASE64, 0.6);
  }
}

export const earbudService = new EarbudService();
