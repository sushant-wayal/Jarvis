import { ChatMessage } from '@jarvis/shared';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface MessageBubbleProps {
  message: ChatMessage;
  key?: string;
}

export function MessageBubble({ message }: MessageBubbleProps): React.ReactElement {
  const isUser = message.role === 'USER';
  const toolCalls = message.metadata?.executedToolCalls as Array<{ name: string }> | undefined;

  return (
    <View style={[styles.wrapper, isUser ? styles.userWrapper : styles.jarvisWrapper]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.jarvisBubble]}>
        <View style={styles.headerRow}>
          <Text style={styles.roleLabel}>{isUser ? 'You' : 'Jarvis'}</Text>
          <Text style={styles.typeBadge}>{message.inputType === 'VOICE' ? '🎤 Voice' : '💬 Text'}</Text>
        </View>

        <Text style={styles.messageContent}>{message.content}</Text>

        {toolCalls && toolCalls.length > 0 && (
          <View style={styles.toolBadgeRow}>
            {toolCalls.map((t, idx) => (
              <View key={idx} style={styles.toolBadge}>
                <Text style={styles.toolBadgeText}>⚙️ Tool: {t.name}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.timestamp}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 6,
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  userWrapper: {
    justifyContent: 'flex-end',
  },
  jarvisWrapper: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#0284C7',
    borderBottomRightRadius: 4,
  },
  jarvisBubble: {
    backgroundColor: '#1E293B',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roleLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeBadge: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '500',
  },
  messageContent: {
    color: '#F8FAFC',
    fontSize: 15,
    lineHeight: 21,
  },
  toolBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  toolBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  toolBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  timestamp: {
    color: '#64748B',
    fontSize: 10,
    textAlign: 'right',
    marginTop: 4,
  },
});
