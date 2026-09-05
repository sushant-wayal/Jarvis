import { Audio } from 'expo-av';
import * as React from 'react';

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  recordingLevel: number;
  hasPermission: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ audioBase64: string; mimeType: string } | null>;
  cancelRecording: () => Promise<void>;
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = React.useState<boolean>(false);
  const [recordingLevel, setRecordingLevel] = React.useState<number>(0);
  const [hasPermission, setHasPermission] = React.useState<boolean>(false);
  const recordingRef = React.useRef<Audio.Recording | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        setHasPermission(status === 'granted');
        // IMPORTANT: Do NOT call setAudioModeAsync here — earbudService.initialize()
        // owns the global audio session config. Calling it here would wipe
        // staysActiveInBackground and break carrier-based tap detection.
      } catch {
        setHasPermission(false);
      }
    })();
  }, []);

  const startRecording = React.useCallback(async (): Promise<void> => {
    try {
      if (!hasPermission) {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') return;
        setHasPermission(true);
      }

      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
      }

      // Keep staysActiveInBackground and shouldDuckAndroid intact so the
      // earbudService carrier sound keeps its audio focus during recording.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        interruptionModeAndroid: 1, // DoNotMix
        interruptionModeIOS: 1,     // DoNotMix
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording && status.metering !== undefined) {
          // Normalize metering from -160..0 dB to 0..1
          const norm = Math.max(0, Math.min(1, (status.metering + 160) / 160));
          setRecordingLevel(norm);
        }
      });

      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  }, [hasPermission]);

  const stopRecording = React.useCallback(async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
    if (!recordingRef.current) return null;

    try {
      setIsRecording(false);
      setRecordingLevel(0);

      const recording = recordingRef.current;
      recordingRef.current = null;
      await recording.stopAndUnloadAsync();

      const uri = recording.getURI();
      if (!uri) return null;

      const response = await fetch(uri);
      const blob = await response.blob();

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const resStr = reader.result as string;
          const base64 = resStr.split(',')[1] || '';
          resolve({
            audioBase64: base64,
            mimeType: 'audio/m4a',
          });
        };
        reader.readAsDataURL(blob);
      });
    } catch {
      setIsRecording(false);
      return null;
    }
  }, []);

  const cancelRecording = React.useCallback(async (): Promise<void> => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {
        // ignore cleanup error
      }
      recordingRef.current = null;
    }
    setIsRecording(false);
    setRecordingLevel(0);
  }, []);

  return {
    isRecording,
    recordingLevel,
    hasPermission,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
