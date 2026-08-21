import { MemoryItem, MemoryType } from '@jarvis/shared';
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
import { GlassCard } from '../src/components/GlassCard';
import { Icon } from '../src/components/Icon';
import { MemoryDetailModal } from '../src/components/MemoryDetailModal';
import { StatusHeader } from '../src/components/StatusHeader';
import { apiClient } from '../src/services/apiClient';
import { colors, rounded, typography } from '../src/theme/tokens';

const MEMORY_CATEGORIES: Array<MemoryType | 'ALL'> = [
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
  const [loading, setLoading] = React.useState<boolean>(true);
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const [search, setSearch] = React.useState<string>('');
  const [selectedType, setSelectedType] = React.useState<MemoryType | 'ALL'>('ALL');
  const [activeDetailMemory, setActiveDetailMemory] = React.useState<MemoryItem | null>(null);

  const loadMemories = React.useCallback(async () => {
    try {
      const data = await apiClient.getMemories();
      setMemories(data);
    } catch {
      // fallback
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
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // fallback
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

  const getAccentColor = (type: string): string => {
    switch (type) {
      case 'PREFERENCE':
        return colors.primaryFixed;
      case 'GOAL':
        return colors.tertiaryFixed;
      case 'PROJECT':
      case 'ROUTINE':
        return colors.secondaryFixed;
      default:
        return colors.primaryFixedDim;
    }
  };

  return (
    <View style={styles.container}>
      <StatusHeader isOnline={true} title="JARVIS" />

      <FlatList
        data={filteredMemories}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadMemories();
            }}
            tintColor={colors.primaryFixed}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* Page Header */}
            <Text style={[typography.headlineLg, styles.pageTitle]}>Memory Bank</Text>
            <Text style={[typography.bodyMd, styles.pageSubtitle]}>
              Organized intelligence and derived context. Reviewing known parameters.
            </Text>

            {/* Search Input Box */}
            <GlassCard style={styles.searchBox}>
              <Icon name="search" size={16} color={colors.outline} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search memory bank..."
                placeholderTextColor={colors.outline}
                value={search}
                onChangeText={setSearch}
              />
            </GlassCard>

            {/* Horizontal Filter Category Pills */}
            <View style={styles.categoryScroll}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={MEMORY_CATEGORIES}
                keyExtractor={(item) => item}
                contentContainerStyle={styles.categoryList}
                renderItem={({ item }) => {
                  const isActive = selectedType === item;
                  return (
                    <TouchableOpacity
                      style={[styles.categoryChip, isActive && styles.activeCategoryChip]}
                      onPress={() => setSelectedType(item)}
                    >
                      <Text
                        style={[
                          typography.labelCaps,
                          styles.categoryText,
                          isActive && styles.activeCategoryText,
                        ]}
                      >
                        {item === 'ALL' ? 'ALL MEMORIES' : item}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
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
              <Icon name="storage" size={36} color={colors.outlineVariant} />
              <Text style={[typography.headlineLgMobile, styles.emptyText]}>
                No memories found
              </Text>
              <Text style={[typography.bodyMd, styles.emptySubtext]}>
                Jarvis automatically distills personal facts and preferences from your conversations.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const accent = getAccentColor(item.type);
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveDetailMemory(item)}
            >
              <GlassCard style={styles.memoryCard}>
                {/* Left accent bar */}
                <View style={[styles.leftAccentBar, { backgroundColor: accent }]} />

                <View style={styles.cardInner}>
                  {/* Card Category Header */}
                  <View style={styles.cardHeader}>
                    <Text style={[typography.labelCaps, { color: accent }]}>{item.type}</Text>
                    <Icon name="more_vert" size={16} color={colors.outline} />
                  </View>

                  {/* Main Content */}
                  <Text style={[typography.bodyXl, styles.cardContent]}>{item.content}</Text>

                  {/* Footer Meta */}
                  <View style={styles.cardFooter}>
                    <View style={styles.sourceGroup}>
                      <Icon name="history" size={13} color={colors.outlineVariant} />
                      <Text style={styles.footerSource}>Source: Live dialogue</Text>
                    </View>
                    <Text style={styles.footerDate}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </TouchableOpacity>
          );
        }}
      />

      {/* Memory Detail Inspection Modal */}
      <MemoryDetailModal
        visible={Boolean(activeDetailMemory)}
        memory={activeDetailMemory}
        onClose={() => setActiveDetailMemory(null)}
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: rounded.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    paddingVertical: 2,
  },
  categoryScroll: {
    marginBottom: 8,
  },
  categoryList: {
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
  },
  activeCategoryChip: {
    backgroundColor: 'rgba(125, 244, 255, 0.12)',
    borderColor: colors.primaryFixed,
  },
  categoryText: {
    color: colors.outline,
    fontSize: 10,
  },
  activeCategoryText: {
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
  memoryCard: {
    marginBottom: 12,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: rounded.lg,
    position: 'relative',
    overflow: 'hidden',
  },
  leftAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cardInner: {
    padding: 18,
    paddingLeft: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardContent: {
    color: colors.onSurface,
    lineHeight: 26,
    fontWeight: '300',
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    paddingTop: 12,
  },
  sourceGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerSource: {
    color: colors.outline,
    fontSize: 11,
  },
  footerDate: {
    color: colors.outlineVariant,
    fontSize: 11,
  },
});
