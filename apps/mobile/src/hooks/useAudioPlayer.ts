import { AudioPlayer, createAudioPlayer, AudioStatus } from 'expo-audio';
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
  const playerRef = React.useRef<AudioPlayer | null>(null);
  const onFinishedRef = React.useRef<(() => void) | null>(null);

  const stopAudio = React.useCallback(async (triggerCallback = false): Promise<void> => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.remove();
      } catch {
        // Safe catch for already unloaded sound
      }
      playerRef.current = null;
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
        const player = createAudioPlayer({ uri });
        playerRef.current = player;
        setIsPlaying(true);
        player.play();

        let finishedHandled = false;
        const invokeFinished = () => {
          if (finishedHandled) return;
          finishedHandled = true;
          setIsPlaying(false);
          try { player.remove(); } catch {}
          playerRef.current = null;
          if (onFinishedRef.current) {
            const cb = onFinishedRef.current;
            onFinishedRef.current = null;
            cb();
          }
        };

        // Safety fallback: if status update missed didJustFinish tick
        const safetyTimer = setTimeout(() => {
          invokeFinished();
        }, 15000);

        (player as any).addListener('playbackStatusUpdate', (playbackStatus: AudioStatus) => {
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
