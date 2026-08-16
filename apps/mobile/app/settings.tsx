import { HealthStatus, MemoryItem } from '@jarvis/shared';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../src/services/apiClient';

export default function SettingsScreen() {
  const [userName, setUserName] = useState('Sushant');
  const [serverUrl, setServerUrl] = useState(apiClient.getBaseUrl());
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkHealth();
    loadMemories();
  }, []);

  const checkHealth = async () => {
    const res = await apiClient.checkHealth();
    setHealthStatus(res);
  };

  const loadMemories = async () => {
    try {
      const list = await apiClient.getMemories();
      setMemories(list);
    } catch {
      // offline
    }
  };

  const handleUpdateUrl = () => {
    apiClient.setBaseUrl(serverUrl);
    checkHealth();
    Alert.alert('Updated', 'Jarvis Backend Server URL updated successfully.');
  };

  const handleDeleteMemory = async (id: string) => {
    await apiClient.deleteMemory(id);
    await loadMemories();
  };

  const handleClearAllMemories = async () => {
    await apiClient.deleteMemory('');
    await loadMemories();
    Alert.alert('Cleared', 'All stored long-term memories cleared.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.screenTitle}>Settings & Profile</Text>

        {/* Profile Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👤 Profile</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={userName} onChangeText={setUserName} placeholder="Your Name" placeholderTextColor="#64748B" />
          <Text style={styles.label}>Preferred Response Style</Text>
          <View style={styles.chipRow}>
            <View style={[styles.chip, styles.activeChip]}>
              <Text style={styles.activeChipText}>Concise (Earbud Default)</Text>
            </View>
          </View>
        </View>

        {/* Connectivity Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🌐 Backend Connectivity</Text>
          <Text style={styles.label}>Server Base URL</Text>
          <View style={styles.urlRow}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} value={serverUrl} onChangeText={setServerUrl} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateUrl}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.healthStatusBox}>
            <Text style={styles.healthTitle}>
              Status: {healthStatus ? (healthStatus.status === 'operational' ? '🟢 Operational' : '🟡 Degraded') : '🔴 Offline / Unreachable'}
            </Text>
            {healthStatus && (
              <View style={styles.healthDetails}>
                <Text style={styles.healthItem}>Database: {healthStatus.services.database ? '✅' : '❌'}</Text>
                <Text style={styles.healthItem}>Gemini AI: {healthStatus.services.aiProvider ? '✅' : '❌'}</Text>
                <Text style={styles.healthItem}>Speech-to-Text: {healthStatus.services.sttProvider ? '✅' : '❌'}</Text>
                <Text style={styles.healthItem}>Text-to-Speech: {healthStatus.services.ttsProvider ? '✅' : '❌'}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Voice & Assistant Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔊 Voice & Audio</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Auto-Speak Responses</Text>
            <Switch value={autoSpeak} onValueChange={setAutoSpeak} trackColor={{ false: '#334155', true: '#0284C7' }} thumbColor="#F8FAFC" />
          </View>
          <Text style={styles.subText}>Audio will play automatically over connected Bluetooth earbuds or speaker.</Text>
        </View>

        {/* Long-term Memories Card */}
        <View style={styles.card}>
          <View style={styles.memoryHeader}>
            <Text style={styles.cardTitle}>🧠 Long-Term Memories ({memories.length})</Text>
            {memories.length > 0 && (
              <TouchableOpacity onPress={handleClearAllMemories}>
                <Text style={styles.clearText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>
          {memories.length === 0 ? (
            <Text style={styles.subText}>No long-term memories extracted yet. Speak to Jarvis and state preferences!</Text>
          ) : (
            memories.map((m) => (
              <View key={m.id} style={styles.memoryItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memoryType}>[{m.type}]</Text>
                  <Text style={styles.memoryContent}>{m.content}</Text>
                </View>
                <TouchableOpacity style={styles.delMemBtn} onPress={() => handleDeleteMemory(m.id)}>
                  <Text style={styles.delMemText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <Text style={styles.footerText}>Jarvis Mobile V1.0.0 • Monorepo Build</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0D14',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  screenTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  label: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  chip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  activeChip: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  activeChipText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  healthStatusBox: {
    marginTop: 12,
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
  },
  healthTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  healthDetails: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  healthItem: {
    color: '#94A3B8',
    fontSize: 11,
    marginRight: 12,
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  subText: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 6,
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  memoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  memoryType: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  memoryContent: {
    color: '#F8FAFC',
    fontSize: 13,
    marginTop: 2,
  },
  delMemBtn: {
    padding: 6,
  },
  delMemText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  footerText: {
    color: '#475569',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
});
