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
  const subscriptionRef = React.useRef<{ remove: () => void } | null>(null);
  const safetyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const drainTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinishedRef = React.useRef<(() => void) | null>(null);
  const queueRef = React.useRef<QueuedAudioItem[]>([]);
  const isBusyRef = React.useRef<boolean>(false);

  // Stable ref to playNextInQueue — breaks the circular useCallback dependency.
  const playNextInQueueRef = React.useRef<() => void>(() => {});

  const cleanupCurrentPlayback = React.useCallback((): void => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current);
      drainTimerRef.current = null;
    }
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.remove();
      } catch {}
      subscriptionRef.current = null;
    }
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.remove();
      } catch {}
      playerRef.current = null;
    }
  }, []);

  const stopAudio = React.useCallback(
    async (triggerCallback = false): Promise<void> => {
      // Clear queued audio chunks
      queueRef.current = [];
      isBusyRef.current = false;
      cleanupCurrentPlayback();
      setIsPlaying(false);

      if (triggerCallback && onFinishedRef.current) {
        const cb = onFinishedRef.current;
        onFinishedRef.current = null;
        cb();
      } else if (!triggerCallback) {
        onFinishedRef.current = null;
      }
    },
    [cleanupCurrentPlayback]
  );

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

      cleanupCurrentPlayback();

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

          // Clear safety timer and listener immediately
          if (safetyTimerRef.current) {
            clearTimeout(safetyTimerRef.current);
            safetyTimerRef.current = null;
          }
          if (subscriptionRef.current) {
            try {
              subscriptionRef.current.remove();
            } catch {}
            subscriptionRef.current = null;
          }
          if (playerRef.current) {
            try {
              playerRef.current.pause();
              playerRef.current.remove();
            } catch {}
            playerRef.current = null;
          }

          const cb = onFinishedRef.current;
          onFinishedRef.current = null;

          // AudioTrack hardware buffer drain delay:
          // Give 250ms for the Android hardware audio buffer to completely finish
          // playing through the speaker before invoking callback or starting next chunk.
          drainTimerRef.current = setTimeout(() => {
            drainTimerRef.current = null;
            cb?.();
            playNextInQueueRef.current();
          }, 250);
        };

        // Safety fallback timer — covers tracks up to 45s per chunk
        safetyTimerRef.current = setTimeout(() => {
          invokeFinished();
        }, 45000);

        const subscription = (player as any).addListener(
          'playbackStatusUpdate',
          (playbackStatus: AudioStatus) => {
            if (playbackStatus.isLoaded && playbackStatus.didJustFinish) {
              invokeFinished();
            } else if ((playbackStatus as any).error) {
              invokeFinished();
            }
          }
        );
        subscriptionRef.current = subscription;
      } catch {
        cleanupCurrentPlayback();
        isBusyRef.current = false;
        setIsPlaying(false);
        const cb = onFinishedRef.current;
        onFinishedRef.current = null;
        cb?.();
        playNextInQueueRef.current();
      }
    },
    [cleanupCurrentPlayback]
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
