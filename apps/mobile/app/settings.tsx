import { HealthStatus, MemoryItem } from '@jarvis/shared';
import * as React from 'react';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../src/services/apiClient';

export default function SettingsScreen(): React.ReactElement {
  const [userName, setUserName] = React.useState<string>('Sushant');
  const [serverUrl, setServerUrl] = React.useState<string>(apiClient.getBaseUrl());
  const [healthStatus, setHealthStatus] = React.useState<HealthStatus | null>(null);
  const [autoSpeak, setAutoSpeak] = React.useState<boolean>(true);
  const [memories, setMemories] = React.useState<MemoryItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);

  const checkHealth = async (): Promise<void> => {
    const res = await apiClient.checkHealth();
    setHealthStatus(res);
  };

  const loadMemories = async (): Promise<void> => {
    try {
      const list = await apiClient.getMemories();
      setMemories(list);
    } catch {
      // Offline fallback
    }
  };

  React.useEffect(() => {
    checkHealth();
    loadMemories();
  }, []);

  const handleSaveConfig = (): void => {
    apiClient.setBaseUrl(serverUrl);
    checkHealth();
    Alert.alert('Settings Saved', 'Jarvis Brain server configuration has been updated.');
  };

  const handleDeleteMemory = async (id: string): Promise<void> => {
    try {
      setLoading(true);
      await apiClient.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      Alert.alert('Error', 'Failed to delete memory item.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Jarvis Settings</Text>
      </View>

      {/* User Profile Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>User Profile</Text>
        <Text style={styles.fieldLabel}>Display Name</Text>
        <TextInput
          style={styles.input}
          value={userName}
          onChangeText={setUserName}
          placeholder="Your name"
          placeholderTextColor="#64748B"
        />
      </View>

      {/* Connectivity & Health */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Brain Server</Text>
        <Text style={styles.fieldLabel}>API Endpoint URL</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.1.71:3000/api/v1"
          placeholderTextColor="#64748B"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.healthStatusRow}>
          <Text style={styles.healthLabel}>Status:</Text>
          <Text
            style={[
              styles.healthValue,
              { color: healthStatus?.status === 'operational' ? '#10B981' : '#EF4444' },
            ]}
          >
            {healthStatus ? `● ${healthStatus.status.toUpperCase()}` : '○ Connecting...'}
          </Text>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveConfig}>
          <Text style={styles.saveButtonText}>Save & Test Connection</Text>
        </TouchableOpacity>
      </View>

      {/* Preferences */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Voice Preferences</Text>
        <View style={styles.preferenceRow}>
          <View>
            <Text style={styles.preferenceText}>Auto-play Voice</Text>
            <Text style={styles.preferenceSubtext}>Automatically speak assistant responses</Text>
          </View>
          <Switch
            value={autoSpeak}
            onValueChange={setAutoSpeak}
            trackColor={{ false: '#334155', true: '#0284C7' }}
            thumbColor={autoSpeak ? '#38BDF8' : '#94A3B8'}
          />
        </View>
      </View>

      {/* Long-Term Memory Manager */}
      <View style={styles.card}>
        <View style={styles.memoryHeaderRow}>
          <Text style={styles.cardTitle}>Long-Term Memories ({memories.length})</Text>
          <TouchableOpacity onPress={loadMemories}>
            <Text style={styles.refreshLink}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {memories.length === 0 ? (
          <Text style={styles.emptyMemoryText}>No long-term memories extracted yet.</Text>
        ) : (
          <FlatList
            data={memories}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.memoryItem}>
                <View style={styles.memoryContentCol}>
                  <Text style={styles.memoryContent}>{item.content}</Text>
                  <Text style={styles.memoryMeta}>
                    {item.type} • Importance: {item.importance}/10
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteMemory(item.id)}
                  disabled={loading}
                >
                  <Text style={styles.deleteButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0D14',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#0F172A',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38BDF8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 14,
    marginBottom: 12,
  },
  healthStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  healthLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginRight: 6,
  },
  healthValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preferenceText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  preferenceSubtext: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  memoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refreshLink: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyMemoryText: {
    color: '#475569',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 6,
  },
  memoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  memoryContentCol: {
    flex: 1,
    marginRight: 10,
  },
  memoryContent: {
    color: '#F8FAFC',
    fontSize: 13,
  },
  memoryMeta: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  deleteButton: {
    padding: 6,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
