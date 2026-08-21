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
import { GlassCard } from '../src/components/GlassCard';
import { Icon } from '../src/components/Icon';
import { StatusHeader } from '../src/components/StatusHeader';
import { apiClient } from '../src/services/apiClient';
import { mobileLocationService } from '../src/services/locationService';
import { colors, rounded, typography } from '../src/theme/tokens';

export default function SettingsScreen(): React.ReactElement {
  const [userName, setUserName] = React.useState<string>('Sushant');
  const [responseProtocol, setResponseProtocol] = React.useState<string>('Concise');
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
      const nameMem = list.find(
        (m) =>
          m.content.toLowerCase().includes('name is') ||
          m.content.toLowerCase().includes('call me') ||
          m.type === 'PERSON'
      );
      if (nameMem) {
        const match = nameMem.content.match(/(?:name is|call me)\s+([A-Za-z]+)/i);
        if (match && match[1]) {
          setUserName(match[1]);
        }
      }
    } catch {
      // fallback
    }
  };

  const loadLocation = async (): Promise<void> => {
    try {
      const loc = await apiClient.getCurrentLocation();
      setCurrentLocation(loc);
    } catch {
      // fallback
    }
  };

  React.useEffect(() => {
    checkHealth();
    loadMemories();
    loadLocation();
  }, []);

  const handleSaveConfig = async (): Promise<void> => {
    apiClient.setBaseUrl(serverUrl);
    checkHealth();
    if (userName.trim()) {
      try {
        await apiClient.createMemory({
          type: 'PERSON',
          content: `User's name is ${userName.trim()}`,
          importance: 5,
        });
        loadMemories();
      } catch {
        // ignore
      }
    }
    Alert.alert('Configuration Saved', 'Brain server endpoint and identity parameters updated.');
  };

  const handleSyncLocation = async (): Promise<void> => {
    try {
      setLoading(true);
      const perm = await mobileLocationService.requestPermission();
      if (perm === 'DENIED') {
        Alert.alert('Permission Denied', 'Please enable location permissions in system settings.');
        return;
      }
      const loc = await mobileLocationService.syncCurrentLocation(true);
      if (loc) {
        setCurrentLocation(loc);
        Alert.alert('Location Synchronized', `Connected to ${loc.city || loc.state || 'current area'}`);
      } else {
        Alert.alert('Notice', 'Unable to retrieve GPS coordinates.');
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
    <View style={styles.container}>
      <StatusHeader isOnline={true} title="JARVIS" />

      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {/* Header matching settings and profile.html */}
        <View style={styles.headerSection}>
          <Text style={[typography.headlineLg, styles.pageTitle]}>Configuration</Text>
          <Text style={[typography.bodyMd, styles.pageSubtitle]}>
            Personalize your interaction matrix.
          </Text>
        </View>

        {/* Identity Parameters Bento Card */}
        <GlassCard style={styles.bentoCard}>
          <View style={styles.cardHeaderRow}>
            <Icon name="person" size={18} color={colors.primaryContainer} />
            <Text style={[typography.labelCaps, styles.cardCategory]}>IDENTITY PARAMETERS</Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[typography.labelCaps, styles.fieldLabel]}>DESIGNATION</Text>
            <TextInput
              style={styles.textInput}
              value={userName}
              onChangeText={setUserName}
              placeholder="Your designation"
              placeholderTextColor={colors.outline}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[typography.labelCaps, styles.fieldLabel]}>RESPONSE PROTOCOL</Text>
            <View style={styles.protocolRow}>
              {['Concise', 'Detailed Analysis', 'Conversational'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.protocolChip, responseProtocol === p && styles.activeProtocolChip]}
                  onPress={() => setResponseProtocol(p)}
                >
                  <Text
                    style={[
                      typography.labelCaps,
                      styles.protocolText,
                      responseProtocol === p && styles.activeProtocolText,
                    ]}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Voice Signature Box matching settings and profile.html */}
          <View style={styles.voiceSignatureBox}>
            <View style={styles.miniOrb}>
              <Icon name="record_voice_over" size={22} color={colors.primaryContainer} />
            </View>
            <View>
              <Text style={[typography.bodyMd, styles.voiceSignatureTitle]}>
                Voice Signature Active
              </Text>
              <Text style={[typography.bodySm, styles.voiceSignatureSub]}>
                Primary speaker verified
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* Intelligence Link Bento Card */}
        <GlassCard style={styles.bentoCard}>
          <View style={styles.cardHeaderRow}>
            <Icon name="hub" size={18} color={colors.primaryContainer} />
            <Text style={[typography.labelCaps, styles.cardCategory]}>INTELLIGENCE LINK</Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[typography.labelCaps, styles.fieldLabel]}>BRAIN SERVER ENDPOINT</Text>
            <TextInput
              style={styles.textInput}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://192.168.1.88:3000/api/v1"
              placeholderTextColor={colors.outline}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.statusRow}>
            <Text style={[typography.labelCaps, styles.fieldLabel]}>CORE STATUS:</Text>
            <Text
              style={[
                styles.statusValue,
                {
                  color:
                    healthStatus?.status === 'operational'
                      ? colors.primaryFixed
                      : colors.error,
                },
              ]}
            >
              {healthStatus ? `● ${healthStatus.status.toUpperCase()}` : '○ Connecting...'}
            </Text>
          </View>

          <TouchableOpacity style={styles.actionBtn} onPress={handleSaveConfig}>
            <Text style={[typography.labelCaps, styles.actionBtnText]}>
              TEST & SAVE CONNECTION
            </Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Location Awareness Bento Card */}
        <GlassCard style={styles.bentoCard}>
          <View style={styles.cardHeaderRow}>
            <Icon name="location_on" size={18} color={colors.primaryContainer} />
            <Text style={[typography.labelCaps, styles.cardCategory]}>LOCATION AWARENESS</Text>
            <View style={styles.switchRight}>
              <Switch
                value={locationEnabled}
                onValueChange={setLocationEnabled}
                trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryContainer }}
                thumbColor={locationEnabled ? colors.primaryFixed : colors.outline}
              />
            </View>
          </View>

          <Text style={[typography.bodyMd, styles.locationDesc]}>
            Enables contextual geofenced triggers (e.g. Goa trip reminders).
          </Text>

          <View style={styles.locationDisplayBox}>
            <Text style={[typography.labelCaps, styles.locLabel]}>CURRENT DETECTED REGION</Text>
            <Text style={[typography.bodyMd, styles.locValue]}>
              {currentLocation
                ? [currentLocation.city, currentLocation.state, currentLocation.country]
                    .filter(Boolean)
                    .join(', ')
                : 'No GPS position synced yet'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.actionBtnSecondary, loading && { opacity: 0.6 }]}
            onPress={handleSyncLocation}
            disabled={loading}
          >
            <Text style={[typography.labelCaps, styles.actionBtnSecondaryText]}>
              SYNC GPS COORDINATES
            </Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Audio Protocols */}
        <GlassCard style={styles.bentoCard}>
          <View style={styles.cardHeaderRow}>
            <Icon name="graphic_eq" size={18} color={colors.primaryContainer} />
            <Text style={[typography.labelCaps, styles.cardCategory]}>AUDIO PROTOCOLS</Text>
            <View style={styles.switchRight}>
              <Switch
                value={autoSpeak}
                onValueChange={setAutoSpeak}
                trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryContainer }}
                thumbColor={autoSpeak ? colors.primaryFixed : colors.outline}
              />
            </View>
          </View>
          <Text style={[typography.bodyMd, styles.locationDesc]}>
            Synthesize and speak responses automatically on dialogue completion.
          </Text>
        </GlassCard>

        {/* Memory Registry */}
        <GlassCard style={styles.bentoCard}>
          <View style={styles.cardHeaderRow}>
            <Icon name="memory" size={18} color={colors.primaryContainer} />
            <Text style={[typography.labelCaps, styles.cardCategory]}>
              MEMORY REGISTRY ({memories.length})
            </Text>
          </View>

          {memories.length === 0 ? (
            <Text style={styles.emptyMemoryText}>No long-term memories registered.</Text>
          ) : (
            <FlatList
              data={memories.slice(0, 5)}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.memoryRow}>
                  <View style={styles.memoryInfo}>
                    <Text style={[typography.bodyMd, styles.memoryText]} numberOfLines={2}>
                      {item.content}
                    </Text>
                    <Text style={styles.memorySub}>
                      {item.type} · Importance {item.importance}/5
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteMemory(item.id)}
                    style={styles.delMemoryBtn}
                  >
                    <Icon name="delete" size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
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
  },
  bentoCard: {
    padding: 20,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: rounded.xl,
    marginBottom: 16,
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  cardCategory: {
    color: colors.primaryContainer,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  switchRight: {
    position: 'absolute',
    right: 0,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.outline,
    fontSize: 9,
    letterSpacing: 1,
  },
  textInput: {
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: rounded.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.onSurface,
    fontSize: 14,
  },
  protocolRow: {
    flexDirection: 'row',
    gap: 8,
  },
  protocolChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    alignItems: 'center',
  },
  activeProtocolChip: {
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderColor: colors.primaryFixed,
  },
  protocolText: {
    color: colors.outline,
    fontSize: 9,
  },
  activeProtocolText: {
    color: colors.primaryFixed,
  },
  voiceSignatureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 240, 255, 0.04)',
    borderColor: 'rgba(0, 240, 255, 0.15)',
    borderWidth: 1,
    borderRadius: rounded.lg,
    padding: 14,
    gap: 14,
    marginTop: 4,
  },
  miniOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 240, 255, 0.12)',
    borderColor: 'rgba(0, 240, 255, 0.25)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceSignatureTitle: {
    color: colors.primaryFixed,
    fontWeight: '600',
    fontSize: 14,
  },
  voiceSignatureSub: {
    color: colors.outline,
    fontSize: 11,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  actionBtn: {
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderColor: 'rgba(0, 240, 255, 0.3)',
    borderWidth: 1,
    borderRadius: rounded.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  actionBtnText: {
    color: colors.primaryFixed,
    fontSize: 10,
    letterSpacing: 2,
  },
  locationDesc: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 18,
  },
  locationDisplayBox: {
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderRadius: rounded.md,
    padding: 14,
    gap: 4,
  },
  locLabel: {
    color: colors.outline,
    fontSize: 9,
    letterSpacing: 1,
  },
  locValue: {
    color: colors.onSurface,
    fontWeight: '500',
  },
  actionBtnSecondary: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: rounded.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnSecondaryText: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    letterSpacing: 2,
  },
  emptyMemoryText: {
    color: colors.outline,
    fontStyle: 'italic',
    fontSize: 12,
    marginVertical: 6,
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    gap: 12,
  },
  memoryInfo: {
    flex: 1,
    gap: 2,
  },
  memoryText: {
    color: colors.onSurface,
    fontSize: 13,
    lineHeight: 18,
  },
  memorySub: {
    color: colors.outline,
    fontSize: 10,
  },
  delMemoryBtn: {
    padding: 6,
  },
});
