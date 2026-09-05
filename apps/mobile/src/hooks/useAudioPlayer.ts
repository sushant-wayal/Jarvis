import { Audio, AVPlaybackStatus } from 'expo-av';
import * as React from 'react';

export interface UseAudioPlayerReturn {
  isPlaying: boolean;
  playBase64Audio: (
    base64Data: string,
    mimeType?: string,
    onFinished?: () => void
  ) => Promise<void>;
  stopAudio: () => Promise<void>;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = React.useState<boolean>(false);
  const soundRef = React.useRef<Audio.Sound | null>(null);
  const onFinishedRef = React.useRef<(() => void) | null>(null);

  // NOTE: Audio session config is intentionally NOT set here.
  // earbudService.initialize() is the single owner of Audio.setAudioModeAsync
  // to prevent multiple modules from overwriting each other's settings.
  // This avoids conflicts with the carrier-sound tap detection mechanism.

  const stopAudio = React.useCallback(async (triggerCallback = false): Promise<void> => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        // Safe catch for already unloaded sound
      }
      soundRef.current = null;
    }
    setIsPlaying(false);
    if (triggerCallback && onFinishedRef.current) {
      const cb = onFinishedRef.current;
      onFinishedRef.current = null;
      cb();
    } else if (!triggerCallback) {
      onFinishedRef.current = null;
    }
  }, []);

  const playBase64Audio = React.useCallback(
    async (
      base64Data: string,
      mimeType: string = 'audio/mp3',
      onFinished?: () => void
    ): Promise<void> => {
      if (!base64Data) {
        onFinished?.();
        return;
      }

      // Stop previous audio without triggering previous callback
      await stopAudio(false);

      // Store callback for the new audio
      onFinishedRef.current = onFinished ?? null;

      try {
        const uri = `data:${mimeType};base64,${base64Data}`;
        const { sound, status } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, progressUpdateIntervalMillis: 100 }
        );

        soundRef.current = sound;
        setIsPlaying(true);

        const durationMillis = (status.isLoaded && status.durationMillis) || 3000;
        let finishedHandled = false;

        const invokeFinished = () => {
          if (finishedHandled) return;
          finishedHandled = true;
          setIsPlaying(false);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
          if (onFinishedRef.current) {
            const cb = onFinishedRef.current;
            onFinishedRef.current = null;
            cb();
          }
        };

        // Safety fallback: if status update missed didJustFinish tick
        const safetyTimer = setTimeout(() => {
          invokeFinished();
        }, durationMillis + 800);

        sound.setOnPlaybackStatusUpdate((playbackStatus: AVPlaybackStatus) => {
          if (playbackStatus.isLoaded && playbackStatus.didJustFinish) {
            clearTimeout(safetyTimer);
            invokeFinished();
          }
        });
      } catch {
        setIsPlaying(false);
        if (onFinishedRef.current) {
          const cb = onFinishedRef.current;
          onFinishedRef.current = null;
          cb();
        }
      }
    },
    [stopAudio]
  );

  return {
    isPlaying,
    playBase64Audio,
    stopAudio,
  };
}
