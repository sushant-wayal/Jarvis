import { router } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GlassCard } from '../src/components/GlassCard';
import { Icon, IconName } from '../src/components/Icon';
import { StatusHeader } from '../src/components/StatusHeader';
import { apiClient, IntegrationItem } from '../src/services/apiClient';
import { colors, rounded, typography } from '../src/theme/tokens';

export default function IntegrationsScreen(): React.ReactElement {
  const [integrations, setIntegrations] = React.useState<IntegrationItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const pendingTogglesRef = React.useRef<Set<string>>(new Set());

  const loadIntegrations = React.useCallback(async (): Promise<void> => {
    try {
      const list = await apiClient.getIntegrations();
      setIntegrations(list);
    } catch {
      // fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadIntegrations();

    // Listen for deep link returns from OAuth flows (e.g. jarvis://integrations?status=success)
    const handleDeepLink = (event: { url: string }) => {
      if (event.url && event.url.includes('integrations')) {
        const urlObj = new URL(event.url);
        const status = urlObj.searchParams.get('status');
        const email = urlObj.searchParams.get('email');
        const integration = urlObj.searchParams.get('integration');

        if (status === 'success') {
          Alert.alert(
            'Authentication Successful',
            `Successfully connected ${integration || 'service'}${email ? ` (${decodeURIComponent(email)})` : ''} to Jarvis!`
          );
        } else if (status === 'error') {
          const err = urlObj.searchParams.get('error') || 'Unknown authentication error';
          Alert.alert('Authentication Failed', `Could not connect: ${decodeURIComponent(err)}`);
        }
        loadIntegrations();
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    // Also check initial URL
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) handleDeepLink({ url: initialUrl });
    });

    return () => {
      sub.remove();
    };
  }, [loadIntegrations]);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await loadIntegrations();
  };

  const handleStartOAuth = async (integrationId: string): Promise<void> => {
    try {
      if (integrationId === 'gmail') {
        const res = await apiClient.getGoogleAuthUrl('jarvis://integrations');
        if (res?.authUrl) {
          const canOpen = await Linking.canOpenURL(res.authUrl);
          if (canOpen) {
            await Linking.openURL(res.authUrl);
          } else {
            Alert.alert('Cannot Open Browser', 'Could not launch Google authentication URL.');
          }
        } else {
          Alert.alert(
            'Server Setup Needed',
            'Google Client ID is not configured on the Brain server. Please set GMAIL_CLIENT_ID in apps/brain/.env.'
          );
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to start authentication flow.');
    }
  };

  const handleToggle = async (item: IntegrationItem, nextValue: boolean): Promise<void> => {
    if (pendingTogglesRef.current.has(item.id)) return;
    pendingTogglesRef.current.add(item.id);

    // Save previous state for rollback on error
    const previousIntegrations = [...integrations];

    // Optimistic synchronous UI update — eliminates switch flicker and lag
    setIntegrations((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it;
        if (nextValue) {
          return {
            ...it,
            enabled: true,
            status: it.authType === 'OAUTH' && !it.connectedAccount ? 'CONFIG_REQUIRED' : 'ENABLED',
          };
        } else {
          return {
            ...it,
            enabled: false,
            status: 'DISABLED',
            connectedAccount: it.authType === 'OAUTH' ? null : it.connectedAccount,
          };
        }
      })
    );

    try {
      const result = await apiClient.toggleIntegration(
        item.id,
        nextValue,
        !nextValue && item.authType === 'OAUTH'
      );

      if (!result) {
        // Revert on error
        setIntegrations(previousIntegrations);
        Alert.alert('Error', `Failed to update ${item.name}. Please check connection.`);
        return;
      }

      // Sync confirmed state from server response directly without redundant full refetch
      setIntegrations((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                enabled: result.enabled,
                status: result.status,
                connectedAccount: !result.enabled && it.authType === 'OAUTH' ? null : it.connectedAccount,
              }
            : it
        )
      );

      // Prompt to connect account when turning on an unauthenticated OAuth integration
      if (nextValue && (result.requiresAuth || item.authType === 'OAUTH') && !item.connectedAccount) {
        Alert.alert(
          'Authentication Required',
          `${item.name} is now enabled. Connect your Google account so Jarvis can access your emails?`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Connect with Google',
              onPress: () => handleStartOAuth(item.id),
            },
          ]
        );
      }
    } catch {
      setIntegrations(previousIntegrations);
      Alert.alert('Error', `Failed to update ${item.name}.`);
    } finally {
      pendingTogglesRef.current.delete(item.id);
    }
  };

  const handleDisconnect = (item: IntegrationItem): void => {
    Alert.alert(
      `Disconnect ${item.name}?`,
      `Are you sure you want to disconnect ${item.name}? Your access tokens and persistent credentials will be cleared.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            // Optimistically update card to CONFIG_REQUIRED
            setIntegrations((prev) =>
              prev.map((it) =>
                it.id === item.id
                  ? { ...it, status: 'CONFIG_REQUIRED', connectedAccount: null }
                  : it
              )
            );
            await apiClient.disconnectIntegration(item.id);
            await loadIntegrations();
          },
        },
      ]
    );
  };

  const getIntegrationIcon = (id: string): { name: IconName; color: string } => {
    switch (id) {
      case 'gmail':
        return { name: 'mail', color: '#EF4444' };
      case 'github':
        return { name: 'code', color: '#8B5CF6' };
      case 'serenity':
        return { name: 'smart_display', color: '#EC4899' };
      case 'north':
        return { name: 'account_balance', color: '#10B981' };
      default:
        return { name: 'extension', color: colors.primaryContainer };
    }
  };

  const renderIntegrationCard = ({ item }: { item: IntegrationItem }) => {
    const iconInfo = getIntegrationIcon(item.id);
    const isConnected = item.status === 'ENABLED';
    const isConfigRequired = item.status === 'CONFIG_REQUIRED';

    return (
      <GlassCard style={styles.integrationCard}>
        {/* Top Header */}
        <View style={styles.cardTopRow}>
          <View style={[styles.iconBox, { backgroundColor: `${iconInfo.color}18` }]}>
            <Icon name={iconInfo.name} size={22} color={iconInfo.color} />
          </View>
          <View style={styles.titleArea}>
            <View style={styles.titleRow}>
              <Text style={[typography.bodyXl, styles.integrationName]}>{item.name}</Text>
              {item.authType === 'OAUTH' && (
                <View style={styles.oauthBadge}>
                  <Text style={styles.oauthBadgeText}>OAuth 2.0</Text>
                </View>
              )}
            </View>
            <Text style={[typography.bodySm, styles.integrationDesc]} numberOfLines={2}>
              {item.description}
            </Text>
          </View>
          <Switch
            value={item.enabled}
            onValueChange={(val) => handleToggle(item, val)}
            trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryContainer }}
            thumbColor={item.enabled ? colors.primaryFixed : colors.outline}
          />
        </View>

        {/* Status & Account Row */}
        <View style={styles.statusContainer}>
          <View style={styles.statusPillRow}>
            {isConnected && (
              <View style={[styles.statusPill, styles.statusConnected]}>
                <View style={[styles.dot, { backgroundColor: colors.primaryFixed }]} />
                <Text style={styles.statusConnectedText}>Active</Text>
              </View>
            )}
            {isConfigRequired && (
              <View style={[styles.statusPill, styles.statusWarning]}>
                <View style={[styles.dot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.statusWarningText}>Requires Authentication</Text>
              </View>
            )}
            {item.status === 'DISABLED' && (
              <View style={[styles.statusPill, styles.statusDisabled]}>
                <Text style={styles.statusDisabledText}>Disabled</Text>
              </View>
            )}
          </View>

          {item.connectedAccount && (
            <Text style={styles.accountText} numberOfLines={1}>
              {item.connectedAccount}
            </Text>
          )}
        </View>

        {/* Action Button if Config Required or Connected OAuth */}
        {item.enabled && isConfigRequired && item.authType === 'OAUTH' && (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={() => handleStartOAuth(item.id)}
          >
            <Icon name="login" size={16} color="#0A0D14" />
            <Text style={styles.connectButtonText}>Connect with Google</Text>
          </TouchableOpacity>
        )}

        {item.enabled && isConnected && item.authType === 'OAUTH' && (
          <View style={styles.connectedFooter}>
            <Text style={styles.toolsCountText}>{item.toolCount} tools active</Text>
            <TouchableOpacity onPress={() => handleDisconnect(item)}>
              <Text style={styles.disconnectText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        )}
      </GlassCard>
    );
  };

  return (
    <View style={styles.container}>
      <StatusHeader isOnline={true} />

      {/* Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
        >
          <Icon name="arrow_back" size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={[typography.headlineLg, styles.pageTitle]}>Integrations</Text>
          <Text style={[typography.bodyMd, styles.pageSubtitle]}>
            Manage external tools, AI access & credentials.
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primaryFixed} />
          <Text style={[typography.bodyMd, styles.loadingText]}>Loading integrations...</Text>
        </View>
      ) : (
        <FlatList
          data={integrations}
          keyExtractor={(item) => item.id}
          renderItem={renderIntegrationCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primaryFixed}
              colors={[colors.primaryFixed]}
            />
          }
          ListEmptyComponent={
            <GlassCard style={styles.emptyCard}>
              <Icon name="extension_off" size={32} color={colors.outline} />
              <Text style={[typography.bodyXl, styles.emptyTitle]}>No Integrations Found</Text>
              <Text style={[typography.bodySm, styles.emptySub]}>
                Make sure your Brain server is running and accessible.
              </Text>
            </GlassCard>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: rounded.full,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  headerTitles: {
    flex: 1,
  },
  pageTitle: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: '700',
  },
  pageSubtitle: {
    color: colors.outline,
    fontSize: 13,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.outline,
    marginTop: 12,
  },
  integrationCard: {
    padding: 16,
    marginBottom: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: rounded.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  titleArea: {
    flex: 1,
    paddingRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  integrationName: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: '700',
  },
  oauthBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: rounded.sm,
    backgroundColor: 'rgba(0, 219, 233, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 219, 233, 0.3)',
  },
  oauthBadgeText: {
    color: colors.primaryFixed,
    fontSize: 10,
    fontWeight: '700',
  },
  integrationDesc: {
    color: colors.outline,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: rounded.full,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusConnected: {
    backgroundColor: 'rgba(0, 219, 233, 0.1)',
  },
  statusConnectedText: {
    color: colors.primaryFixed,
    fontSize: 11,
    fontWeight: '600',
  },
  statusWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  statusWarningText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '600',
  },
  statusDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusDisabledText: {
    color: colors.outline,
    fontSize: 11,
  },
  accountText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    maxWidth: 180,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryFixed,
    paddingVertical: 10,
    borderRadius: rounded.md,
    marginTop: 12,
    gap: 8,
  },
  connectButtonText: {
    color: '#0A0D14',
    fontSize: 13,
    fontWeight: '700',
  },
  connectedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  toolsCountText: {
    color: colors.outline,
    fontSize: 11,
  },
  disconnectText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.onSurface,
    marginTop: 12,
  },
  emptySub: {
    color: colors.outline,
    textAlign: 'center',
    marginTop: 4,
  },
});
