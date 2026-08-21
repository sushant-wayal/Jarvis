import { TaskItem, UserEventItem } from '@jarvis/shared';
import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { EventDetailModal } from '../src/components/EventDetailModal';
import { GlassCard } from '../src/components/GlassCard';
import { Icon } from '../src/components/Icon';
import { StatusHeader } from '../src/components/StatusHeader';
import { apiClient } from '../src/services/apiClient';
import { colors, rounded, typography } from '../src/theme/tokens';

export default function TasksScreen(): React.ReactElement {
  const [tasks, setTasks] = React.useState<TaskItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const [filter, setFilter] = React.useState<'ACTIVE' | 'COMPLETED' | 'ALL'>('ACTIVE');
  const [newTitle, setNewTitle] = React.useState<string>('');
  const [creating, setCreating] = React.useState<boolean>(false);
  const [activeDetailItem, setActiveDetailItem] = React.useState<TaskItem | null>(null);

  const loadTasks = React.useCallback(async () => {
    try {
      const data = await apiClient.getTasks(filter === 'ALL' ? undefined : filter);
      setTasks(data);
    } catch {
      // fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  React.useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await apiClient.createTask({
        title: newTitle.trim(),
        type: 'REMINDER',
      });
      setNewTitle('');
      loadTasks();
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (task: TaskItem) => {
    const nextStatus = task.status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE';
    try {
      await apiClient.updateTask(task.id, { status: nextStatus });
      loadTasks();
    } catch {
      // fallback
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteTask(id);
      loadTasks();
    } catch {
      // fallback
    }
  };

  return (
    <View style={styles.container}>
      <StatusHeader isOnline={true} title="JARVIS" />

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadTasks();
            }}
            tintColor={colors.primaryFixed}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* Header Title */}
            <Text style={[typography.headlineLg, styles.pageTitle]}>Future Intentions</Text>
            <Text style={[typography.bodyMd, styles.pageSubtitle]}>
              Contextual triggers awaiting alignment.
            </Text>

            {/* Quick Creation Bar */}
            <GlassCard style={styles.createBox}>
              <Icon name="add" size={18} color={colors.outline} />
              <TextInput
                style={styles.input}
                placeholder="New intention or contextual trigger..."
                placeholderTextColor={colors.outline}
                value={newTitle}
                onChangeText={setNewTitle}
              />
              <TouchableOpacity
                style={[styles.addBtn, !newTitle.trim() && styles.disabledBtn]}
                disabled={!newTitle.trim() || creating}
                onPress={handleCreate}
              >
                {creating ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={[typography.labelCaps, styles.addBtnText]}>ADD</Text>
                )}
              </TouchableOpacity>
            </GlassCard>

            {/* Filter Pills */}
            <View style={styles.filterRow}>
              {(['ACTIVE', 'COMPLETED', 'ALL'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, filter === f && styles.activeChip]}
                  onPress={() => setFilter(f)}
                >
                  <Text
                    style={[
                      typography.labelCaps,
                      styles.filterText,
                      filter === f && styles.activeFilterText,
                    ]}
                  >
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primaryFixed} />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Icon name="calendar_today" size={36} color={colors.outlineVariant} />
              <Text style={[typography.headlineLgMobile, styles.emptyText]}>
                No {filter.toLowerCase()} intentions
              </Text>
              <Text style={[typography.bodyMd, styles.emptySubtext]}>
                Declare a future intention or trigger to monitor environment alignment.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const isCompleted = item.status === 'COMPLETED';
          const isLocation =
            item.type === 'CONDITIONAL_TASK' ||
            Boolean(item.condition?.toLowerCase().includes('location')) ||
            Boolean(item.condition?.toLowerCase().includes('place'));

          const isAligned =
            !isCompleted && (item.status === 'ACTIVE' || (item as any).status === 'TRIGGERED');

          const statusFooterLabel = isCompleted
            ? 'ARCHIVED / COMPLETED'
            : item.schedule
            ? `SCHEDULE: ${item.schedule}`
            : item.nextRunAt
            ? `NEXT: ${new Date(item.nextRunAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
            : item.condition
            ? `TRIGGER: ${item.condition.toUpperCase()}`
            : `ACTIVE ${item.type || 'TASK'}`;

          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveDetailItem(item)}
            >
              <GlassCard
                style={[
                  styles.intentionCard,
                  isAligned ? styles.alignedCardGlow : undefined,
                ]}
              >
                {/* Header Row */}
                <View style={styles.cardTopRow}>
                  {isAligned ? (
                    <View style={styles.alignedBadgeGroup}>
                      <View style={styles.cyanPulseDot} />
                      <Text style={[typography.labelCaps, styles.alignedBadgeText]}>
                        ACTIVE INTENTION
                      </Text>
                    </View>
                  ) : (
                    <Text style={[typography.labelCaps, styles.triggerCategory]}>
                      {isLocation ? 'LOCATION TRIGGER' : 'TEMPORAL TRIGGER'}
                    </Text>
                  )}

                  <TouchableOpacity
                    style={styles.moreBtn}
                    onPress={() => setActiveDetailItem(item)}
                  >
                    <Icon name="more_horiz" size={20} color={colors.outline} />
                  </TouchableOpacity>
                </View>

                {/* Title */}
                <Text
                  style={[
                    typography.headlineLgMobile,
                    styles.cardTitle,
                    isCompleted && styles.completedTitle,
                  ]}
                >
                  {item.title}
                </Text>

                <Text style={[typography.bodyMd, styles.cardDesc]}>
                  {item.description ||
                    (isLocation
                      ? 'Monitors environment coordinates for autonomous activation.'
                      : 'Cognition matrix scheduled intention.')}
                </Text>

                {/* Status Footer matching events.html */}
                <View style={styles.cardFooter}>
                  <Icon
                    name={
                      isCompleted
                        ? 'check'
                        : isLocation
                        ? 'my_location'
                        : 'schedule'
                    }
                    size={14}
                    color={
                      isCompleted
                        ? colors.outline
                        : isAligned
                        ? colors.primaryContainer
                        : colors.outline
                    }
                  />
                  <Text
                    style={[
                      typography.labelCaps,
                      styles.statusFooterText,
                      {
                        color: isCompleted
                          ? colors.outline
                          : isAligned
                          ? colors.primaryContainer
                          : colors.outline,
                      },
                    ]}
                  >
                    {statusFooterLabel}
                  </Text>
                </View>
              </GlassCard>
            </TouchableOpacity>
          );
        }}
      />

      {/* Intention Detail Modal */}
      <EventDetailModal
        visible={Boolean(activeDetailItem)}
        item={activeDetailItem}
        onClose={() => setActiveDetailItem(null)}
        onToggleStatus={handleToggle}
        onDelete={handleDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  headerSection: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  pageTitle: {
    color: colors.onSurface,
    fontSize: 28,
  },
  pageSubtitle: {
    color: colors.onSurfaceVariant,
    marginTop: 4,
    marginBottom: 16,
  },
  createBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: rounded.full,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 16,
    gap: 10,
  },
  input: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    paddingVertical: 4,
  },
  addBtn: {
    backgroundColor: colors.primaryFixed,
    borderRadius: rounded.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disabledBtn: {
    backgroundColor: colors.surfaceContainerHigh,
    opacity: 0.5,
  },
  addBtnText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
  },
  activeChip: {
    backgroundColor: 'rgba(125, 244, 255, 0.12)',
    borderColor: colors.primaryFixed,
  },
  filterText: {
    color: colors.outline,
    fontSize: 10,
  },
  activeFilterText: {
    color: colors.primaryFixed,
  },
  centerBox: {
    paddingTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    paddingTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyText: {
    color: colors.onSurface,
    textAlign: 'center',
  },
  emptySubtext: {
    color: colors.outline,
    textAlign: 'center',
    lineHeight: 20,
  },
  intentionCard: {
    marginBottom: 14,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: rounded.xl,
    padding: 20,
    gap: 8,
  },
  alignedCardGlow: {
    borderColor: 'rgba(0, 240, 255, 0.25)',
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alignedBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cyanPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primaryContainer,
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  alignedBadgeText: {
    color: colors.primaryContainer,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  triggerCategory: {
    color: colors.outline,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  moreBtn: {
    padding: 2,
  },
  cardTitle: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: '500',
    marginTop: 2,
  },
  completedTitle: {
    textDecorationLine: 'line-through',
    color: colors.outline,
  },
  cardDesc: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  statusFooterText: {
    fontSize: 10,
    letterSpacing: 1.5,
  },
});
