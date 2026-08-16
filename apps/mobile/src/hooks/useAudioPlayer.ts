import { Audio } from 'expo-av';
import { useCallback, useRef, useState } from 'react';

export interface UseAudioPlayerReturn {
  isPlaying: boolean;
  playBase64Audio: (base64Data: string, mimeType?: string) => Promise<void>;
  stopAudio: () => Promise<void>;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const stopAudio = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        // ignore unload error
      }
      soundRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const playBase64Audio = useCallback(
    async (base64Data: string, mimeType = 'audio/mp3') => {
      if (!base64Data) return;

      try {
        await stopAudio();

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
        });

        const uri = `data:${mimeType};base64,${base64Data}`;
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });

        soundRef.current = sound;
        setIsPlaying(true);

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
            sound.unloadAsync().catch(() => {});
            soundRef.current = null;
          }
        });
      } catch {
        setIsPlaying(false);
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
