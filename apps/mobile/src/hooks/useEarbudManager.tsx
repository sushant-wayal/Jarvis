import { EarbudEventType, EarbudSettings, EarbudStatus, JarvisState } from '@jarvis/shared';
import * as React from 'react';
import { earbudService } from '../services/earbudService';
import { apiClient } from '../services/apiClient';
import { useVoiceRecorder } from './useVoiceRecorder';
import { useAudioPlayer } from './useAudioPlayer';
import { integrationManager } from '../integrations/IntegrationManager';

export interface EarbudManagerContextValue {
  jarvisState: JarvisState;
  setJarvisState: React.Dispatch<React.SetStateAction<JarvisState>>;
  settings: EarbudSettings;
  status: EarbudStatus;
  isRecording: boolean;
  recordingLevel: number;
  isPlaying: boolean;
  lastTranscript: string;
  assistantSpokenText: string;
  errorMessage: string | null;
  conversationId?: string;
  updateSettings: (partial: Partial<EarbudSettings>) => void;
  triggerSimulatedTap: (event?: EarbudEventType) => void;
  startVoiceListening: () => Promise<void>;
  stopAndProcessVoice: () => Promise<void>;
  interruptOrStop: () => Promise<void>;
  toggleVoiceInteraction: () => Promise<void>;
}

const EarbudManagerContext = React.createContext<EarbudManagerContextValue | null>(null);

