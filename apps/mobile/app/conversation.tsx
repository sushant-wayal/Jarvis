import { ChatMessage, ConversationSummary } from '@jarvis/shared';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
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

export default function ConversationScreen() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [speakResponse, setSpeakResponse] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const { playBase64Audio } = useAudioPlayer();

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const list = await apiClient.getConversations();
      setConversations(list);
      if (list.length > 0 && !activeConvId) {
        setActiveConvId(list[0].id);
        loadMessages(list[0].id);
      }
    } catch {
      // offline/error fallback
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (id: string) => {
    try {
      setLoading(true);
      const msgs = await apiClient.getConversationMessages(id);
      setMessages(msgs);
    } catch {
      // error loading
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConv = (id: string) => {
    setActiveConvId(id);
    loadMessages(id);
  };

  const handleNewConversation = () => {
    setActiveConvId(null);
    setMessages([]);
  };

  const handleDeleteConv = async (id: string) => {
    await apiClient.deleteConversation(id);
    await loadConversations();
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const userText = inputText.trim();
    setInputText('');
    setSending(true);

    const tempUserMsg: ChatMessage = {
      id: `tmp_${Date.now()}`,
      conversationId: activeConvId || '',
      role: 'USER',
      content: userText,
      inputType: 'TEXT',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await apiClient.sendChatMessage(userText, activeConvId || undefined, speakResponse);
      if (!activeConvId) {
        setActiveConvId(res.conversationId);
      }

      const jarvisMsg: ChatMessage = {
        id: `jarvis_${Date.now()}`,
        conversationId: res.conversationId,
        role: 'ASSISTANT',
        content: res.text,
        inputType: 'TEXT',
        createdAt: new Date().toISOString(),
        metadata: { executedToolCalls: res.toolCalls },
      };

      setMessages((prev) => [...prev, jarvisMsg]);
      await loadConversations();

      if (speakResponse && res.audioBase64) {
        await playBase64Audio(res.audioBase64);
      }
    } catch {
      const errMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        conversationId: activeConvId || '',
        role: 'ASSISTANT',
        content: "I couldn't process that right now. Please check your connection.",
        inputType: 'TEXT',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>Conversation History</Text>
        <TouchableOpacity style={styles.newBtn} onPress={handleNewConversation}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Conversation Selector */}
      <View style={styles.convBar}>
        <ScrollViewHorizontal conversations={conversations} activeId={activeConvId} onSelect={handleSelectConv} onDelete={handleDeleteConv} />
      </View>

      {/* Messages List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#38BDF8" size="large" />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No messages in this conversation. Send a message or record voice.</Text>
          }
        />
      )}

      {/* Input bar */}
      <View style={styles.inputContainer}>
        <View style={styles.speakToggleRow}>
          <Text style={styles.speakLabel}>🔊 Speak response</Text>
          <Switch value={speakResponse} onValueChange={setSpeakResponse} trackColor={{ false: '#334155', true: '#0284C7' }} thumbColor="#F8FAFC" />
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message to Jarvis..."
            placeholderTextColor="#64748B"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity style={[styles.sendBtn, sending && styles.disabledBtn]} onPress={handleSend} disabled={sending}>
            <Text style={styles.sendBtnText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function ScrollViewHorizontal({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <FlatList
      horizontal
      data={conversations}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      renderItem={({ item }) => {
        const isActive = item.id === activeId;
        return (
          <TouchableOpacity style={[styles.convChip, isActive && styles.activeConvChip]} onPress={() => onSelect(item.id)}>
            <Text style={[styles.convChipText, isActive && styles.activeConvChipText]} numberOfLines={1}>
              {item.title}
            </Text>
            <TouchableOpacity style={styles.delChip} onPress={() => onDelete(item.id)}>
              <Text style={styles.delChipText}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0D14',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  newBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  newBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  convBar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  convChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  activeConvChip: {
    backgroundColor: '#0369A1',
  },
  convChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120,
  },
  activeConvChipText: {
    color: '#FFFFFF',
  },
  delChip: {
    marginLeft: 6,
    padding: 2,
  },
  delChipText: {
    color: '#94A3B8',
    fontSize: 10,
  },
  listContent: {
    paddingVertical: 12,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 20,
  },
  inputContainer: {
    padding: 12,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  speakToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  speakLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 14,
    marginRight: 8,
  },
  sendBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
