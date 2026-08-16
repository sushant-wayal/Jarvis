import { ChatMessage, JarvisState } from '@jarvis/shared';
import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MessageBubble } from '../src/components/MessageBubble';
import { StatusHeader } from '../src/components/StatusHeader';
import { VoiceOrb } from '../src/components/VoiceOrb';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { useVoiceRecorder } from '../src/hooks/useVoiceRecorder';
import { apiClient } from '../src/services/apiClient';

export default function HomeScreen() {
  const [jarvisState, setJarvisState] = useState<JarvisState>('IDLE');
  const [isOnline, setIsOnline] = useState(true);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { isRecording, recordingLevel, startRecording, stopRecording } = useVoiceRecorder();
  const { isPlaying, playBase64Audio, stopAudio } = useAudioPlayer();

  // Periodic health check
  useEffect(() => {
    const check = async () => {
      const health = await apiClient.checkHealth();
      const online = Boolean(health);
      setIsOnline(online);
      if (!online) {
        setJarvisState('OFFLINE');
      } else if (jarvisState === 'OFFLINE') {
        setJarvisState('IDLE');
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [jarvisState]);

  // Sync state transitions
  useEffect(() => {
    if (isRecording) {
      setJarvisState('LISTENING');
    } else if (isPlaying) {
      setJarvisState('SPEAKING');
    }
  }, [isRecording, isPlaying]);

  const handleOrbPress = async () => {
    setErrorMsg(null);

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

          setMessages((prev) => [...prev, userMsg, jarvisMsg]);
        }

        if (response.audioBase64) {
          setJarvisState('SPEAKING');
          await playBase64Audio(response.audioBase64);
        } else {
          setJarvisState('IDLE');
        }
      } catch (err) {
        setJarvisState('ERROR');
        setErrorMsg(err instanceof Error ? err.message : 'No connection. I will need internet access for that.');
      }
    } else {
      // Start recording
      await startRecording();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusHeader state={jarvisState} isOnline={isOnline} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.orbContainer}>
          <VoiceOrb state={jarvisState} onPress={handleOrbPress} audioLevel={recordingLevel} />
        </View>

        {errorMsg && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          </View>
        )}

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
            messages.slice(-4).map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
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
