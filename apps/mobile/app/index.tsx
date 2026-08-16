import { ChatMessage, JarvisState } from '@jarvis/shared';
import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MessageBubble } from '../src/components/MessageBubble';
import { StatusHeader } from '../src/components/StatusHeader';
import { VoiceOrb } from '../src/components/VoiceOrb';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { useVoiceRecorder } from '../src/hooks/useVoiceRecorder';
import { apiClient } from '../src/services/apiClient';

export default function HomeScreen(): React.ReactElement {
  const [jarvisState, setJarvisState] = React.useState<JarvisState>('IDLE');
  const [isOnline, setIsOnline] = React.useState<boolean>(true);
  const [conversationId, setConversationId] = React.useState<string | undefined>(undefined);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [lastTranscript, setLastTranscript] = React.useState<string>('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const { isRecording, recordingLevel, startRecording, stopRecording } = useVoiceRecorder();
  const { isPlaying, playBase64Audio, stopAudio } = useAudioPlayer();

  const runHealthCheck = async (): Promise<void> => {
    const health = await apiClient.checkHealth();
    const online = Boolean(health);
    setIsOnline(online);
    setJarvisState((prev: JarvisState) => {
      if (!online) return 'OFFLINE';
      if (prev === 'OFFLINE') return 'IDLE';
      return prev;
    });
  };

  // Check health once on initial mount
  React.useEffect(() => {
    runHealthCheck();
  }, []);

  // Sync state transitions
  React.useEffect(() => {
    if (isRecording) {
      setJarvisState('LISTENING');
    } else if (isPlaying) {
      setJarvisState('SPEAKING');
    } else if (!isRecording && !isPlaying && jarvisState === 'SPEAKING') {
      setJarvisState('IDLE');
    }
  }, [isRecording, isPlaying, jarvisState]);

  const handleOrbPress = async (): Promise<void> => {
    setErrorMsg(null);

    // If currently playing, stop audio and allow immediate new recording
    if (isPlaying) {
      await stopAudio();
      setJarvisState('IDLE');
      return;
    }

    if (isRecording) {
      // Stop recording and send audio to backend
      setJarvisState('PROCESSING');
      const audioData = await stopRecording();

      if (!audioData) {
        setJarvisState('ERROR');
        setErrorMsg("Couldn't capture audio. Please try again.");
        return;
      }

      setJarvisState('THINKING');

      try {
        const response = await apiClient.sendVoiceAudio(
          audioData.audioBase64,
          audioData.mimeType,
          conversationId
        );

        setConversationId(response.conversationId);
        setLastTranscript(response.transcript);

        if (response.transcript) {
          const userMsg: ChatMessage = {
            id: `msg_u_${Date.now()}`,
            conversationId: response.conversationId,
            role: 'USER',
            content: response.transcript,
            inputType: 'VOICE',
            createdAt: new Date().toISOString(),
          };
          const jarvisMsg: ChatMessage = {
            id: `msg_j_${Date.now()}`,
            conversationId: response.conversationId,
            role: 'ASSISTANT',
            content: response.response,
            inputType: 'VOICE',
            createdAt: new Date().toISOString(),
          };

          setMessages((prev: ChatMessage[]) => [...prev, userMsg, jarvisMsg]);
        }

        if (response.audioBase64) {
          setJarvisState('SPEAKING');
          await playBase64Audio(response.audioBase64, 'audio/mp3', () => {
            setJarvisState('IDLE');
          });
        } else {
          setJarvisState('IDLE');
        }
      } catch (err: unknown) {
        setJarvisState('ERROR');
        setErrorMsg(err instanceof Error ? err.message : 'No connection. I will need internet access for that.');
      }
    } else {
      // Start recording next question
      setJarvisState('LISTENING');
      await startRecording();
    }
  };

  return (
    <View style={styles.screenContainer}>
      <StatusHeader state={jarvisState} isOnline={isOnline} onRefresh={runHealthCheck} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.orbContainer}>
          <VoiceOrb state={jarvisState} onPress={handleOrbPress} audioLevel={recordingLevel} />
        </View>

        {errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          </View>
        ) : null}

        {lastTranscript ? (
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptLabel}>Heard:</Text>
            <Text style={styles.transcriptText}>"{lastTranscript}"</Text>
          </View>
        ) : null}

        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Voice Interaction</Text>
          {messages.length === 0 ? (
            <Text style={styles.emptyText}>Tap the orb above and speak directly to Jarvis.</Text>
          ) : (
            messages.slice(-4).map((msg: ChatMessage) => <MessageBubble key={msg.id} message={msg} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#0A0D14',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  errorBox: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  transcriptBox: {
    marginHorizontal: 20,
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  transcriptLabel: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  transcriptText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontStyle: 'italic',
  },
  recentSection: {
    marginTop: 12,
    paddingHorizontal: 10,
  },
  sectionTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 10,
    marginBottom: 8,
  },
  emptyText: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 20,
  },
});
