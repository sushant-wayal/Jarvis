import { MemoryItem } from '@jarvis/shared';
import * as React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, rounded, typography } from '../theme/tokens';
import { GlassCard } from './GlassCard';
import { Icon, IconName } from './Icon';

export interface MemoryDetailModalProps {
  visible: boolean;
  memory: MemoryItem | null;
  onClose: () => void;
  onDelete: (id: string) => Promise<void> | void;
}

export function MemoryDetailModal({
  visible,
  memory,
  onClose,
  onDelete,
}: MemoryDetailModalProps): React.ReactElement {
  if (!memory) return <Modal visible={false} />;

  const confidencePct = Math.min(Math.round(((memory.importance || 5) / 5) * 100), 100);

  const getCategoryIcon = (type: string): IconName => {
    switch (type) {
      case 'PREFERENCE':
      case 'TRAVEL':
        return 'flight_takeoff';
      case 'FACT':
        return 'insights';
      case 'PERSON':
        return 'person';
      case 'PROJECT':
        return 'lan';
      case 'ROUTINE':
        return 'schedule';
      case 'GOAL':
        return 'bolt';
      default:
        return 'memory';
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Top Bar matching memory details.html */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn}>
              <Icon name="arrow_back" size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
            <Text style={[typography.labelCaps, styles.headerTitle]}>MEMORY</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Memory Header Area */}
          <View style={styles.badgeSection}>
            <View style={styles.iconCircle}>
              <Icon
                name={getCategoryIcon(memory.type)}
                size={28}
                color={colors.primaryContainer}
              />
            </View>
            <Text style={[typography.labelCaps, styles.categoryLabel]}>
              {memory.type} PREFERENCE
            </Text>
            <Text style={[typography.headlineLg, styles.memoryTitle]}>
              {memory.type === 'PREFERENCE' ? 'Travel Preferences' : 'Extracted Intelligence'}
            </Text>
          </View>

          {/* Main Detail Card */}
          <GlassCard style={styles.card}>
            <Text style={[typography.bodyXl, styles.content]}>{memory.content}</Text>

            {/* Metadata Bento Grid */}
            <View style={styles.metaGrid}>
              <View style={styles.metaCol}>
                <Text style={[typography.labelCaps, styles.metaLabel]}>CAPTURED</Text>
                <Text style={[typography.bodyMd, styles.metaValue]}>
                  {new Date(memory.createdAt).toLocaleDateString()} ·{' '}
                  {new Date(memory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              <View style={styles.metaCol}>
                <Text style={[typography.labelCaps, styles.metaLabel]}>SOURCE</Text>
                <View style={styles.sourceRow}>
                  <Icon name="chat_bubble" size={14} color={colors.primaryContainer} />
                  <Text style={[typography.bodyMd, styles.metaValue]}>Conversation</Text>
                </View>
              </View>

              <View style={styles.confidenceRow}>
                <View style={styles.confidenceHeader}>
                  <Text style={[typography.labelCaps, styles.metaLabel]}>CONFIDENCE</Text>
                  <Text style={styles.confidenceScore}>{confidencePct}%</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${confidencePct}%` }]} />
                </View>
              </View>
            </View>
          </GlassCard>

          {/* Action Area */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.deleteBtn}
            onPress={() => {
              onDelete(memory.id);
              onClose();
            }}
          >
            <Icon name="delete" size={18} color={colors.error} />
            <Text style={[typography.labelCaps, styles.deleteText]}>FORGET THIS MEMORY</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: rounded.xl,
    borderTopRightRadius: rounded.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.primaryFixed,
    letterSpacing: 3,
    fontSize: 12,
  },
  badgeSection: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 240, 255, 0.08)',
    borderColor: 'rgba(0, 240, 255, 0.2)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  categoryLabel: {
    color: colors.primaryContainer,
    fontSize: 10,
  },
  memoryTitle: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: '400',
  },
  card: {
    padding: 20,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: rounded.lg,
    marginBottom: 20,
  },
  content: {
    color: colors.onSurface,
    lineHeight: 28,
    fontWeight: '300',
    marginBottom: 20,
  },
  metaGrid: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 16,
    gap: 14,
  },
  metaCol: {
    gap: 4,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLabel: {
    color: colors.outlineVariant,
    fontSize: 9,
  },
  metaValue: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
  },
  confidenceRow: {
    marginTop: 4,
    gap: 6,
  },
  confidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confidenceScore: {
    color: colors.primaryContainer,
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primaryContainer,
    borderRadius: 2,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderRadius: rounded.full,
    paddingVertical: 14,
    gap: 8,
  },
  deleteText: {
    color: colors.error,
    fontSize: 10,
    letterSpacing: 2,
  },
});
