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
import { MemoryItem, MemoryType } from '@jarvis/shared';
import { apiClient } from '../src/services/apiClient';

const MEMORY_TYPES: Array<MemoryType | 'ALL'> = [
  'ALL',
  'PREFERENCE',
  'FACT',
  'PERSON',
  'PROJECT',
  'ROUTINE',
  'GOAL',
];

export default function MemoriesScreen(): React.ReactElement {
  const [memories, setMemories] = React.useState<MemoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [selectedType, setSelectedType] = React.useState<MemoryType | 'ALL'>('ALL');

  const loadMemories = React.useCallback(async () => {
    try {
      const data = await apiClient.getMemories();
      setMemories(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteMemory(id);
      loadMemories();
    } catch {
      // ignore
    }
  };

  const filteredMemories = React.useMemo(() => {
    return memories.filter((m) => {
      const matchesType = selectedType === 'ALL' || m.type === selectedType;
      const matchesSearch =
        !search.trim() || m.content.toLowerCase().includes(search.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [memories, selectedType, search]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Memory Center</Text>
        <Text style={styles.subtitle}>Persistent knowledge, preferences, and personal facts</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search memories..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filter Categories */}
      <View style={styles.filterScroll}>
        {MEMORY_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.filterChip, selectedType === t && styles.activeChip]}
            onPress={() => setSelectedType(t)}
          >
            <Text style={[styles.filterText, selectedType === t && styles.activeFilterText]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : (
        <FlatList
          data={filteredMemories}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMemories(); }} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No memories found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.type}</Text>
                </View>
                <Text style={styles.importanceText}>★ {item.importance}/5</Text>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.delBtn}>
                  <Text style={styles.delText}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.cardContent}>{item.content}</Text>
              <Text style={styles.cardDate}>
                Saved {new Date(item.createdAt).toLocaleDateString()}
              </Text>
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
  searchBox: {
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterScroll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  activeChip: {
    backgroundColor: '#38BDF8',
  },
  filterText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  activeFilterText: {
    color: '#0F172A',
  },
  list: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    backgroundColor: '#0369A1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
  },
  badgeText: {
    color: '#E0F2FE',
    fontSize: 10,
    fontWeight: 'bold',
  },
  importanceText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  delBtn: {
    padding: 4,
  },
  delText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cardContent: {
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 20,
  },
  cardDate: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 8,
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
