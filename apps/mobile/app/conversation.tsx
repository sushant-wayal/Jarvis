import { ChatMessage, ConversationSummary } from '@jarvis/shared';
import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ActionCardData, ContextualActionCards } from '../src/components/ContextualActionCards';
import { GlassCard } from '../src/components/GlassCard';
import { Icon } from '../src/components/Icon';
import { MessageBubble } from '../src/components/MessageBubble';
import { StatusHeader } from '../src/components/StatusHeader';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { integrationManager } from '../src/integrations/IntegrationManager';
import { apiClient } from '../src/services/apiClient';
import { reminderScheduler } from '../src/services/reminderScheduler';
import { colors, rounded, typography } from '../src/theme/tokens';

export default function ConversationScreen(): React.ReactElement {
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [inputText, setInputText] = React.useState<string>('');
  const [speakResponse, setSpeakResponse] = React.useState<boolean>(true);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [sending, setSending] = React.useState<boolean>(false);
  const [refreshing, setRefreshing] = React.useState<boolean>(false);

  const { playBase64Audio } = useAudioPlayer();

  const loadMessages = async (convId: string): Promise<void> => {
    try {
      const msgs = await apiClient.getMessages(convId);
      const sorted = [...msgs].sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        if (timeA !== timeB) return timeA - timeB;
        if (a.role === 'USER' && b.role === 'ASSISTANT') return -1;
        if (a.role === 'ASSISTANT' && b.role === 'USER') return 1;
        return a.id.localeCompare(b.id);
      });
      setMessages(sorted);
    } catch {
      // fallback
    }
  };

  const loadConversations = async (autoSelect = false): Promise<void> => {
    try {
      setLoading(true);
      const list = await apiClient.getConversations();
      setConversations(list);
      if (autoSelect && list.length > 0 && !activeConvId) {
        setActiveConvId(list[0].id);
        loadMessages(list[0].id);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadConversations(true);
  }, []);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await loadConversations(false);
      if (activeConvId) {
        await loadMessages(activeConvId);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleSelectConversation = (id: string): void => {
    setActiveConvId(id);
    loadMessages(id);
  };

  const handleSendMessage = async (customText?: string): Promise<void> => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || sending) return;

    if (!customText) setInputText('');
    setSending(true);

    const userMsg: ChatMessage = {
      id: `temp_u_${Date.now()}`,
      conversationId: activeConvId || 'new',
      role: 'USER',
      content: textToSend,
      inputType: 'TEXT',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const phoneContext = await integrationManager.buildPhoneContext().catch(() => undefined);

      const res = await apiClient.sendMessage({
        message: textToSend,
        conversationId: activeConvId || undefined,
        speakResponse,
        phoneContext,
      });

      if (!activeConvId) {
        setActiveConvId(res.conversationId);
        loadConversations(false);
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

      // Execute pending phone action (e.g. open app, make call, send sms)
      if (res.pendingPhoneAction) {
        integrationManager.executeAction(res.pendingPhoneAction).catch(() => {});
      }

      // Schedule native hardware alarm for time-based reminder
      if (res.scheduledReminder) {
        reminderScheduler
          .scheduleTaskReminder(
            res.scheduledReminder.taskId,
            res.scheduledReminder.title,
            res.scheduledReminder.scheduledFor,
            res.scheduledReminder.description
          )
          .catch(() => {});
      }

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
        content: 'I am temporarily unable to reach my core cognition matrix.',
        inputType: 'TEXT',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  // Helper to extract dynamic contextual cards from real tool execution results
  const getContextCardsForMessage = (message: ChatMessage): ActionCardData | null => {
    const meta = message.metadata;
    if (!meta) return null;

    const toolCalls = (meta.executedToolCalls || meta.toolCalls) as
      | Array<{ name?: string; toolName?: string; input?: any; output?: any }>
      | undefined;

    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
      return null;
    }

    const card: ActionCardData = {};

    for (const tool of toolCalls) {
      const name = tool.name || tool.toolName || '';
      const output = tool.output;

      if (name.includes('weather') && output && typeof output === 'object') {
        const outObj = output as Record<string, any>;
        card.forecast = {
          temp: outObj.temperature ? `${outObj.temperature}°` : (outObj.temp || '24°'),
          label: outObj.condition || 'Current',
          summary: outObj.summary || outObj.description || 'Live meteorological update.',
        };
      } else if (name.includes('flight') && output && typeof output === 'object') {
        const outObj = output as Record<string, any>;
        card.flight = {
          from: outObj.origin || outObj.from || 'DEP',
          to: outObj.destination || outObj.to || 'ARR',
          price: outObj.price || outObj.summary || 'Live flight query results.',
        };
      } else if (output) {
        card.toolResult = {
          title: name.toUpperCase().replace(/_/g, ' '),
          icon: name.includes('search') ? 'search' : name.includes('task') ? 'check' : 'bolt',
          details: typeof output === 'string' ? output.slice(0, 120) : JSON.stringify(output).slice(0, 120),
        };
      }
    }

    return Object.keys(card).length > 0 ? card : null;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusHeader isOnline={true} title="JARVIS" />

      {/* Horizontal Thread Selector Pills */}
      <View style={styles.threadsBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.threadsList}
          renderItem={({ item }) => {
            const isActive = activeConvId === item.id;
            return (
              <TouchableOpacity
                style={[styles.threadChip, isActive && styles.activeThreadChip]}
                onPress={() => handleSelectConversation(item.id)}
              >
                <Text
                  style={[
                    typography.labelCaps,
                    styles.threadText,
                    isActive && styles.activeThreadText,
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListHeaderComponent={
            <TouchableOpacity
              style={styles.newThreadBtn}
              onPress={() => {
                setActiveConvId(null);
                setMessages([]);
              }}
            >
              <Icon name="add" size={14} color={colors.primaryFixed} />
              <Text style={[typography.labelCaps, styles.newThreadText]}>NEW</Text>
            </TouchableOpacity>
          }
        />
      </View>

      {/* Messages Canvas */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primaryFixed} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primaryFixed}
              colors={[colors.primaryFixed]}
            />
          }
          renderItem={({ item, index }) => {
            const contextData =
              item.role === 'ASSISTANT' && index === messages.length - 1
                ? getContextCardsForMessage(item)
                : null;

            return (
              <View>
                <MessageBubble message={item} />
                {contextData && (
                  <View style={styles.cardsWrapper}>
                    <ContextualActionCards
                      data={contextData}
                      onActionPress={(action) => {
                        handleSendMessage(`Please ${action.toLowerCase()}.`);
                      }}
                    />
                  </View>
                )}
              </View>
            );
          }}
          contentContainerStyle={styles.messagesContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyOrbCircle}>
                <Icon name="bolt" size={24} color={colors.primaryFixed} />
              </View>
              <Text style={[typography.headlineLg, styles.emptyTitle]}>Intelligence Stream</Text>
              <Text style={[typography.bodyMd, styles.emptySub]}>
                Spacious dialogue canvas. Ask Jarvis anything or initiate an automated task.
              </Text>
            </View>
          }
        />
      )}

      {/* Floating Glass Input Bar matching Conversation.html */}
      <View style={styles.inputDock}>
        {/* Controls row */}
        <View style={styles.controlsRow}>
          <View style={styles.speakToggleRow}>
            <Switch
              value={speakResponse}
              onValueChange={setSpeakResponse}
              trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryContainer }}
              thumbColor={speakResponse ? colors.primaryFixed : colors.outline}
            />
            <Text style={[typography.labelCaps, styles.speakToggleLabel]}>
              AUTO-SPEAK RESPONSES
            </Text>
          </View>
        </View>

        {/* Input Pill */}
        <GlassCard style={styles.inputPill}>
          <TouchableOpacity style={styles.plusBtn}>
            <Icon name="add" size={20} color={colors.outline} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask Jarvis anything..."
            placeholderTextColor={colors.outline}
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!inputText.trim() || sending) && styles.disabledSendBtn,
            ]}
            onPress={() => handleSendMessage()}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Icon
                name={inputText.trim() ? 'arrow_forward' : 'mic'}
                size={18}
                color={inputText.trim() ? colors.background : colors.primaryFixed}
              />
            )}
          </TouchableOpacity>
        </GlassCard>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  threadsBar: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    backgroundColor: 'rgba(19, 19, 20, 0.6)',
  },
  threadsList: {
    paddingHorizontal: 20,
    gap: 8,
    alignItems: 'center',
  },
  newThreadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 240, 255, 0.08)',
    borderColor: 'rgba(0, 240, 255, 0.25)',
    borderWidth: 1,
    borderRadius: rounded.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
    marginRight: 8,
  },
  newThreadText: {
    color: colors.primaryFixed,
    fontSize: 10,
  },
  threadChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    maxWidth: 160,
  },
  activeThreadChip: {
    backgroundColor: 'rgba(125, 244, 255, 0.12)',
    borderColor: colors.primaryFixed,
  },
  threadText: {
    color: colors.outline,
    fontSize: 10,
  },
  activeThreadText: {
    color: colors.primaryFixed,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesContainer: {
    paddingVertical: 16,
    paddingBottom: 130,
  },
  cardsWrapper: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyOrbCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 240, 255, 0.08)',
    borderColor: 'rgba(0, 240, 255, 0.2)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    color: colors.onSurface,
    textAlign: 'center',
  },
  emptySub: {
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
  inputDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(19, 19, 20, 0.95)',
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  speakToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  speakToggleLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 9,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: rounded.full,
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 8,
  },
  plusBtn: {
    padding: 4,
  },
  textInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 15,
    maxHeight: 80,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledSendBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
});
