import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  RecordingStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
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

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status: RecordingStatus) => {
    // Status tracking if needed
  });

  React.useEffect(() => {
    (async () => {
      try {
        const res = await getRecordingPermissionsAsync();
        setHasPermission(res.status === 'granted');
      } catch {
        setHasPermission(false);
      }
    })();
  }, []);

  const startRecording = React.useCallback(async (): Promise<void> => {
    try {
      if (!hasPermission) {
        const res = await requestRecordingPermissionsAsync();
        if (res.status !== 'granted') return;
        setHasPermission(true);
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  }, [hasPermission, recorder]);

  const stopRecording = React.useCallback(async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
    try {
      setIsRecording(false);
      setRecordingLevel(0);

      await recorder.stop();

      const uri = recorder.uri;
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
  }, [recorder]);

  const cancelRecording = React.useCallback(async (): Promise<void> => {
    try {
      await recorder.stop();
    } catch {
      // ignore cleanup error
    }
    setIsRecording(false);
    setRecordingLevel(0);
  }, [recorder]);

  return {
    isRecording,
    recordingLevel,
    hasPermission,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
