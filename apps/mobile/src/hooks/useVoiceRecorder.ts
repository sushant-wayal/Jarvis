import {
  getRecordingPermissionsAsync,
  RecordingOptions,
  RecordingPresets,
  RecordingStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import * as React from 'react';

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  recordingLevel: number;
  hasPermission: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ audioBase64: string; mimeType: string } | null>;
  cancelRecording: () => Promise<void>;
}

const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = React.useState<boolean>(false);
  const [recordingLevel, setRecordingLevel] = React.useState<number>(0);
  const [hasPermission, setHasPermission] = React.useState<boolean>(false);

  const recorder = useAudioRecorder(RECORDING_OPTIONS, (_status: RecordingStatus) => {
    // High-level recording events
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

  // Poll real-time recording status & audio metering levels during active recording
  React.useEffect(() => {
    if (!isRecording) {
      setRecordingLevel(0);
      return;
    }

    const interval = setInterval(() => {
      try {
        const status = recorder.getStatus();
        if (status.isRecording && typeof status.metering === 'number') {
          // Native metering returns dBFS (-160..0 dBFS).
          // Map -60 dBFS (ambient silence) to 0 dBFS (peak speech) -> 0..1 scale
          const clampedDb = Math.max(-60, Math.min(0, status.metering));
          const norm = (clampedDb + 60) / 60;
          setRecordingLevel(norm);
        }
      } catch {
        // Safe catch for status read
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isRecording, recorder]);

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

      const currentStatus = recorder.getStatus();
      if (!currentStatus.canRecord && !currentStatus.isRecording) {
        await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      }

      recorder.record();
      setIsRecording(true);
    } catch (err) {
      console.error('[VoiceRecorder] startRecording error:', err);
      setIsRecording(false);
    }
  }, [hasPermission, recorder]);

  const stopRecording = React.useCallback(async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
    try {
      setIsRecording(false);
      setRecordingLevel(0);

      const status = recorder.getStatus();
      if (status.isRecording) {
        await recorder.stop();
      }

      const uri = recorder.uri;
      if (!uri) {
        console.warn('[VoiceRecorder] No audio recording URI available');
        return null;
      }

      const file = new File(uri);
      let base64 = '';

      try {
        if (file.exists) {
          base64 = await file.base64();
        }
      } catch (fileErr) {
        console.warn('[VoiceRecorder] File.base64 read failed, trying fetch fallback:', fileErr);
      }

      // Secondary fallback for web or environments where File.base64() isn't available
      if (!base64) {
        try {
          const response = await fetch(uri);
          const blob = await response.blob();
          base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const resStr = reader.result as string;
              resolve(resStr.split(',')[1] || '');
            };
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
          });
        } catch (fetchErr) {
          console.error('[VoiceRecorder] Fetch fallback failed:', fetchErr);
        }
      }

      if (!base64 || base64.length < 50) {
        console.warn('[VoiceRecorder] Audio recording empty or too short:', base64.length);
        return null;
      }

      return {
        audioBase64: base64,
        mimeType: 'audio/mp4',
      };
    } catch (err) {
      console.error('[VoiceRecorder] stopRecording error:', err);
      setIsRecording(false);
      return null;
    }
  }, [recorder]);

  const cancelRecording = React.useCallback(async (): Promise<void> => {
    try {
      const status = recorder.getStatus();
      if (status.isRecording) {
        await recorder.stop();
      }
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

