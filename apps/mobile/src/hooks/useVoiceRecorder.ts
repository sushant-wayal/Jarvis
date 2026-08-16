import { Audio } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  recordingLevel: number;
  hasPermission: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ audioBase64: string; mimeType: string } | null>;
  cancelRecording: () => Promise<void>;
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        setHasPermission(status === 'granted');
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      } catch {
        setHasPermission(false);
      }
    })();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (!hasPermission) {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') return;
        setHasPermission(true);
      }

      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
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

  const stopRecording = useCallback(async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
    if (!recordingRef.current) return null;

    try {
      setIsRecording(false);
      setRecordingLevel(0);

      const recording = recordingRef.current;
      recordingRef.current = null;
      await recording.stopAndUnloadAsync();

      const uri = recording.getURI();
      if (!uri) return null;

      // In React Native / Expo web or native, fetch local file URI as blob to base64
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

  const cancelRecording = useCallback(async () => {
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