export function EarbudProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [jarvisState, setJarvisState] = React.useState<JarvisState>('IDLE');
  const [settings, setSettings] = React.useState<EarbudSettings>(earbudService.getSettings());
  const [status, setStatus] = React.useState<EarbudStatus>(earbudService.getStatus());
  const [lastTranscript, setLastTranscript] = React.useState<string>('');
  const [assistantSpokenText, setAssistantSpokenText] = React.useState<string>('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [conversationId, setConversationId] = React.useState<string | undefined>(undefined);

  const { isRecording, recordingLevel, startRecording, stopRecording, cancelRecording } =
    useVoiceRecorder();
  const { isPlaying, playBase64Audio, stopAudio } = useAudioPlayer();

  const stateRef = React.useRef<{
    jarvisState: JarvisState;
    conversationId?: string;
  }>({
    jarvisState: 'IDLE',
    conversationId: undefined,
  });

  React.useEffect(() => {
    stateRef.current.jarvisState = jarvisState;
    stateRef.current.conversationId = conversationId;
  }, [jarvisState, conversationId]);

  // Update overall jarvis state based on recording and playing
  React.useEffect(() => {
    if (isRecording) {
      setJarvisState('LISTENING');
    } else if (isPlaying) {
      setJarvisState('SPEAKING');
    } else if (!isRecording && !isPlaying && jarvisState === 'SPEAKING') {
      setJarvisState('IDLE');
    }
  }, [isRecording, isPlaying]);

  const updateSettings = React.useCallback((partial: Partial<EarbudSettings>) => {
    earbudService.updateSettings(partial);
    setSettings(earbudService.getSettings());
    setStatus(earbudService.getStatus());
  }, []);

  const interruptOrStop = React.useCallback(async (): Promise<void> => {
    setErrorMessage(null);
    if (isPlaying) {
      await stopAudio();
      setJarvisState('IDLE');
      await earbudService.playErrorChime();
      return;
    }
    if (isRecording) {
      await cancelRecording();
      setJarvisState('IDLE');
      await earbudService.playErrorChime();
      return;
    }
  }, [isPlaying, isRecording, stopAudio, cancelRecording]);

  const startVoiceListening = React.useCallback(async (): Promise<void> => {
    try {
      setErrorMessage(null);
      setAssistantSpokenText('');
      setLastTranscript('');

      if (isPlaying) {
        await stopAudio();
      }

      await earbudService.playWakeChime();
      await startRecording();
      setJarvisState('LISTENING');
    } catch (err: unknown) {
      setJarvisState('ERROR');
      setErrorMessage(err instanceof Error ? err.message : 'Microphone initialization failed.');
      await earbudService.playErrorChime();
    }
  }, [isPlaying, stopAudio, startRecording]);

  /**
   * After Jarvis finishes speaking a response, check if the brain attached a
   * pending phone action and execute it natively.
   */
  const handlePendingPhoneAction = React.useCallback(
    async (response: { pendingPhoneAction?: unknown; conversationId?: string }) => {
      const action = response.pendingPhoneAction as import('@jarvis/shared').JarvisPhoneAction | undefined;
      if (!action) return;

      const convId = stateRef.current.conversationId || response.conversationId || '';
      const result = await integrationManager.executeAction(action);

      // Handle ambiguous contact — send follow-up text to brain so it can ask
      if (result.ambiguousCandidates?.length) {
        const candidates = result.ambiguousCandidates.join(', ');
        const followUp = `Contact "${(action as { contactName?: string }).contactName}" is ambiguous. Found: ${candidates}. Which one should I use?`;
        await apiClient.sendChatMessage(followUp, convId, false);
        return;
      }

      // Report result to brain for awareness in future turns
      if (convId) {
        void apiClient.reportPhoneActionResult({ conversationId: convId, action, result });
      }
    },
    []
  );

  const stopAndProcessVoice = React.useCallback(async (): Promise<void> => {
    try {
      setJarvisState('PROCESSING');
      await earbudService.playProcessChime();
      const audioData = await stopRecording();

      if (!audioData || !audioData.audioBase64) {
        setJarvisState('ERROR');
        setErrorMessage('No voice audio detected.');
        await earbudService.playErrorChime();
        setTimeout(() => setJarvisState('IDLE'), 2000);
        return;
      }

      setJarvisState('THINKING');

      // Build phone context snapshot to send alongside the voice request
      const phoneContext = await integrationManager.buildPhoneContext().catch(() => undefined);

      const response = await apiClient.sendVoiceAudio(
        audioData.audioBase64,
        audioData.mimeType,
        stateRef.current.conversationId,
        phoneContext
      );

      setConversationId(response.conversationId);
      setLastTranscript(response.transcript);
      setAssistantSpokenText(response.response);

      if (response.audioBase64) {
        setJarvisState('SPEAKING');
        await playBase64Audio(response.audioBase64, 'audio/mp3', async () => {
          setJarvisState('IDLE');
          // After Jarvis finishes speaking, execute any pending phone action
          await handlePendingPhoneAction(response);
        });
      } else {
        setJarvisState('IDLE');
        await handlePendingPhoneAction(response);
      }
    } catch (err: unknown) {
      setJarvisState('ERROR');
      setErrorMessage(err instanceof Error ? err.message : 'Cognitive brain link failed.');
      await earbudService.playErrorChime();
      setTimeout(() => setJarvisState('IDLE'), 3000);
    }
  }, [stopRecording, playBase64Audio]);

  const toggleVoiceInteraction = React.useCallback(async (): Promise<void> => {
    const currentState = stateRef.current.jarvisState;

    if (currentState === 'SPEAKING') {
      await interruptOrStop();
    } else if (currentState === 'LISTENING') {
      await stopAndProcessVoice();
    } else if (currentState === 'IDLE' || currentState === 'ERROR' || currentState === 'OFFLINE') {
      await startVoiceListening();
    }
  }, [interruptOrStop, stopAndProcessVoice, startVoiceListening]);

  // Handle Earbud Events received from hardware / MediaSession
  const handleEarbudEvent = React.useCallback(
    async (event: EarbudEventType) => {
      setStatus(earbudService.getStatus());
      const currentState = stateRef.current.jarvisState;

      if (event === 'SINGLE_TAP' || event === 'MEDIA_PLAY' || event === 'MEDIA_PAUSE') {
        if (currentState === 'IDLE' || currentState === 'ERROR') {
          await startVoiceListening();
        } else if (currentState === 'LISTENING') {
          await stopAndProcessVoice();
        } else if (currentState === 'SPEAKING') {
          await interruptOrStop();
        }
      } else if (event === 'DOUBLE_TAP' || event === 'LONG_PRESS') {
        await interruptOrStop();
      }
    },
    [startVoiceListening, stopAndProcessVoice, interruptOrStop]
  );

  React.useEffect(() => {
    earbudService.initialize();
    const unsubscribe = earbudService.subscribe(handleEarbudEvent);
    return () => {
      unsubscribe();
    };
  }, [handleEarbudEvent]);

  const triggerSimulatedTap = React.useCallback((event: EarbudEventType = 'SINGLE_TAP') => {
    earbudService.triggerSimulatedTap(event);
  }, []);

  const value: EarbudManagerContextValue = {
    jarvisState,
    setJarvisState,
    settings,
    status,
    isRecording,
    recordingLevel,
    isPlaying,
    lastTranscript,
    assistantSpokenText,
    errorMessage,
    conversationId,
    updateSettings,
    triggerSimulatedTap,
    startVoiceListening,
    stopAndProcessVoice,
    interruptOrStop,
    toggleVoiceInteraction,
  };

  return (
    <EarbudManagerContext.Provider value={value}>
      {children}
    </EarbudManagerContext.Provider>
  );
}

export function useEarbudManager(): EarbudManagerContextValue {
  const context = React.useContext(EarbudManagerContext);
  if (!context) {
    throw new Error('useEarbudManager must be used within an EarbudProvider');
  }
  return context;
}
