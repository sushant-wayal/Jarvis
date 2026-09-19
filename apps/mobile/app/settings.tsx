import { HealthStatus, KnownPlaceItem, LocationContext, MemoryItem } from '@jarvis/shared';
import { router } from 'expo-router';
import * as React from 'react';
import {
  Alert,
  FlatList,
  Linking,
  RefreshControl,
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
import { useEarbudManager } from '../src/hooks/useEarbudManager';
import { useIntegrationBridge } from '../src/hooks/useIntegrationBridge';
import { contactsIntegration } from '../src/integrations/ContactsIntegration';
import { notificationContextStore, NotificationStoreSettings } from '../src/integrations/NotificationContextStore';
import { notificationIntegration } from '../src/integrations/NotificationIntegration';
import { OBSERVABLE_APPS } from '../src/integrations/constants';
import { adaptiveLocationEngine, AdaptiveEngineMetrics } from '../src/services/adaptiveLocationEngine';
import { apiClient } from '../src/services/apiClient';
import { appSettingsService, ResponseProtocol } from '../src/services/appSettingsService';
import { mobileLocationService } from '../src/services/locationService';
import { colors, rounded, typography } from '../src/theme/tokens';

export default function SettingsScreen(): React.ReactElement {
  const {
    settings: earbudSettings,
    updateSettings: updateEarbudSettings,
    status: earbudStatus,
    triggerSimulatedTap,
  } = useEarbudManager();

  const initialSettings = appSettingsService.getSettings();
  const [userName, setUserName] = React.useState<string>(initialSettings.userName);
  const [responseProtocol, setResponseProtocol] = React.useState<ResponseProtocol>(initialSettings.responseProtocol);
  const [serverUrl, setServerUrl] = React.useState<string>(initialSettings.serverUrl);
  const [healthStatus, setHealthStatus] = React.useState<HealthStatus | null>(null);
  const [autoSpeak, setAutoSpeak] = React.useState<boolean>(initialSettings.autoSpeak);
  const [speakIntermediateStatus, setSpeakIntermediateStatus] = React.useState<boolean>(
    initialSettings.speakIntermediateStatus ?? true
  );
  const [locationEnabled, setLocationEnabled] = React.useState<boolean>(initialSettings.locationEnabled);
  const [currentLocation, setCurrentLocation] = React.useState<LocationContext | null>(null);
  const [knownPlaces, setKnownPlaces] = React.useState<KnownPlaceItem[]>([]);
  const [adaptiveMetrics, setAdaptiveMetrics] = React.useState<AdaptiveEngineMetrics>(
    adaptiveLocationEngine.getMetrics()
  );
  const [memories, setMemories] = React.useState<MemoryItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [refreshing, setRefreshing] = React.useState<boolean>(false);

  // Phone & Integration state
  const {
    capabilities,
    requestContactsPermission,
    requestNotificationPermission,
    refreshCapabilities,
  } = useIntegrationBridge();
  const [notifSettings, setNotifSettings] = React.useState<NotificationStoreSettings>(notificationContextStore.getSettings());
  const [aliases, setAliases] = React.useState<Record<string, string>>(contactsIntegration.getAliases());
  const [newAliasKey, setNewAliasKey] = React.useState<string>('');
  const [newAliasValue, setNewAliasValue] = React.useState<string>('');

  const checkHealth = async (): Promise<void> => {
    const res = await apiClient.checkHealth();
    setHealthStatus(res);
  };

  const loadMemories = async (): Promise<void> => {
    try {
      const [list, profile] = await Promise.all([
        apiClient.getMemories(),
        apiClient.getUserProfile(),
      ]);
      setMemories(list);
      if (profile?.name) {
        setUserName(profile.name);
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

  const loadKnownPlaces = async (): Promise<void> => {
    try {
      const places = await apiClient.getKnownPlaces();
      setKnownPlaces(places);
    } catch {
      // fallback
    }
  };

  React.useEffect(() => {
    checkHealth();
    loadMemories();
    loadLocation();
    loadKnownPlaces();

    const loadLocalStores = async () => {
      const appSettings = await appSettingsService.initialize();
      setUserName(appSettings.userName);
      setResponseProtocol(appSettings.responseProtocol);
      setServerUrl(appSettings.serverUrl);
      setAutoSpeak(appSettings.autoSpeak);
      setSpeakIntermediateStatus(appSettings.speakIntermediateStatus ?? true);
      setLocationEnabled(appSettings.locationEnabled);

      await Promise.all([
        notificationContextStore.initialize(),
        contactsIntegration.initialize(),
      ]);
      setNotifSettings(notificationContextStore.getSettings());
      setAliases(contactsIntegration.getAliases());
    };
    loadLocalStores();

    const unsubAdaptive = adaptiveLocationEngine.subscribe((metrics) => {
      setAdaptiveMetrics(metrics);
    });
    return () => unsubAdaptive();
  }, []);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      const [appSettings] = await Promise.all([
        appSettingsService.initialize(),
        checkHealth(),
        loadMemories(),
        loadLocation(),
        loadKnownPlaces(),
        adaptiveLocationEngine.triggerNow(),
        notificationContextStore.initialize().then(() => setNotifSettings(notificationContextStore.getSettings())),
        contactsIntegration.initialize().then(() => setAliases(contactsIntegration.getAliases())),
        refreshCapabilities(),
        notificationIntegration.syncActiveNotifications(),
      ]);
      setUserName(appSettings.userName);
      setResponseProtocol(appSettings.responseProtocol);
      setServerUrl(appSettings.serverUrl);
      setAutoSpeak(appSettings.autoSpeak);
      setLocationEnabled(appSettings.locationEnabled);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSelectProtocol = async (proto: ResponseProtocol): Promise<void> => {
    setResponseProtocol(proto);
    await appSettingsService.updateSettings({ responseProtocol: proto });
    try {
      await apiClient.createMemory({
        type: 'PREFERENCE',
        content: `User prefers ${proto} response protocol style.`,
        importance: 4,
      });
    } catch {
      // Safe fallback
    }
  };

  const handleToggleAutoSpeak = async (val: boolean): Promise<void> => {
    setAutoSpeak(val);
    await appSettingsService.updateSettings({ autoSpeak: val });
  };

  const handleToggleLocation = async (val: boolean): Promise<void> => {
    setLocationEnabled(val);
    await appSettingsService.updateSettings({ locationEnabled: val });
    if (!val) {
      adaptiveLocationEngine.stop();
    } else {
      adaptiveLocationEngine.start();
    }
  };

  const handleChangeUserName = (text: string): void => {
    setUserName(text);
  };

  const handleBlurUserName = async (): Promise<void> => {
    if (userName.trim()) {
      await appSettingsService.updateSettings({ userName: userName.trim() });
    }
  };

  const handleToggleAppNotif = async (appId: string, enabled: boolean): Promise<void> => {
    const updated = {
      ...notifSettings.enabledApps,
      [appId]: enabled,
    };
    setNotifSettings((prev) => ({
      ...prev,
      enabledApps: updated,
    }));
    await notificationContextStore.updateSettings({ enabledApps: updated });
    setNotifSettings(notificationContextStore.getSettings());
  };

  const handleToggleStoreContent = async (val: boolean): Promise<void> => {
    await notificationContextStore.updateSettings({ storeContent: val });
    setNotifSettings(notificationContextStore.getSettings());
  };

  const handleAddAlias = async (): Promise<void> => {
    if (!newAliasKey.trim() || !newAliasValue.trim()) return;
    await contactsIntegration.saveAlias(newAliasKey.trim(), newAliasValue.trim());
    setAliases(contactsIntegration.getAliases());
    setNewAliasKey('');
    setNewAliasValue('');
    Alert.alert('Alias Saved', `"${newAliasKey.trim()}" is now linked to "${newAliasValue.trim()}".`);
  };

  const handleRemoveAlias = async (key: string): Promise<void> => {
    await contactsIntegration.removeAlias(key);
    setAliases(contactsIntegration.getAliases());
  };

  const handleSaveConfig = async (): Promise<void> => {
    const trimmedUrl = serverUrl.trim();
    const trimmedName = userName.trim();
    await appSettingsService.updateSettings({ serverUrl: trimmedUrl, userName: trimmedName });
    apiClient.setBaseUrl(trimmedUrl);
    checkHealth();
    if (trimmedName) {
      try {
        await apiClient.createMemory({
          type: 'PERSON',
          content: `User's name is ${trimmedName}`,
          importance: 5,
        });
        loadMemories();
      } catch {
        // ignore
      }
    }
    Alert.alert('Configuration Saved', 'Brain server endpoint and identity parameters updated and saved.');
  };

  const handleSyncLocation = async (): Promise<void> => {
    try {
      setLoading(true);
      const result = await mobileLocationService.syncCurrentLocation(true);
      if (result.success) {
        setCurrentLocation(result.context);
        await loadKnownPlaces();
        Alert.alert(
          'Location Synchronized',
          `Connected to ${result.context.city || result.context.state || 'current area'}${
            result.context.knownPlace ? ` (${result.context.knownPlace.name})` : ''
          }`
        );
      } else if (result.error === 'SERVICES_DISABLED') {
        Alert.alert(
          'Location Services Disabled',
          'Device GPS is turned off. Please turn on Location in system settings to sync your coordinates.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
          ]
        );
      } else if (result.error === 'PERMISSION_DENIED') {
        Alert.alert(
          'Permission Denied',
          'Please enable location permissions in system settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
          ]
        );
      } else {
        Alert.alert('Notice', result.message || 'Unable to retrieve GPS coordinates.');
      }
    } catch {
      Alert.alert('Error', 'Failed to synchronize GPS location.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKnownPlace = async (id: string, name: string): Promise<void> => {
    Alert.alert(
      'Delete Saved Place',
      `Are you sure you want to remove "${name}" from your saved locations?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await apiClient.deleteKnownPlace(id);
              setKnownPlaces((prev) => prev.filter((p) => p.id !== id));
              await loadLocation();
            } catch {
              Alert.alert('Error', 'Failed to delete place.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
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

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primaryFixed}
            colors={[colors.primaryFixed]}
          />
        }
      >
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
              onChangeText={handleChangeUserName}
              onBlur={handleBlurUserName}
              placeholder="Your designation"
              placeholderTextColor={colors.outline}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[typography.labelCaps, styles.fieldLabel]}>RESPONSE PROTOCOL</Text>
            <View style={styles.protocolRow}>
              {[
                { id: 'Concise', label: 'Concise' },
                { id: 'Detailed Analysis', label: 'Detailed' },
                { id: 'Conversational', label: 'Dialogue' },
              ].map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.protocolChip,
                    responseProtocol === p.id && styles.activeProtocolChip,
                  ]}
                  onPress={() => handleSelectProtocol(p.id as ResponseProtocol)}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={[
                      styles.protocolText,
                      responseProtocol === p.id && styles.activeProtocolText,
                    ]}
                  >
                    {p.label}
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

          {/* Spoken Status Updates Toggle */}
          <View style={styles.toggleSettingRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[typography.bodyMd, styles.toggleTitle]}>
                Spoken Status Updates
              </Text>
              <Text style={[typography.bodySm, styles.toggleSubtitle]}>
                Jarvis speaks his work and thinking aloud in between before the final response
              </Text>
            </View>
            <Switch
              value={speakIntermediateStatus}
              onValueChange={async (val) => {
                setSpeakIntermediateStatus(val);
                await appSettingsService.updateSettings({ speakIntermediateStatus: val });
              }}
              trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryContainer }}
              thumbColor={speakIntermediateStatus ? colors.primaryFixed : colors.outline}
            />
          </View>
        </GlassCard>

        {/* Connected Integrations Bento Card */}
        <GlassCard style={styles.bentoCard}>
          <View style={styles.cardHeaderRow}>
            <Icon name="extension" size={18} color={colors.primaryContainer} />
            <Text style={[typography.labelCaps, styles.cardCategory]}>CONNECTED INTEGRATIONS</Text>
          </View>

          <Text style={[typography.bodyMd, styles.locationDesc]}>
            Manage external tools, services, and accounts (Gmail, GitHub, YouTube, Financial Advisor) for Jarvis to execute tasks.
          </Text>

          <View style={styles.integrationsPreviewRow}>
            <View style={styles.integrationBadge}>
              <Icon name="mail" size={14} color="#EF4444" />
              <Text style={styles.integrationBadgeText}>Gmail</Text>
            </View>
            <View style={styles.integrationBadge}>
              <Icon name="code" size={14} color="#8B5CF6" />
              <Text style={styles.integrationBadgeText}>GitHub</Text>
            </View>
            <View style={styles.integrationBadge}>
              <Icon name="smart_display" size={14} color="#EC4899" />
              <Text style={styles.integrationBadgeText}>Serenity</Text>
            </View>
            <View style={styles.integrationBadge}>
              <Icon name="account_balance" size={14} color="#10B981" />
              <Text style={styles.integrationBadgeText}>North</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.manageIntegrationsBtn}
            onPress={() => router.push('/integrations')}
          >
            <Text style={styles.manageIntegrationsBtnText}>Manage Integrations & Permissions</Text>
            <Icon name="arrow_forward" size={16} color="#0A0D14" />
          </TouchableOpacity>
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
            <Text style={styles.actionBtnText}>
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
                onValueChange={handleToggleLocation}
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
            {currentLocation?.latitude && currentLocation?.longitude ? (
              <Text style={styles.locCoordsSub}>
                Coordinates: {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
                {currentLocation.knownPlace ? ` • Place: ${currentLocation.knownPlace.name}` : ''}
              </Text>
            ) : null}
          </View>

          {/* Saved Semantic Places / Geofences */}
          <View style={styles.savedPlacesContainer}>
            <View style={styles.savedPlacesHeader}>
              <Icon name="bookmark" size={14} color={colors.primaryFixed} />
              <Text style={[typography.labelCaps, styles.savedPlacesTitle]}>SAVED PLACES & GEOFENCES</Text>
            </View>

            {knownPlaces.length > 0 ? (
              knownPlaces.map((place) => (
                <View key={place.id} style={styles.placeRow}>
                  <View style={styles.placeInfo}>
                    <Text style={[typography.bodyMd, styles.placeName]}>{place.name}</Text>
                    <Text style={styles.placeCoords}>
                      {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)} • {place.radiusMeters}m radius
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.delPlaceBtn}
                    onPress={() => handleDeleteKnownPlace(place.id, place.name)}
                  >
                    <Icon name="delete" size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={styles.emptyPlacesText}>
                No saved places yet. Say "Jarvis, save my current location as PG" to pin a place.
              </Text>
            )}
          </View>

          {/* Adaptive Cadence & Battery Optimization Box */}
          <View style={styles.adaptiveBox}>
            <View style={styles.adaptiveHeader}>
              <View style={styles.adaptiveHeaderLeft}>
                <View
                  style={[
                    styles.stateDot,
                    adaptiveMetrics.movementState === 'IN_TRANSIT' && { backgroundColor: colors.primaryFixed },
                    adaptiveMetrics.movementState === 'PROXIMITY_ALERT' && { backgroundColor: colors.tertiaryFixed },
                    adaptiveMetrics.movementState === 'STATIONARY' && { backgroundColor: colors.outline },
                  ]}
                />
                <Text style={[typography.labelCaps, styles.adaptiveTitle]}>
                  ADAPTIVE CADENCE: {adaptiveMetrics.currentIntervalMinutes}m
                </Text>
              </View>
              <Text
                style={[
                  styles.adaptiveStateBadge,
                  adaptiveMetrics.movementState === 'IN_TRANSIT' && { color: colors.primaryFixed },
                  adaptiveMetrics.movementState === 'PROXIMITY_ALERT' && { color: colors.tertiaryFixed },
                  adaptiveMetrics.movementState === 'STATIONARY' && { color: colors.outline },
                ]}
              >
                {adaptiveMetrics.movementState === 'PROXIMITY_ALERT'
                  ? 'PROXIMITY'
                  : adaptiveMetrics.movementState === 'IN_TRANSIT'
                  ? 'MOVING'
                  : 'STATIONARY'}
              </Text>
            </View>

            <View style={styles.adaptiveMetricsRow}>
              <View style={styles.metricCol}>
                <Text style={styles.metricLabel}>DISPLACEMENT</Text>
                <Text style={styles.metricVal}>{adaptiveMetrics.lastDisplacementMeters}m</Text>
              </View>
              <View style={styles.metricCol}>
                <Text style={styles.metricLabel}>SPEED</Text>
                <Text style={styles.metricVal}>{adaptiveMetrics.estimatedSpeedMps} m/s</Text>
              </View>
              <View style={styles.metricCol}>
                <Text style={styles.metricLabel}>STATIONARY</Text>
                <Text style={styles.metricVal}>{adaptiveMetrics.stationaryStreak} checks</Text>
              </View>
            </View>

            {adaptiveMetrics.proximityDestination ? (
              <View style={styles.proximityBox}>
                <Icon name="bolt" size={12} color={colors.tertiaryFixed} />
                <Text style={styles.proximityText}>
                  Clamped to 3m: Near {adaptiveMetrics.proximityDestination}
                </Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.actionBtnSecondary, loading && { opacity: 0.6 }]}
            onPress={handleSyncLocation}
            disabled={loading}
          >
            <Text style={styles.actionBtnSecondaryText}>
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
                onValueChange={handleToggleAutoSpeak}
                trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryContainer }}
                thumbColor={autoSpeak ? colors.primaryFixed : colors.outline}
              />
            </View>
          </View>
          <Text style={[typography.bodyMd, styles.locationDesc]}>
            Synthesize and speak responses automatically on dialogue completion.
          </Text>
        </GlassCard>

        {/* Earbud & Headset Neural Interface */}
        <GlassCard style={styles.bentoCard}>
          <View style={styles.cardHeaderRow}>
            <Icon name="hearing" size={18} color={colors.primaryContainer} />
            <Text style={[typography.labelCaps, styles.cardCategory]}>
              EARBUD & HEADSET PROTOCOL
            </Text>
            <View style={styles.switchRight}>
              <Switch
                value={earbudSettings.enabled}
                onValueChange={(val) => updateEarbudSettings({ enabled: val })}
                trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryContainer }}
                thumbColor={earbudSettings.enabled ? colors.primaryFixed : colors.outline}
              />
            </View>
          </View>

          <Text style={[typography.bodyMd, styles.locationDesc]}>
            Single-tap on any Bluetooth or wired earbud/headphone media button activates Jarvis and starts listening immediately, even when the screen is off or app is running in background.
          </Text>

          <View style={styles.earbudSettingRow}>
            <View style={styles.settingTextCol}>
              <Text style={[typography.bodyMd, styles.settingLabel]}>Audio Feedback Chimes</Text>
              <Text style={[typography.bodySm, styles.settingSub]}>
                Play subtle futuristic earbud wake/process sound cues
              </Text>
            </View>
            <Switch
              value={earbudSettings.playFeedbackChimes}
              onValueChange={(val) => updateEarbudSettings({ playFeedbackChimes: val })}
              trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryContainer }}
              thumbColor={earbudSettings.playFeedbackChimes ? colors.primaryFixed : colors.outline}
            />
          </View>

          <View style={styles.earbudSettingRow}>
            <View style={styles.settingTextCol}>
              <Text style={[typography.bodyMd, styles.settingLabel]}>Background Standby Link</Text>
              <Text style={[typography.bodySm, styles.settingSub]}>
                Maintains low-power OS audio anchor for instant earbud capture
              </Text>
            </View>
            <Switch
              value={earbudSettings.backgroundStandby}
              onValueChange={(val) => updateEarbudSettings({ backgroundStandby: val })}
              trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryContainer }}
              thumbColor={earbudSettings.backgroundStandby ? colors.primaryFixed : colors.outline}
            />
          </View>

          <View style={styles.earbudStatusBox}>
            <View style={styles.statusIndicatorRow}>
              <View
                style={[
                  styles.earbudDot,
                  {
                    backgroundColor: earbudStatus.isStandbyActive
                      ? colors.primaryFixed
                      : colors.outline,
                  },
                ]}
              />
              <Text style={[typography.labelCaps, styles.earbudStatusText]}>
                STATUS:{' '}
                {earbudStatus.isStandbyActive
                  ? 'STANDBY CARRIER ACTIVE (MEDIA SESSION BOUND)'
                  : 'STANDBY IDLE'}
              </Text>
            </View>
            {earbudStatus.lastEvent ? (
              <Text style={styles.lastEventSub}>
                Last Event: {earbudStatus.lastEvent} (
                {new Date(earbudStatus.lastEventTimestamp || 0).toLocaleTimeString()})
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              triggerSimulatedTap('SINGLE_TAP');
              Alert.alert('Earbud Single-Tap Triggered', 'Jarvis awakened & listening.');
            }}
          >
            <Text style={styles.actionBtnText}>
              SIMULATE EARBUD SINGLE TAP (TEST WAKE)
            </Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Phone, Messaging & Notification Integration Control */}
        <GlassCard style={styles.bentoCard}>
          <View style={styles.cardHeaderRow}>
            <Icon name="phone_android" size={18} color={colors.primaryContainer} />
            <Text style={[typography.labelCaps, styles.cardCategory]}>
              PHONE & MESSAGING MATRIX
            </Text>
          </View>

          <Text style={[typography.bodyMd, styles.locationDesc]}>
            Allows Jarvis to identify contacts, initiate calls, compose SMS, and understand incoming notifications across supported messaging channels.
          </Text>

          {/* Permission Status Indicators */}
          <View style={styles.permMatrixRow}>
            <View style={styles.permChip}>
              <View style={[styles.earbudDot, { backgroundColor: capabilities?.contacts ? colors.primaryFixed : colors.error }]} />
              <Text style={[typography.bodySm, styles.permChipText]}>
                Contacts: {capabilities?.contacts ? 'Active' : 'Missing'}
              </Text>
            </View>
            <View style={styles.permChip}>
              <View style={[styles.earbudDot, { backgroundColor: capabilities?.phoneCall ? colors.primaryFixed : colors.outline }]} />
              <Text style={[typography.bodySm, styles.permChipText]}>
                Dialer: Ready
              </Text>
            </View>
            <View style={styles.permChip}>
              <View style={[styles.earbudDot, { backgroundColor: capabilities?.notificationListener ? colors.primaryFixed : colors.error }]} />
              <Text style={[typography.bodySm, styles.permChipText]}>
                Listener: {capabilities?.notificationListener ? 'Active' : 'Missing'}
              </Text>
            </View>
          </View>

          {!capabilities?.contacts && (
            <TouchableOpacity
              style={[styles.actionBtn, { marginTop: 12 }]}
              onPress={async () => {
                const res = await requestContactsPermission();
                if (res === 'granted') {
                  Alert.alert('Granted', 'Contacts access authorized.');
                } else {
                  Alert.alert('Denied', 'Contacts access was not granted.');
                }
              }}
            >
              <Text style={styles.actionBtnText}>GRANT CONTACTS ACCESS</Text>
            </TouchableOpacity>
          )}

          {!capabilities?.notificationListener && (
            <TouchableOpacity
              style={[styles.actionBtn, { marginTop: 8 }]}
              onPress={async () => {
                const res = await requestNotificationPermission();
                if (res === 'granted') {
                  Alert.alert('Granted', 'Notification listener authorized.');
                } else if (res === 'unavailable') {
                  Alert.alert('Unavailable', 'Notification listener requires an Android device.');
                } else {
                  Alert.alert(
                    'Notification Access Required',
                    'Please find "Jarvis" in the opened Android Settings and turn ON the switch to allow Jarvis to read notifications.'
                  );
                }
              }}
            >
              <Text style={styles.actionBtnText}>GRANT NOTIFICATION ACCESS</Text>
            </TouchableOpacity>
          )}

          {/* Privacy & Storage Control */}
          <View style={styles.fieldBlock}>
            <Text style={[typography.labelCaps, styles.fieldLabel]}>PRIVACY & RETENTION</Text>
            <View style={styles.earbudSettingRow}>
              <View style={styles.settingTextCol}>
                <Text style={[typography.bodyMd, styles.settingLabel]}>Store Message Content</Text>
                <Text style={[typography.bodySm, styles.settingSub]}>
                  Keep local text for context reasoning (disabled = sender metadata only)
                </Text>
              </View>
              <Switch
                value={notifSettings.storeContent}
                onValueChange={handleToggleStoreContent}
                trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryContainer }}
                thumbColor={notifSettings.storeContent ? colors.primaryFixed : colors.outline}
              />
            </View>
          </View>

          {/* Per-App Notification Listening Matrix */}
          <View style={styles.fieldBlock}>
            <Text style={[typography.labelCaps, styles.fieldLabel]}>OBSERVED MESSAGING APPS</Text>
            <View style={styles.appGrid}>
              {OBSERVABLE_APPS.map((app) => {
                const isEnabled = notifSettings.enabledApps[app.id] ?? false;
                return (
                  <TouchableOpacity
                    key={app.id}
                    style={[styles.appToggleChip, isEnabled && styles.activeAppToggleChip]}
                    onPress={() => handleToggleAppNotif(app.id, !isEnabled)}
                  >
                    <Text style={[styles.appToggleText, isEnabled && styles.activeAppToggleText]}>
                      {app.label} {isEnabled ? '✓' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Contact Aliases Section */}
          <View style={styles.fieldBlock}>
            <Text style={[typography.labelCaps, styles.fieldLabel]}>CONTACT ALIAS MATRIX</Text>
            <Text style={[typography.bodySm, styles.settingSub, { marginBottom: 8 }]}>
              Map colloquial terms (e.g. &quot;Mom&quot;) to real contact names or numbers.
            </Text>

            {Object.entries(aliases).map(([key, val]) => (
              <View key={key} style={styles.aliasRow}>
                <Text style={[typography.bodyMd, styles.aliasKey]}>{key.toUpperCase()}</Text>
                <Text style={[typography.bodySm, styles.aliasArrow]}>→</Text>
                <Text style={[typography.bodyMd, styles.aliasVal]}>{val}</Text>
                <TouchableOpacity onPress={() => handleRemoveAlias(key)} style={styles.delAliasBtn}>
                  <Icon name="close" size={14} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.addAliasRow}>
              <TextInput
                style={[styles.textInput, styles.aliasInput]}
                value={newAliasKey}
                onChangeText={setNewAliasKey}
                placeholder="Alias (Mom)"
                placeholderTextColor={colors.outline}
              />
              <TextInput
                style={[styles.textInput, styles.aliasInput]}
                value={newAliasValue}
                onChangeText={setNewAliasValue}
                placeholder="Contact / Name"
                placeholderTextColor={colors.outline}
              />
              <TouchableOpacity style={styles.addAliasBtn} onPress={handleAddAlias}>
                <Icon name="add" size={18} color={colors.onPrimary} />
              </TouchableOpacity>
            </View>
          </View>
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
    gap: 6,
  },
  protocolChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  activeProtocolChip: {
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderColor: colors.primaryFixed,
  },
  protocolText: {
    color: colors.outline,
    fontSize: 10.5,
    fontWeight: '500',
    letterSpacing: 0,
    textAlign: 'center',
  },
  activeProtocolText: {
    color: colors.primaryFixed,
    fontWeight: '600',
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
    backgroundColor: 'rgba(0, 240, 255, 0.08)',
    borderColor: 'rgba(0, 240, 255, 0.25)',
    borderWidth: 1,
    borderRadius: rounded.full,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 46,
  },
  actionBtnText: {
    color: colors.primaryFixed,
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.2,
    textAlign: 'center',
    lineHeight: 16,
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
  locCoordsSub: {
    color: colors.primaryFixed,
    fontSize: 11,
    marginTop: 2,
  },
  savedPlacesContainer: {
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderRadius: rounded.md,
    padding: 12,
    gap: 8,
    marginTop: 2,
  },
  savedPlacesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  savedPlacesTitle: {
    color: colors.outline,
    fontSize: 9,
    letterSpacing: 1,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  placeInfo: {
    flex: 1,
    gap: 1,
  },
  placeName: {
    color: colors.onSurface,
    fontWeight: '600',
    fontSize: 13,
  },
  placeCoords: {
    color: colors.outline,
    fontSize: 11,
  },
  delPlaceBtn: {
    padding: 6,
  },
  emptyPlacesText: {
    color: colors.outline,
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  adaptiveBox: {
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderRadius: rounded.md,
    padding: 12,
    gap: 10,
    marginTop: 2,
  },
  adaptiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  adaptiveHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stateDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  adaptiveTitle: {
    color: colors.outline,
    fontSize: 9,
    letterSpacing: 1,
  },
  adaptiveStateBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  adaptiveMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: rounded.sm,
  },
  metricCol: {
    gap: 2,
  },
  metricLabel: {
    color: colors.outline,
    fontSize: 8.5,
    letterSpacing: 0.8,
  },
  metricVal: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: '600',
  },
  proximityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderColor: 'rgba(255, 215, 0, 0.2)',
    borderWidth: 1,
    borderRadius: rounded.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  proximityText: {
    color: colors.tertiaryFixed,
    fontSize: 11,
    fontWeight: '500',
  },
  actionBtnSecondary: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: rounded.full,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 46,
  },
  actionBtnSecondaryText: {
    color: colors.onSurfaceVariant,
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.2,
    textAlign: 'center',
    lineHeight: 16,
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
  earbudSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    gap: 12,
  },
  settingTextCol: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '500',
  },
  settingSub: {
    color: colors.outline,
    fontSize: 11,
  },
  earbudStatusBox: {
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderRadius: rounded.md,
    padding: 12,
    gap: 4,
    marginTop: 4,
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  earbudDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  earbudStatusText: {
    color: colors.primaryFixed,
    fontSize: 9,
    letterSpacing: 1,
  },
  lastEventSub: {
    color: colors.outline,
    fontSize: 10,
    marginTop: 2,
  },
  permMatrixRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 4,
  },
  permChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  permChipText: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
  },
  appGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  appToggleChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
  },
  activeAppToggleChip: {
    backgroundColor: 'rgba(0, 240, 255, 0.12)',
    borderColor: colors.primaryFixed,
  },
  appToggleText: {
    color: colors.outline,
    fontSize: 12,
  },
  activeAppToggleText: {
    color: colors.primaryFixed,
    fontWeight: '600',
  },
  aliasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    marginBottom: 6,
    gap: 8,
  },
  aliasKey: {
    color: colors.primaryFixed,
    fontSize: 12,
    fontWeight: '600',
  },
  aliasArrow: {
    color: colors.outline,
  },
  aliasVal: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 12,
  },
  delAliasBtn: {
    padding: 4,
  },
  addAliasRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  aliasInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 12,
  },
  addAliasBtn: {
    backgroundColor: colors.primaryContainer,
    borderRadius: rounded.md,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    marginTop: 10,
  },
  toggleTitle: {
    color: colors.onSurface,
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleSubtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 16,
  },
  integrationsPreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 14,
  },
  integrationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: rounded.full,
  },
  integrationBadgeText: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: '600',
  },
  manageIntegrationsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryFixed,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: rounded.md,
    gap: 8,
  },
  manageIntegrationsBtnText: {
    color: '#0A0D14',
    fontSize: 13,
    fontWeight: '700',
  },
});

