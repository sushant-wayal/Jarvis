import { EarbudEventType, EarbudSettings, EarbudStatus, JarvisState } from '@jarvis/shared';
import * as React from 'react';
import { earbudService } from '../services/earbudService';
import { apiClient } from '../services/apiClient';
import { reminderScheduler } from '../services/reminderScheduler';
import { useVoiceRecorder } from './useVoiceRecorder';
import { useAudioPlayer } from './useAudioPlayer';
import { integrationManager } from '../integrations/IntegrationManager';
import { backgroundMusicPlayer } from '../services/BackgroundMusicPlayer';

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
    }
  }, [isRecording, isPlaying]);

  const updateSettings = React.useCallback((partial: Partial<EarbudSettings>) => {
    earbudService.updateSettings(partial);
    setSettings(earbudService.getSettings());
    setStatus(earbudService.getStatus());
  }, []);

  const interruptOrStop = React.useCallback(async (): Promise<void> => {
    setErrorMessage(null);
    await backgroundMusicPlayer.resumeAfterSpeaking();
    if (isPlaying) {
      await stopAudio();
      setJarvisState('IDLE');
      earbudService.resumeTapDetection(300);
      await earbudService.playErrorChime();
      return;
    }
    if (isRecording) {
      await cancelRecording();
      setJarvisState('IDLE');
      earbudService.resumeTapDetection(300);
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

      // Temporarily pause background music so mic captures ONLY clean user voice (no song lyrics)
      await backgroundMusicPlayer.pauseForVoiceInput();

      // Suppress tap detection while recording so audio mode changes
      // don't false-trigger the carrier tap detector
      earbudService.suppressTapDetection();

      // 1. Play the wake chime in full through earbuds FIRST
      await earbudService.playWakeChime();

      // 2. ONLY THEN switch state to LISTENING and start microphone recording
      setJarvisState('LISTENING');
      await startRecording();
    } catch (err: unknown) {
      // On failure, restore tap detection immediately
      earbudService.resumeTapDetection(200);
      setJarvisState('ERROR');
      const errorMsg = err instanceof Error ? err.message : 'Microphone initialization failed.';
      setErrorMessage(errorMsg);
      setAssistantSpokenText(
        `### ⚠️ Microphone Hardware Failed\n\n${errorMsg}\n\n*Please ensure microphone permissions are granted in Android Settings.*`
      );
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

      // Surface action failure directly in UI so the user knows if the app is missing or dialer failed
      if (!result.success && result.error) {
        setAssistantSpokenText((prev) => `${prev}\n\n⚠️ ${result.error}`);
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
      // 1. Stop audio recording first so the microphone is released
      const audioData = await stopRecording();

      // 2. Play the process chime in full through earbuds FIRST
      await earbudService.playProcessChime();

      // 3. ONLY THEN switch state to PROCESSING / THINKING
      setJarvisState('PROCESSING');
      // Resume background music while processing so there is no awkward silence
      await backgroundMusicPlayer.resumeForProcessing();

      if (!audioData || !audioData.audioBase64) {
        await backgroundMusicPlayer.resumeAfterSpeaking();
        setJarvisState('ERROR');
        const emptyAudioMsg = '[Step: Audio Capture · Empty Stream]\nNo voice audio was detected from your microphone.';
        setErrorMessage(emptyAudioMsg);
        setAssistantSpokenText(
          `### ⚠️ Audio Capture Failed\n\n${emptyAudioMsg}\n\n*Please verify your microphone is not muted and speak clearly.*`
        );
        await earbudService.playErrorChime();
        setTimeout(() => {
          setJarvisState('IDLE');
          // Re-arm tap detection after error
          earbudService.resumeTapDetection(200);
        }, 3000);
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

      // Schedule native hardware alarm if voice command created a reminder
      if (response.scheduledReminder) {
        reminderScheduler
          .scheduleTaskReminder(
            response.scheduledReminder.taskId,
            response.scheduledReminder.title,
            response.scheduledReminder.scheduledFor,
            response.scheduledReminder.description
          )
          .catch(() => {});
      }

      const hasPhoneAction = Boolean(response.pendingPhoneAction);
      const actionType = (
        ((response.pendingPhoneAction as any)?.type || (response.pendingPhoneAction as any)?.action || '') as string
      ).toUpperCase();
      const isPlayMedia = actionType === 'PLAY_MEDIA';
      const isMediaAction = isPlayMedia || actionType === 'CONTROL_MEDIA';

      // If user commanded media (pause, stop, resume, play new track),
      // cancel automatic music resumption so their explicit command holds
      if (isMediaAction) {
        backgroundMusicPlayer.cancelVoiceInputResume();
      }

      const shouldContinue =
        Boolean(response.response) &&
        !response.response.includes('Understood. Goodbye') &&
        !hasPhoneAction &&
        (response as unknown as { continuousListening?: boolean }).continuousListening !== false;

      // Immediately execute non-media pending phone actions so app switch / call dialer / pause isn't delayed
      if (hasPhoneAction && !isPlayMedia) {
        void handlePendingPhoneAction(response);
      }

      if (response.audioBase64) {
        // Pause music again while Jarvis is speaking so voice response is crystal clear!
        await backgroundMusicPlayer.pauseForSpeaking();
        setJarvisState('SPEAKING');
        await playBase64Audio(response.audioBase64, 'audio/mp3', async () => {
          // Play media cleanly AFTER Jarvis finishes speaking so voice and music do not collide
          if (isPlayMedia) {
            void handlePendingPhoneAction(response);
          } else if (!isMediaAction) {
            // Non-media response finished -> resume the music that was playing before voice input
            await backgroundMusicPlayer.resumeAfterSpeaking();
          }

          if (shouldContinue) {
            await startVoiceListening();
          } else {
            setJarvisState('IDLE');
            earbudService.resumeTapDetection(200);
          }
        });
      } else {
        if (isPlayMedia) {
          void handlePendingPhoneAction(response);
        } else if (!isMediaAction) {
          await backgroundMusicPlayer.resumeAfterSpeaking();
        }
        if (shouldContinue) {
          await startVoiceListening();
        } else {
          setJarvisState('IDLE');
          earbudService.resumeTapDetection(200);
        }
      }
    } catch (err: unknown) {
      await backgroundMusicPlayer.resumeAfterSpeaking();
      setJarvisState('ERROR');
      const errorMsg = err instanceof Error ? err.message : 'Cognitive brain link failed.';
      setErrorMessage(errorMsg);
      setAssistantSpokenText(
        `### ⚠️ Request Execution Failed\n\n${errorMsg}\n\n*Tap ✕ above to dismiss or tap the mic below to retry.*`
      );
      await earbudService.playErrorChime();
      setTimeout(() => {
        setJarvisState('IDLE');
        // Re-arm tap detection after error recovery
        earbudService.resumeTapDetection(200);
      }, 3000);
    }
  }, [stopRecording, playBase64Audio, handlePendingPhoneAction, startVoiceListening]);


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

  // Silence auto-send detection: auto-submits when user pauses for 4.5s after speaking
  const speechDetectedRef = React.useRef(false);
  const silenceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (jarvisState !== 'LISTENING') {
      speechDetectedRef.current = false;
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      return;
    }

    if (!settings.autoSilenceStop) return;

    // Real human speech metering level is > 0.45 (ambient room noise is < 0.25 on normalized scale)
    if (recordingLevel > 0.45) {
      speechDetectedRef.current = true;
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    } else if (speechDetectedRef.current) {
      // User was speaking and has now paused
      if (!silenceTimeoutRef.current) {
        const thresholdMs = (settings.silenceThresholdSeconds || 4.5) * 1000;
        silenceTimeoutRef.current = setTimeout(() => {
          silenceTimeoutRef.current = null;
          speechDetectedRef.current = false;
          if (stateRef.current.jarvisState === 'LISTENING') {
            void stopAndProcessVoice();
          }
        }, thresholdMs);
      }
    }
  }, [jarvisState, recordingLevel, settings.autoSilenceStop, settings.silenceThresholdSeconds, stopAndProcessVoice]);

  // Idle timeout: if in continuous listening mode and user says nothing for 3.8s, peacefully return to IDLE without sending audio
  React.useEffect(() => {
    if (jarvisState !== 'LISTENING') return;
    const idleTimer = setTimeout(() => {
      if (stateRef.current.jarvisState === 'LISTENING' && !speechDetectedRef.current) {
        void interruptOrStop();
      }
    }, 3800);
    return () => clearTimeout(idleTimer);
  }, [jarvisState, interruptOrStop]);

  // Handle Earbud Events received from hardware / MediaSession
  const handleEarbudEvent = React.useCallback(
    async (event: EarbudEventType) => {
      setStatus(earbudService.getStatus());
      const currentState = stateRef.current.jarvisState;

      if (currentState === 'IDLE' || currentState === 'ERROR') {
        // Any intentional tap or media button wakes Jarvis when idle
        if (
          event === 'SINGLE_TAP' ||
          event === 'DOUBLE_TAP' ||
          event === 'MEDIA_PLAY' ||
          event === 'MEDIA_PAUSE'
        ) {
          await startVoiceListening();
        }
      } else if (currentState === 'LISTENING') {
        // Tapping while listening completes & processes voice immediately (supports boAt double-tap as well)
        if (
          event === 'SINGLE_TAP' ||
          event === 'DOUBLE_TAP' ||
          event === 'MEDIA_PLAY' ||
          event === 'MEDIA_PAUSE'
        ) {
          await stopAndProcessVoice();
        } else if (event === 'LONG_PRESS') {
          await interruptOrStop();
        }
      } else if (currentState === 'SPEAKING') {
        // Any tap while speaking immediately interrupts
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
