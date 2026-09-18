import { AudioPlayer, createAudioPlayer, AudioStatus } from 'expo-audio';
import * as React from 'react';

export interface QueuedAudioItem {
  base64Data: string;
  mimeType: string;
  onFinished?: () => void;
}

export interface UseAudioPlayerReturn {
  isPlaying: boolean;
  playBase64Audio: (
    base64Data: string,
    mimeType?: string,
    onFinished?: () => void
  ) => Promise<void>;
  enqueueBase64Audio: (
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
  const queueRef = React.useRef<QueuedAudioItem[]>([]);
  const isBusyRef = React.useRef<boolean>(false);

  // Stable ref to playNextInQueue — breaks the circular useCallback dependency.
  // playRawItem always reads this ref so it always calls the latest version,
  // even though playRawItem itself is memoized with [] deps.
  const playNextInQueueRef = React.useRef<() => void>(() => {});

  const stopAudio = React.useCallback(async (triggerCallback = false): Promise<void> => {
    // Clear queued audio chunks
    queueRef.current = [];
    isBusyRef.current = false;

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

  // playRawItem is stable ([] deps) and uses playNextInQueueRef to avoid
  // stale closure — the ref always points to the current playNextInQueue.
  const playRawItem = React.useCallback(
    async (item: QueuedAudioItem): Promise<void> => {
      const { base64Data, mimeType, onFinished } = item;

      if (!base64Data) {
        onFinished?.();
        playNextInQueueRef.current();
        return;
      }

      // Cleanup previous player instance if any
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.remove();
        } catch {}
        playerRef.current = null;
      }

      onFinishedRef.current = onFinished ?? null;
      isBusyRef.current = true;
      setIsPlaying(true);

      try {
        const uri = `data:${mimeType};base64,${base64Data}`;
        const player = createAudioPlayer({ uri });
        playerRef.current = player;
        player.play();

        let finishedHandled = false;
        const invokeFinished = () => {
          if (finishedHandled) return;
          finishedHandled = true;

          try {
            player.remove();
          } catch {}
          playerRef.current = null;

          const cb = onFinishedRef.current;
          onFinishedRef.current = null;
          cb?.();

          // Use ref so we always call the latest playNextInQueue, not a stale closure
          playNextInQueueRef.current();
        };

        // Safety fallback timer — covers tracks up to 30s
        const safetyTimer = setTimeout(() => {
          invokeFinished();
        }, 30000);

        (player as any).addListener('playbackStatusUpdate', (playbackStatus: AudioStatus) => {
          if (playbackStatus.isLoaded && playbackStatus.didJustFinish) {
            clearTimeout(safetyTimer);
            invokeFinished();
          }
        });
      } catch {
        isBusyRef.current = false;
        setIsPlaying(false);
        const cb = onFinishedRef.current;
        onFinishedRef.current = null;
        cb?.();
        playNextInQueueRef.current();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const playNextInQueue = React.useCallback((): void => {
    if (queueRef.current.length > 0) {
      const nextItem = queueRef.current.shift()!;
      void playRawItem(nextItem);
    } else {
      isBusyRef.current = false;
      setIsPlaying(false);
    }
  }, [playRawItem]);

  // Keep the ref always pointing to the latest version of playNextInQueue
  React.useEffect(() => {
    playNextInQueueRef.current = playNextInQueue;
  }, [playNextInQueue]);

  /**
   * Immediately plays audio, interrupting any active playback and clearing the queue.
   */
  const playBase64Audio = React.useCallback(
    async (
      base64Data: string,
      mimeType: string = 'audio/mp3',
      onFinished?: () => void
    ): Promise<void> => {
      queueRef.current = [];
      await stopAudio(false);
      await playRawItem({ base64Data, mimeType, onFinished });
    },
    [stopAudio, playRawItem]
  );

  /**
   * Enqueues audio to play smoothly after any currently playing audio finishes.
   * If player is idle, begins playing immediately.
   */
  const enqueueBase64Audio = React.useCallback(
    async (
      base64Data: string,
      mimeType: string = 'audio/mp3',
      onFinished?: () => void
    ): Promise<void> => {
      if (!base64Data) {
        onFinished?.();
        return;
      }

      const item: QueuedAudioItem = { base64Data, mimeType, onFinished };

      if (!isBusyRef.current) {
        await playRawItem(item);
      } else {
        queueRef.current.push(item);
      }
    },
    [playRawItem]
  );

  return {
    isPlaying,
    playBase64Audio,
    enqueueBase64Audio,
    stopAudio,
  };
}
