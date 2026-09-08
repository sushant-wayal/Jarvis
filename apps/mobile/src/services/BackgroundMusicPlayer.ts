/**
 * BackgroundMusicPlayer
 * High-performance background music streaming engine for Jarvis.
 * Streams audio directly into the user's earbuds/headphones via expo-av without
 * taking over the screen or interrupting foreground user activities.
 */

import { Audio, AVPlaybackStatus, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Platform } from 'react-native';

export interface TrackMetadata {
  audioUrl: string;
  title: string;
  artist?: string;
  artworkUrl?: string;
  duration?: number;
}

class BackgroundMusicPlayer {
  private sound: Audio.Sound | null = null;
  private currentTrack: TrackMetadata | null = null;
  private isAudioModeConfigured = false;
  private isCurrentlyPlaying = false;
  private wasPlayingBeforeVoiceInput = false;
  private statusListeners: Array<(isPlaying: boolean, track: TrackMetadata | null) => void> = [];

  private async configureAudioMode(): Promise<void> {
    if (this.isAudioModeConfigured) return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        playThroughEarpieceAndroid: false,
      });
      this.isAudioModeConfigured = true;
    } catch {
      // Best effort configuration
    }
  }

  /**
   * Start streaming a track in the background immediately.
   */
  async playTrack(track: TrackMetadata): Promise<boolean> {
    try {
      await this.configureAudioMode();

      // Stop previous track cleanly
      if (this.sound) {
        try {
          await this.sound.stopAsync();
          await this.sound.unloadAsync();
        } catch {
          // Ignore unload errors
        }
        this.sound = null;
      }

      this.currentTrack = track;
      this.notifyListeners(true, track);

      const { sound } = await Audio.Sound.createAsync(
        { uri: track.audioUrl },
        { shouldPlay: true, isLooping: false, progressUpdateIntervalMillis: 500 },
        this.onPlaybackStatusUpdate
      );

      this.sound = sound;
      this.isCurrentlyPlaying = true;
      return true;
    } catch (err) {
      this.isCurrentlyPlaying = false;
      this.notifyListeners(false, null);
      return false;
    }
  }

  /**
   * Pause the active audio stream.
   */
  async pause(): Promise<void> {
    if (this.sound && this.isCurrentlyPlaying) {
      try {
        await this.sound.pauseAsync();
        this.isCurrentlyPlaying = false;
        this.notifyListeners(false, this.currentTrack);
      } catch {
        // Safe catch
      }
    }
  }

  /**
   * Resume paused audio playback.
   */
  async resume(): Promise<void> {
    if (this.sound && !this.isCurrentlyPlaying) {
      try {
        await this.sound.playAsync();
        this.isCurrentlyPlaying = true;
        this.notifyListeners(true, this.currentTrack);
      } catch {
        // Safe catch
      }
    }
  }

  /**
   * Stop and unload the current stream.
   */
  async stop(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      } catch {
        // Safe catch
      }
      this.sound = null;
    }
    this.isCurrentlyPlaying = false;
    this.wasPlayingBeforeVoiceInput = false;
    this.currentTrack = null;
    this.notifyListeners(false, null);
  }

  /**
   * Temporarily pause active music while the microphone is listening
   * so that song lyrics do NOT leak into the mic and distort speech recognition.
   */
  async pauseForVoiceInput(): Promise<void> {
    if (this.sound && this.isCurrentlyPlaying) {
      try {
        this.wasPlayingBeforeVoiceInput = true;
        await this.sound.pauseAsync();
        this.isCurrentlyPlaying = false;
        this.notifyListeners(false, this.currentTrack);
      } catch {
        // Safe catch
      }
    }
  }

  /**
   * Resume playback if music was automatically paused for voice listening,
   * provided the user did NOT issue an explicit pause/stop command.
   */
  async resumeAfterVoiceInput(): Promise<void> {
    if (this.sound && this.wasPlayingBeforeVoiceInput && !this.isCurrentlyPlaying) {
      try {
        this.wasPlayingBeforeVoiceInput = false;
        await this.sound.playAsync();
        this.isCurrentlyPlaying = true;
        this.notifyListeners(true, this.currentTrack);
      } catch {
        // Safe catch
      }
    } else {
      this.wasPlayingBeforeVoiceInput = false;
    }
  }

  /**
   * Cancel voice input resume flag when user explicitly requested media actions (pause, stop, play new).
   */
  cancelVoiceInputResume(): void {
    this.wasPlayingBeforeVoiceInput = false;
  }

  isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }

  getCurrentTrack(): TrackMetadata | null {
    return this.currentTrack;
  }

  subscribe(listener: (isPlaying: boolean, track: TrackMetadata | null) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(isPlaying: boolean, track: TrackMetadata | null): void {
    for (const listener of this.statusListeners) {
      try {
        listener(isPlaying, track);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  private onPlaybackStatusUpdate = (status: AVPlaybackStatus): void => {
    if (!status.isLoaded) {
      if (status.error) {
        this.isCurrentlyPlaying = false;
        this.notifyListeners(false, this.currentTrack);
      }
      return;
    }

    this.isCurrentlyPlaying = status.isPlaying;

    if (status.didJustFinish) {
      this.isCurrentlyPlaying = false;
      this.notifyListeners(false, this.currentTrack);
    }
  };
}

export const backgroundMusicPlayer = new BackgroundMusicPlayer();
