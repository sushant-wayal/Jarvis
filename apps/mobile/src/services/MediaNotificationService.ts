/**
 * MediaNotificationService
 * Provides persistent background media playback notifications with lockscreen and
 * status bar controls (Pause, Resume, Stop) via expo-notifications.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { backgroundMusicPlayer, TrackMetadata } from './BackgroundMusicPlayer';

export const MEDIA_NOTIFICATION_ID = 'jarvis-active-media-player';
export const MEDIA_CHANNEL_ID = 'jarvis-media-playback';

class MediaNotificationService {
  private isInitialized = false;
  private responseSubscription: { remove: () => void } | null = null;
  private playerSubscription: (() => void) | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(MEDIA_CHANNEL_ID, {
          name: 'Jarvis Media Playback',
          description: 'Background audio playback controls',
          importance: Notifications.AndroidImportance.LOW,
          vibrationPattern: [0],
          enableVibrate: false,
          sound: undefined,
          showBadge: false,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      }

      // Register interactive notification action categories
      await Notifications.setNotificationCategoryAsync('MEDIA_PLAYING', [
        {
          identifier: 'MEDIA_PAUSE',
          buttonTitle: '⏸ Pause',
          options: { opensAppToForeground: false },
        },
        {
          identifier: 'MEDIA_NEXT',
          buttonTitle: '⏭ Skip',
          options: { opensAppToForeground: false },
        },
        {
          identifier: 'MEDIA_STOP',
          buttonTitle: '⏹ Stop',
          options: { opensAppToForeground: false, isDestructive: true },
        },
      ]);

      await Notifications.setNotificationCategoryAsync('MEDIA_PAUSED', [
        {
          identifier: 'MEDIA_RESUME',
          buttonTitle: '▶ Play',
          options: { opensAppToForeground: false },
        },
        {
          identifier: 'MEDIA_NEXT',
          buttonTitle: '⏭ Skip',
          options: { opensAppToForeground: false },
        },
        {
          identifier: 'MEDIA_STOP',
          buttonTitle: '⏹ Stop',
          options: { opensAppToForeground: false, isDestructive: true },
        },
      ]);

      // Listen for notification action button clicks
      this.responseSubscription = Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          const actionId = response.actionIdentifier;
          if (actionId === 'MEDIA_PAUSE') {
            await backgroundMusicPlayer.pause();
          } else if (actionId === 'MEDIA_RESUME') {
            await backgroundMusicPlayer.resume();
          } else if (actionId === 'MEDIA_NEXT') {
            await backgroundMusicPlayer.skip();
          } else if (actionId === 'MEDIA_STOP') {
            await backgroundMusicPlayer.stop();
          }
        }
      );

      // Subscribe to background audio player state transitions
      this.playerSubscription = backgroundMusicPlayer.subscribe(
        (isPlaying, track) => {
          void this.handlePlaybackStateChange(isPlaying, track);
        }
      );
    } catch {
      // Graceful fallback if notifications permission is missing
    }
  }

  private async handlePlaybackStateChange(
    isPlaying: boolean,
    track: TrackMetadata | null
  ): Promise<void> {
    try {
      if (!track) {
        // Track ended or stopped -> dismiss notification immediately
        await Notifications.dismissNotificationAsync(MEDIA_NOTIFICATION_ID);
        return;
      }

      const nextTrack = backgroundMusicPlayer.getNextTrack();
      const nextInfo = nextTrack ? ` · Next: ${nextTrack.title}` : '';

      if (isPlaying) {
        await Notifications.scheduleNotificationAsync({
          identifier: MEDIA_NOTIFICATION_ID,
          content: {
            title: track.title,
            body: track.artist
              ? `${track.artist} · Playing${nextInfo}`
              : `Playing in background${nextInfo}`,
            categoryIdentifier: 'MEDIA_PLAYING',
            sticky: true,
            priority: Notifications.AndroidNotificationPriority.LOW,
            data: { isJarvisMedia: true },
          },
          trigger: null,
        });
      } else {
        await Notifications.scheduleNotificationAsync({
          identifier: MEDIA_NOTIFICATION_ID,
          content: {
            title: track.title,
            body: track.artist
              ? `${track.artist} · Paused${nextInfo}`
              : `Paused${nextInfo}`,
            categoryIdentifier: 'MEDIA_PAUSED',
            sticky: false,
            priority: Notifications.AndroidNotificationPriority.LOW,
            data: { isJarvisMedia: true },
          },
          trigger: null,
        });
      }
    } catch {
      // Best effort notification update
    }
  }

  destroy(): void {
    if (this.responseSubscription) {
      this.responseSubscription.remove();
      this.responseSubscription = null;
    }
    if (this.playerSubscription) {
      this.playerSubscription();
      this.playerSubscription = null;
    }
    this.isInitialized = false;
  }
}

export const mediaNotificationService = new MediaNotificationService();
