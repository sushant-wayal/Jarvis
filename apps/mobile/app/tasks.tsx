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
import { TaskItem, TaskType } from '@jarvis/shared';
import { apiClient } from '../src/services/apiClient';

export default function TasksScreen(): React.ReactElement {
  const [tasks, setTasks] = React.useState<TaskItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [filter, setFilter] = React.useState<'ACTIVE' | 'COMPLETED' | 'ALL'>('ACTIVE');
  const [newTitle, setNewTitle] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const loadTasks = React.useCallback(async () => {
    try {
      const data = await apiClient.getTasks(filter === 'ALL' ? undefined : filter);
      setTasks(data);
    } catch {
      // silent fallback
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
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteTask(id);
      loadTasks();
    } catch {
      // ignore
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks & Reminders</Text>
        <Text style={styles.subtitle}>Scheduled routines, alarms, and action items</Text>
      </View>

      {/* Creation Bar */}
      <View style={styles.createBox}>
        <TextInput
          style={styles.input}
          placeholder="New task or reminder..."
          placeholderTextColor="#64748B"
          value={newTitle}
          onChangeText={setNewTitle}
        />
        <TouchableOpacity
          style={[styles.addBtn, !newTitle.trim() && styles.disabledBtn]}
          disabled={!newTitle.trim() || creating}
          onPress={handleCreate}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.addBtnText}>Add</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['ACTIVE', 'COMPLETED', 'ALL'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.activeChip]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.activeFilterText]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTasks(); }} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No {filter.toLowerCase()} tasks found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.taskCard}>
              <TouchableOpacity style={styles.checkBtn} onPress={() => handleToggle(item)}>
                <Text style={styles.checkIcon}>{item.status === 'COMPLETED' ? '✓' : '○'}</Text>
              </TouchableOpacity>
              <View style={styles.taskInfo}>
                <Text style={[styles.taskTitle, item.status === 'COMPLETED' && styles.completedText]}>
                  {item.title}
                </Text>
                <Text style={styles.taskMeta}>
                  [{item.type}] {item.nextRunAt ? `Due: ${new Date(item.nextRunAt).toLocaleDateString()}` : 'No date set'}
                </Text>
              </View>
              <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(item.id)}>
                <Text style={styles.delText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  createBox: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  addBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledBtn: {
    backgroundColor: '#334155',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  activeChip: {
    backgroundColor: '#38BDF8',
  },
  filterText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  activeFilterText: {
    color: '#0F172A',
  },
  list: {
    paddingBottom: 24,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  checkBtn: {
    padding: 6,
    marginRight: 8,
  },
  checkIcon: {
    color: '#38BDF8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#64748B',
  },
  taskMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  delBtn: {
    padding: 8,
  },
  delText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBox: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
  },
});
