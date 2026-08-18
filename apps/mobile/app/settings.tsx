import { HealthStatus, LocationContext, MemoryItem } from '@jarvis/shared';
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
import { mobileLocationService } from '../src/services/locationService';

export default function SettingsScreen(): React.ReactElement {
  const [userName, setUserName] = React.useState<string>('Sushant');
  const [serverUrl, setServerUrl] = React.useState<string>(apiClient.getBaseUrl());
  const [healthStatus, setHealthStatus] = React.useState<HealthStatus | null>(null);
  const [autoSpeak, setAutoSpeak] = React.useState<boolean>(true);
  const [locationEnabled, setLocationEnabled] = React.useState<boolean>(true);
  const [currentLocation, setCurrentLocation] = React.useState<LocationContext | null>(null);
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

  const loadLocation = async (): Promise<void> => {
    try {
      const loc = await apiClient.getCurrentLocation();
      setCurrentLocation(loc);
    } catch {
      // ignore
    }
  };

  React.useEffect(() => {
    checkHealth();
    loadMemories();
    loadLocation();
  }, []);

  const handleSaveConfig = (): void => {
    apiClient.setBaseUrl(serverUrl);
    checkHealth();
    Alert.alert('Settings Saved', 'Jarvis Brain server configuration has been updated.');
  };

  const handleSyncLocation = async (): Promise<void> => {
    try {
      setLoading(true);
      const perm = await mobileLocationService.requestPermission();
      if (perm === 'DENIED') {
        Alert.alert('Permission Denied', 'Please enable location permissions in your phone settings.');
        return;
      }
      const loc = await mobileLocationService.syncCurrentLocation(true);
      if (loc) {
        setCurrentLocation(loc);
        Alert.alert('Location Synced', `Updated to ${loc.city || loc.state || 'current area'}`);
      } else {
        Alert.alert('Notice', 'Unable to retrieve location or permission not granted.');
      }
    } catch {
      Alert.alert('Error', 'Failed to synchronize GPS location.');
    } finally {
      setLoading(false);
    }
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

      {/* Location Awareness Section */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Location Awareness</Text>
          <Switch
            value={locationEnabled}
            onValueChange={setLocationEnabled}
            trackColor={{ false: '#334155', true: '#0284C7' }}
            thumbColor={locationEnabled ? '#38BDF8' : '#94A3B8'}
          />
        </View>
        <Text style={styles.locationSubtext}>
          Enables contextual and location-triggered reminders (e.g. Goa trip parasailing reminder).
        </Text>

        <View style={styles.locationInfoBox}>
          <Text style={styles.locationInfoLabel}>Current Detected Location:</Text>
          <Text style={styles.locationInfoVal}>
            {currentLocation
              ? `${[currentLocation.city, currentLocation.state, currentLocation.country].filter(Boolean).join(', ')}`
              : 'No location synced yet'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.syncLocationBtn, loading && { opacity: 0.6 }]}
          onPress={handleSyncLocation}
          disabled={loading}
        >
          <Text style={styles.syncLocationBtnText}>Sync Current GPS Location</Text>
        </TouchableOpacity>
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38BDF8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  locationSubtext: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 12,
  },
  locationInfoBox: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  locationInfoLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  locationInfoVal: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  syncLocationBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#0284C7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  syncLocationBtnText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 13,
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
