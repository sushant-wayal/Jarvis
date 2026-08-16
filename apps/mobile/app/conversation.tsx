import { ChatMessage, ConversationSummary } from '@jarvis/shared';
import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MessageBubble } from '../src/components/MessageBubble';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { apiClient } from '../src/services/apiClient';

export default function ConversationScreen(): React.ReactElement {
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [inputText, setInputText] = React.useState<string>('');
  const [speakResponse, setSpeakResponse] = React.useState<boolean>(true);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [sending, setSending] = React.useState<boolean>(false);

  const { playBase64Audio } = useAudioPlayer();

  const loadMessages = async (convId: string): Promise<void> => {
    try {
      const msgs = await apiClient.getMessages(convId);
      setMessages(msgs);
    } catch {
      // Offline / error fallback
    }
  };

  const loadConversations = async (): Promise<void> => {
    try {
      setLoading(true);
      const list = await apiClient.getConversations();
      setConversations(list);
      if (list.length > 0 && !activeConvId) {
        setActiveConvId(list[0].id);
        loadMessages(list[0].id);
      }
    } catch {
      // Offline / error fallback
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadConversations();
  }, []);

  const handleSelectConversation = (id: string): void => {
    setActiveConvId(id);
    loadMessages(id);
  };

  const handleSendMessage = async (): Promise<void> => {
    if (!inputText.trim() || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    const userMsg: ChatMessage = {
      id: `temp_u_${Date.now()}`,
      conversationId: activeConvId || 'new',
      role: 'USER',
      content: text,
      inputType: 'TEXT',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await apiClient.sendMessage({
        message: text,
        conversationId: activeConvId || undefined,
        speakResponse,
      });

      if (!activeConvId) {
        setActiveConvId(res.conversationId);
        loadConversations();
      }

      const jarvisMsg: ChatMessage = {
        id: `temp_j_${Date.now()}`,
        conversationId: res.conversationId,
        role: 'ASSISTANT',
        content: res.text,
        inputType: 'TEXT',
        metadata: {
          executedToolCalls: res.toolCalls,
        },
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, jarvisMsg]);

      if (res.shouldSpeak && res.text) {
        const ttsRes = await apiClient.synthesizeSpeech(res.text);
        if (ttsRes?.audioBase64) {
          playBase64Audio(ttsRes.audioBase64);
        }
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `temp_err_${Date.now()}`,
        conversationId: activeConvId || 'error',
        role: 'ASSISTANT',
        content: 'Sorry, I am having trouble connecting to my central brain.',
        inputType: 'TEXT',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>Conversation History</Text>
        <TouchableOpacity
          style={styles.newChatButton}
          onPress={() => {
            setActiveConvId(null);
            setMessages([]);
          }}
        >
          <Text style={styles.newChatButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Conversation Selector */}
      <View style={styles.convListWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.convTab,
                activeConvId === item.id && styles.activeConvTab,
              ]}
              onPress={() => handleSelectConversation(item.id)}
            >
              <Text
                style={[
                  styles.convTabText,
                  activeConvId === item.id && styles.activeConvTabText,
                ]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyConvText}>No active threads</Text>
          }
        />
      </View>

      {/* Messages View */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyMessagesText}>
                No messages in this conversation.
              </Text>
              <Text style={styles.emptyMessagesSubtext}>
                Ask Jarvis a question below.
              </Text>
            </View>
          }
        />
      )}

      {/* Input bar */}
      <View style={styles.inputArea}>
        <View style={styles.controlsRow}>
          <View style={styles.switchRow}>
            <Switch
              value={speakResponse}
              onValueChange={setSpeakResponse}
              trackColor={{ false: '#334155', true: '#0284C7' }}
              thumbColor={speakResponse ? '#38BDF8' : '#94A3B8'}
            />
            <Text style={styles.switchLabel}>Auto-Speak Answers</Text>
          </View>
        </View>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor="#64748B"
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || sending) && styles.disabledSendButton,
            ]}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0D14',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  newChatButton: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  newChatButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  convListWrapper: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  convTab: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
    maxWidth: 160,
  },
  activeConvTab: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  convTabText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  activeConvTabText: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  emptyConvText: {
    color: '#475569',
    fontSize: 12,
    paddingVertical: 6,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: {
    paddingVertical: 16,
    flexGrow: 1,
  },
  emptyMessages: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
  },
  emptyMessagesText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyMessagesSubtext: {
    color: '#475569',
    fontSize: 13,
    marginTop: 4,
  },
  inputArea: {
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 90,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sendButton: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginLeft: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledSendButton: {
    backgroundColor: '#334155',
  },
  sendButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
});
