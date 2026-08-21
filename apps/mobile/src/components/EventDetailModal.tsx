import { TaskItem, UserEventItem } from '@jarvis/shared';
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
import { Icon } from './Icon';

export interface EventDetailModalProps {
  visible: boolean;
  item: TaskItem | UserEventItem | null;
  onClose: () => void;
  onToggleStatus?: (item: any) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
}

export function EventDetailModal({
  visible,
  item,
  onClose,
  onToggleStatus,
  onDelete,
}: EventDetailModalProps): React.ReactElement {
  if (!item) return <Modal visible={false} />;

  const isCompleted = item.status === 'COMPLETED' || item.status === 'CANCELLED';
  const task = item as TaskItem;
  const event = item as UserEventItem;

  const isLocationTrigger =
    Boolean(event.locationName) ||
    Boolean(task.condition?.toLowerCase().includes('location')) ||
    task.type === 'CONDITIONAL_TASK';

  const triggerTitle =
    task.schedule ||
    (event.startAt ? new Date(event.startAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : undefined) ||
    task.condition ||
    (isLocationTrigger ? 'Location Proximity' : 'On-Demand Context');

  const locationContext =
    event.locationName ||
    (task.condition?.includes('place:') ? task.condition.split('place:')[1] : null) ||
    'Global / Any Location';

  const formattedCreated = new Date(item.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header matching Event Details.html */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn}>
              <Icon name="arrow_back" size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
            <Text style={[typography.labelCaps, styles.headerTitle]}>JARVIS COGNITION</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Status Header matching Event Details.html */}
          <View style={styles.statusSection}>
            <View style={styles.statusBadgeRow}>
              <View
                style={[
                  styles.statusPulseDot,
                  { backgroundColor: isCompleted ? colors.outline : colors.primaryFixed },
                ]}
              />
              <Text style={[typography.labelCaps, styles.statusBadgeText]}>
                {isCompleted ? 'ARCHIVED / COMPLETED' : `STATUS: ${item.status}`}
              </Text>
            </View>
            <Text style={[typography.headlineLg, styles.intentionTitle]}>{item.title}</Text>
            <Text style={[typography.bodyMd, styles.intentionSubtitle]}>
              {item.description || `Autonomous monitoring registered on ${formattedCreated}.`}
            </Text>
          </View>

          {/* Bento Details Grid matching Event Details.html */}
          <View style={styles.bentoGrid}>
            {/* Trigger Condition Card */}
            <GlassCard style={styles.detailCard}>
              <View style={styles.detailCardHeader}>
                <Icon
                  name={isLocationTrigger ? 'location_on' : 'schedule'}
                  size={18}
                  color={colors.primaryFixed}
                />
                <Text style={[typography.labelCaps, styles.cardCategory]}>TRIGGER CONDITION</Text>
              </View>
              <Text style={[typography.headlineLgMobile, styles.conditionTitle]} numberOfLines={1}>
                {triggerTitle}
              </Text>
              <Text style={[typography.bodySm, styles.conditionMeta]}>
                {task.nextRunAt
                  ? `Next evaluation: ${new Date(task.nextRunAt).toLocaleTimeString()}`
                  : `Type: ${item.type || 'INTENTION'}`}
              </Text>
            </GlassCard>

            {/* Target Area Card */}
            <GlassCard style={styles.detailCard}>
              <View style={styles.detailCardHeader}>
                <Icon name="my_location" size={18} color={colors.tertiaryContainer} />
                <Text style={[typography.labelCaps, styles.cardCategory]}>LOCATION CONTEXT</Text>
              </View>
              <Text style={[typography.headlineLgMobile, styles.conditionTitle]} numberOfLines={1}>
                {locationContext}
              </Text>
              <Text style={[typography.bodySm, styles.conditionMeta]}>
                {isLocationTrigger ? 'Active geofence monitoring' : 'Universal environment'}
              </Text>
            </GlassCard>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            {onToggleStatus && (
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => {
                  onToggleStatus(item);
                  onClose();
                }}
              >
                <Icon
                  name="check"
                  size={16}
                  color={isCompleted ? colors.outline : colors.primaryFixed}
                />
                <Text style={[typography.labelCaps, styles.toggleText]}>
                  {isCompleted ? 'RE-ACTIVATE INTENTION' : 'MARK ALIGNED & COMPLETED'}
                </Text>
              </TouchableOpacity>
            )}

            {onDelete && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  onDelete(item.id);
                  onClose();
                }}
              >
                <Icon name="delete" size={16} color={colors.error} />
                <Text style={[typography.labelCaps, styles.deleteText]}>PURGE INTENTION</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.outlineVariant,
    fontSize: 12,
    letterSpacing: 2,
  },
  statusSection: {
    marginBottom: 24,
    gap: 8,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: colors.primaryFixed,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  intentionTitle: {
    color: colors.onSurface,
    fontSize: 24,
    fontWeight: '300',
    marginTop: 4,
  },
  intentionSubtitle: {
    color: colors.onSurfaceVariant,
    lineHeight: 22,
  },
  bentoGrid: {
    gap: 12,
    marginBottom: 28,
  },
  detailCard: {
    padding: 16,
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  detailCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardCategory: {
    color: colors.outlineVariant,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  conditionTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '400',
    marginBottom: 4,
  },
  conditionMeta: {
    color: colors.onSurfaceVariant,
  },
  buttonRow: {
    gap: 12,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  toggleText: {
    color: colors.primaryFixed,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: rounded.full,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  deleteText: {
    color: colors.error,
    fontSize: 11,
    letterSpacing: 1.5,
  },
});
