/**
 * BackgroundMusicPlayer
 * High-performance background music streaming engine for Jarvis.
 * Streams audio directly into the user's earbuds/headphones via expo-av with
 * continuous intelligent autoplay, queue replenishment, and preference learning.
 */

import { AudioPlayer, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { apiClient } from './apiClient';

export interface TrackMetadata {
  id?: string;
  audioUrl: string;
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  duration?: number;
  explanation?: string;
}

class BackgroundMusicPlayer {
  private sound: AudioPlayer | null = null;
  private currentTrack: TrackMetadata | null = null;
  private queue: TrackMetadata[] = [];
  private playbackHistory: TrackMetadata[] = [];
  private sessionId: string | null = null;
  private autoplayEnabled = true;

  private isAudioModeConfigured = false;
  private isCurrentlyPlaying = false;
  private wasPlayingBeforeVoiceInput = false;
  private isAdvancing = false;

  private reportedMilestones = new Set<number>();
  private currentPositionMillis = 0;
  private currentDurationMillis = 0;

  private statusListeners: Array<(isPlaying: boolean, track: TrackMetadata | null) => void> = [];

  private async configureAudioMode(): Promise<void> {
    if (this.isAudioModeConfigured) return;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        shouldPlayInBackground: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });
      this.isAudioModeConfigured = true;
    } catch {
      // Best effort configuration
    }
  }

  /**
   * Initializes a full music session with seed track and initial pre-resolved queue.
   */
  async startSession(params: {
    track: TrackMetadata;
    queue?: TrackMetadata[];
    sessionId?: string;
    autoplay?: boolean;
  }): Promise<boolean> {
    this.sessionId = params.sessionId || null;
    this.autoplayEnabled = params.autoplay !== false;
    this.queue = params.queue ? [...params.queue] : [];

    return this.playTrack(params.track);
  }

  /**
   * Start streaming a track in the background immediately.
   */
  async playTrack(track: TrackMetadata): Promise<boolean> {
    try {
      await this.configureAudioMode();

      // Reset milestone tracking for new track
      this.reportedMilestones.clear();
      this.currentPositionMillis = 0;
      this.currentDurationMillis = (track.duration || 0) * 1000;

      // Stop previous track cleanly
      if (this.sound) {
        try {
          this.sound.pause();
          this.sound.remove();
        } catch {
          // Ignore unload errors
        }
        this.sound = null;
      }

      this.currentTrack = track;
      this.notifyListeners(true, track);

      const player = createAudioPlayer({ uri: track.audioUrl });
      player.play();
      (player as any).addListener('playbackStatusUpdate', this.onPlaybackStatusUpdate);

      this.sound = player;
      this.isCurrentlyPlaying = true;

      // Report PLAY_STARTED to backend for implicit learning
      this.reportPlaybackEvent('PLAY_STARTED', 0);

      // Check if queue needs early replenishment
      this.checkAndReplenishQueue();

      return true;
    } catch {
      this.isCurrentlyPlaying = false;
      this.reportPlaybackEvent('FAILED', 0);

      // Fail-safe: advance to next playable track if available
      if (this.autoplayEnabled && this.queue.length > 0) {
        return this.next();
      }

      this.notifyListeners(false, null);
      return false;
    }
  }

  /**
   * Skips to the next track in the queue with explicit skip event reporting.
   */
  async skip(): Promise<boolean> {
    if (this.currentTrack) {
      const pct =
        this.currentDurationMillis > 0
          ? Math.round((this.currentPositionMillis / this.currentDurationMillis) * 100)
          : 0;
      this.reportPlaybackEvent('SKIPPED', pct);
    }
    return this.next();
  }

  /**
   * Advances to next queued track.
   */
  async next(): Promise<boolean> {
    if (this.isAdvancing) return false;
    this.isAdvancing = true;

    try {
      if (this.currentTrack) {
        this.playbackHistory.push(this.currentTrack);
        if (this.playbackHistory.length > 30) {
          this.playbackHistory.shift();
        }
      }

      if (this.queue.length === 0) {
        await this.stop();
        return false;
      }

      const nextTrack = this.queue.shift()!;
      const started = await this.playTrack(nextTrack);

      // Replenish if queue is low
      this.checkAndReplenishQueue();
      return started;
    } finally {
      this.isAdvancing = false;
    }
  }

  /**
   * Returns to the previous track in history.
   */
  async previous(): Promise<boolean> {
    if (this.playbackHistory.length === 0) return false;

    if (this.currentTrack) {
      this.queue.unshift(this.currentTrack);
    }

    const prevTrack = this.playbackHistory.pop()!;
    return this.playTrack(prevTrack);
  }

  /**
   * Pause the active audio stream.
   */
  async pause(): Promise<void> {
    if (this.sound && this.isCurrentlyPlaying) {
      try {
        this.sound.pause();
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
        this.sound.play();
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
        this.sound.pause();
        this.sound.remove();
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
   * Temporarily pause active music while the microphone is listening.
   */
  async pauseForVoiceInput(): Promise<void> {
    if (this.sound && this.isCurrentlyPlaying) {
      try {
        this.wasPlayingBeforeVoiceInput = true;
        this.sound.pause();
        this.isCurrentlyPlaying = false;
        this.notifyListeners(false, this.currentTrack);
      } catch {
        // Safe catch
      }
    }
  }

  /**
   * Resume playback while Jarvis is in the PROCESSING / THINKING state.
   */
  async resumeForProcessing(): Promise<void> {
    if (this.sound && this.wasPlayingBeforeVoiceInput && !this.isCurrentlyPlaying) {
      try {
        this.sound.play();
        this.isCurrentlyPlaying = true;
        this.notifyListeners(true, this.currentTrack);
      } catch {
        // Safe catch
      }
    }
  }

  /**
   * Pause playback again when Jarvis enters the SPEAKING state.
   */
  async pauseForSpeaking(): Promise<void> {
    if (this.sound && this.isCurrentlyPlaying) {
      try {
        this.sound.pause();
        this.isCurrentlyPlaying = false;
        this.notifyListeners(false, this.currentTrack);
      } catch {
        // Safe catch
      }
    }
  }

  /**
   * Resume playback after Jarvis finishes speaking.
   */
  async resumeAfterSpeaking(): Promise<void> {
    if (this.sound && this.wasPlayingBeforeVoiceInput && !this.isCurrentlyPlaying) {
      try {
        this.wasPlayingBeforeVoiceInput = false;
        this.sound.play();
        this.isCurrentlyPlaying = true;
        this.notifyListeners(true, this.currentTrack);
      } catch {
        // Safe catch
      }
    } else {
      this.wasPlayingBeforeVoiceInput = false;
    }
  }

  cancelVoiceInputResume(): void {
    this.wasPlayingBeforeVoiceInput = false;
  }

  isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }

  getCurrentTrack(): TrackMetadata | null {
    return this.currentTrack;
  }

  getQueue(): TrackMetadata[] {
    return [...this.queue];
  }

  getNextTrack(): TrackMetadata | null {
    return this.queue[0] || null;
  }

  isAutoplayEnabled(): boolean {
    return this.autoplayEnabled;
  }

  setAutoplay(enabled: boolean): void {
    this.autoplayEnabled = enabled;
  }

  toggleAutoplay(): boolean {
    this.autoplayEnabled = !this.autoplayEnabled;
    return this.autoplayEnabled;
  }

  enqueue(tracks: TrackMetadata[]): void {
    const existingIds = new Set([
      ...(this.currentTrack?.id ? [this.currentTrack.id] : []),
      ...this.queue.map((t) => t.id).filter(Boolean),
    ]);

    const fresh = tracks.filter((t) => !t.id || !existingIds.has(t.id));
    this.queue.push(...fresh);
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

  private onPlaybackStatusUpdate = (status: AudioStatus): void => {
    if (!status.isLoaded) {
      if (status.error) {
        void this.next();
      }
      return;
    }

    this.isCurrentlyPlaying = status.playing;
    this.currentPositionMillis = Math.round(status.currentTime * 1000);
    if (status.duration) {
      this.currentDurationMillis = Math.round(status.duration * 1000);
    }

    // Check progress percentage milestones for implicit learning
    if (this.currentDurationMillis > 0) {
      const pct = (this.currentPositionMillis / this.currentDurationMillis) * 100;
      if (pct >= 25 && !this.reportedMilestones.has(25)) {
        this.reportedMilestones.add(25);
        this.reportPlaybackEvent('PLAYED_25_PERCENT', 25);
      }
      if (pct >= 50 && !this.reportedMilestones.has(50)) {
        this.reportedMilestones.add(50);
        this.reportPlaybackEvent('PLAYED_50_PERCENT', 50);
      }
      if (pct >= 75 && !this.reportedMilestones.has(75)) {
        this.reportedMilestones.add(75);
        this.reportPlaybackEvent('PLAYED_75_PERCENT', 75);
      }
    }

    // Auto-advance continuously upon song completion
    if (status.didJustFinish && !status.loop) {
      this.reportPlaybackEvent('PLAY_COMPLETED', 100);
      if (this.autoplayEnabled) {
        void this.next();
      } else {
        void this.stop();
      }
    }
  };

  private reportPlaybackEvent(
    eventType:
      | 'PLAY_STARTED'
      | 'PLAYED_25_PERCENT'
      | 'PLAYED_50_PERCENT'
      | 'PLAYED_75_PERCENT'
      | 'PLAY_COMPLETED'
      | 'SKIPPED'
      | 'REPLAYED'
      | 'FAILED',
    percentage: number
  ): void {
    if (!this.currentTrack) return;

    void apiClient
      .sendMusicPlaybackEvents([
        {
          sessionId: this.sessionId || 'client-session',
          trackId: this.currentTrack.id || this.currentTrack.title,
          title: this.currentTrack.title,
          artist: this.currentTrack.artist || 'Unknown',
          eventType,
          timestamp: Date.now(),
          durationPlayed: Math.round(this.currentPositionMillis / 1000),
          percentagePlayed: percentage,
        },
      ])
      .catch(() => {});
  }

  private checkAndReplenishQueue(): void {
    if (this.autoplayEnabled && this.sessionId && this.queue.length < 3) {
      void apiClient
        .replenishMusicQueue(this.sessionId, 5)
        .then((newTracks) => {
          if (newTracks && newTracks.length > 0) {
            const mapped: TrackMetadata[] = newTracks
              .filter((t) => Boolean(t.audioUrl))
              .map((t) => ({
                id: t.id,
                audioUrl: t.audioUrl!,
                title: t.title,
                artist: t.artist,
                album: t.album,
                artworkUrl: t.artworkUrl,
                duration: t.duration,
                explanation: t.explanation,
              }));
            this.enqueue(mapped);
          }
        })
        .catch(() => {});
    }
  }
}

export const backgroundMusicPlayer = new BackgroundMusicPlayer();
