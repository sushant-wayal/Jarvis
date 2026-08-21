import { ChatMessage } from '@jarvis/shared';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme/tokens';

export interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps): React.ReactElement {
  const isUser = message.role === 'USER';
  const toolCalls = message.metadata?.executedToolCalls as Array<{ name: string }> | undefined;

  return (
    <View style={[styles.container, isUser ? styles.userAlign : styles.jarvisAlign]}>
      {/* Sender Tag Header */}
      <View style={[styles.headerRow, isUser ? styles.userHeader : styles.jarvisHeader]}>
        {!isUser && <View style={styles.inlineOrb} />}
        <Text style={[typography.labelCaps, isUser ? styles.userLabel : styles.jarvisLabel]}>
          {isUser ? 'Sushant' : 'JARVIS'}
        </Text>
        <Text style={styles.timeLabel}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      {/* Typography-First Content (Spacious & Clean) */}
      <Text style={[typography.bodyXl, isUser ? styles.userText : styles.jarvisText]}>
        {message.content}
      </Text>

      {/* Tool executions summary */}
      {toolCalls && toolCalls.length > 0 && (
        <View style={styles.toolCallsContainer}>
          {toolCalls.map((t, idx) => (
            <View key={idx} style={styles.toolPill}>
              <Text style={styles.toolIcon}>⚙</Text>
              <Text style={styles.toolName}>{t.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
  },
  userAlign: {
    alignItems: 'flex-end',
  },
  jarvisAlign: {
    alignItems: 'flex-start',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  userHeader: {
    justifyContent: 'flex-end',
  },
  jarvisHeader: {
    justifyContent: 'flex-start',
  },
  inlineOrb: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryContainer,
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  userLabel: {
    color: colors.onSurfaceVariant,
    opacity: 0.7,
  },
  jarvisLabel: {
    color: colors.primaryFixed,
  },
  timeLabel: {
    color: colors.outlineVariant,
    fontSize: 10,
  },
  userText: {
    color: colors.onSurface,
    textAlign: 'right',
    maxWidth: '90%',
    lineHeight: 26,
  },
  jarvisText: {
    color: colors.primary,
    textAlign: 'left',
    maxWidth: '94%',
    lineHeight: 28,
  },
  toolCallsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  toolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 240, 255, 0.08)',
    borderColor: 'rgba(0, 240, 255, 0.2)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  toolIcon: {
    color: colors.primaryFixed,
    fontSize: 10,
  },
  toolName: {
    color: colors.primaryFixed,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
