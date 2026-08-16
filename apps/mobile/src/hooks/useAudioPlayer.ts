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

  // Pre-warm audio session in background for instant playback
  React.useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      staysActiveInBackground: true,
    }).catch(() => {
      // Safe background initialization fallback
    });
  }, []);

  const stopAudio = React.useCallback(async (): Promise<void> => {
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
    if (onFinishedRef.current) {
      const cb = onFinishedRef.current;
      onFinishedRef.current = null;
      cb();
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

      onFinishedRef.current = onFinished ?? null;

      try {
        await stopAudio();

        const uri = `data:${mimeType};base64,${base64Data}`;
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, progressUpdateIntervalMillis: 100 }
        );

        soundRef.current = sound;
        setIsPlaying(true);

        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
            sound.unloadAsync().catch(() => {});
            soundRef.current = null;
            if (onFinishedRef.current) {
              const cb = onFinishedRef.current;
              onFinishedRef.current = null;
              cb();
            }
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
