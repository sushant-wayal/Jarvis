import { router } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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

interface PermissionLevelConfig {
  actionType: 'READ' | 'WRITE' | 'EXTERNAL_ACTION' | 'DESTRUCTIVE';
  title: string;
  desc: string;
  icon: IconName;
}

const PERMISSION_LEVELS: PermissionLevelConfig[] = [
  {
    actionType: 'READ',
    title: 'Read Access',
    desc: 'Read data, search emails & view resources',
    icon: 'visibility',
  },
  {
    actionType: 'WRITE',
    title: 'Workspace Changes',
    desc: 'Create drafts, labels & update records',
    icon: 'edit',
  },
  {
    actionType: 'EXTERNAL_ACTION',
    title: 'Outbound Actions',
    desc: 'Send & reply to emails, trigger external events',
    icon: 'send',
  },
  {
    actionType: 'DESTRUCTIVE',
    title: 'Destructive Actions',
    desc: 'Delete messages, purge items & trash',
    icon: 'delete',
  },
];

const formatToolDisplayName = (toolNameOrId: string): string => {
  const parts = toolNameOrId.split('.');
  const base = parts.length > 1 ? parts.slice(1).join(' ') : toolNameOrId;
  return base
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const getActionBadgeInfo = (actionType: string): { label: string; color: string } => {
  switch (actionType) {
    case 'EXTERNAL_ACTION':
      return { label: 'Outbound', color: '#38BDF8' };
    case 'DESTRUCTIVE':
      return { label: 'Destructive', color: '#F87171' };
    case 'WRITE':
      return { label: 'Write', color: '#FBBF24' };
    case 'READ':
    default:
      return { label: 'Read', color: '#34D399' };
  }
};

export default function IntegrationsScreen(): React.ReactElement {
  const [integrations, setIntegrations] = React.useState<IntegrationItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const pendingTogglesRef = React.useRef<Set<string>>(new Set());
  const [collapsedIntegrations, setCollapsedIntegrations] = React.useState<Record<string, boolean>>({});

  const toggleExpandTools = (id: string) => {
    setCollapsedIntegrations((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

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

  const handleBack = React.useCallback((): void => {
    router.navigate('/settings');
  }, []);

  React.useEffect(() => {
    const onBackPress = (): boolean => {
      handleBack();
      return true;
    };
    const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => {
      backSub.remove();
    };
  }, [handleBack]);

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
        false // Never wipe credentials on a plain toggle — only on explicit Disconnect
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

  const handleSetPolicy = async (
    integrationId: string,
    actionType: string,
    policy: 'ALLOW' | 'ASK' | 'DENY'
  ): Promise<void> => {
    const currentItem = integrations.find((i) => i.id === integrationId);
    const updatedPolicies: Record<string, 'ALLOW' | 'ASK' | 'DENY'> = {
      ...(currentItem?.policies || {}),
      [actionType]: policy,
    };

    // Optimistic synchronous UI update
    setIntegrations((prev) =>
      prev.map((it) => {
        if (it.id !== integrationId) return it;
        return {
          ...it,
          policies: updatedPolicies,
          autoApprove: {
            ...it.autoApprove,
            [actionType]: policy === 'ALLOW',
          },
        };
      })
    );

    try {
      const ok = await apiClient.updateIntegrationPermissions(integrationId, {
        policies: updatedPolicies,
      });
      if (!ok) {
        setIntegrations((prev) =>
          prev.map((it) => (it.id === integrationId ? currentItem || it : it))
        );
        Alert.alert('Error', 'Failed to update permission setting.');
      }
    } catch {
      setIntegrations((prev) =>
        prev.map((it) => (it.id === integrationId ? currentItem || it : it))
      );
      Alert.alert('Error', 'Failed to update permission setting.');
    }
  };

  const handleSetToolPolicy = async (
    integrationId: string,
    toolId: string,
    policy: 'ALLOW' | 'ASK' | 'DENY'
  ): Promise<void> => {
    const currentItem = integrations.find((i) => i.id === integrationId);
    const updatedToolPolicies: Record<string, 'ALLOW' | 'ASK' | 'DENY'> = {
      ...(currentItem?.toolPolicies || {}),
      [toolId]: policy,
    };

    // Optimistic synchronous UI update
    setIntegrations((prev) =>
      prev.map((it) => {
        if (it.id !== integrationId) return it;
        return {
          ...it,
          toolPolicies: updatedToolPolicies,
          tools: it.tools?.map((t) => (t.id === toolId || t.name === toolId ? { ...t, policy } : t)),
        };
      })
    );

    try {
      const ok = await apiClient.updateIntegrationPermissions(integrationId, {
        toolPolicies: updatedToolPolicies,
      });
      if (!ok) {
        setIntegrations((prev) =>
          prev.map((it) => (it.id === integrationId ? currentItem || it : it))
        );
        Alert.alert('Error', 'Failed to update tool permission setting.');
      }
    } catch {
      setIntegrations((prev) =>
        prev.map((it) => (it.id === integrationId ? currentItem || it : it))
      );
      Alert.alert('Error', 'Failed to update tool permission setting.');
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

        {/* Granular Tool Permissions Section */}
        {item.enabled && (
          <View style={styles.permissionsSection}>
            <TouchableOpacity
              style={styles.permissionsHeaderToggle}
              onPress={() => toggleExpandTools(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.permissionsHeaderLeft}>
                <Icon name="shield" size={13} color={colors.primaryFixed} />
                <Text style={styles.permissionsHeaderText}>
                  Tool Permissions ({item.tools?.length || item.toolCount} tools)
                </Text>
              </View>
              <Icon
                name={collapsedIntegrations[item.id] !== true ? 'expand_more' : 'arrow_forward'}
                size={16}
                color={colors.outline}
              />
            </TouchableOpacity>

            {collapsedIntegrations[item.id] !== true && item.tools && item.tools.length > 0 ? (
              item.tools.map((tool) => {
                const currentPolicy: 'ALLOW' | 'ASK' | 'DENY' =
                  item.toolPolicies?.[tool.id] ||
                  item.toolPolicies?.[tool.name] ||
                  tool.policy ||
                  (tool.actionType === 'READ' ? 'ALLOW' : 'ASK');

                const badge = getActionBadgeInfo(tool.actionType);

                return (
                  <View key={tool.id} style={styles.permissionPolicyBlock}>
                    <View style={styles.permissionTopRow}>
                      <View style={styles.permissionTitleRow}>
                        <Text style={styles.permissionTitle}>
                          {formatToolDisplayName(tool.name || tool.id)}
                        </Text>
                        <View style={[styles.actionTypeBadge, { backgroundColor: `${badge.color}18` }]}>
                          <Text style={[styles.actionTypeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.policyBadgeText,
                          currentPolicy === 'ALLOW' && styles.policyAllowText,
                          currentPolicy === 'ASK' && styles.policyAskText,
                          currentPolicy === 'DENY' && styles.policyDenyText,
                        ]}
                      >
                        {currentPolicy === 'ALLOW' ? 'Auto-Executes' : currentPolicy === 'ASK' ? 'Asks in Chat' : 'Blocked'}
                      </Text>
                    </View>

                    <Text style={styles.permissionSubtitle}>{tool.description}</Text>

                    {/* 3-Way Segmented Control */}
                    <View style={styles.segmentedControl}>
                      <TouchableOpacity
                        style={[
                          styles.segmentBtn,
                          currentPolicy === 'ALLOW' && styles.segmentBtnActiveAllow,
                        ]}
                        onPress={() => handleSetToolPolicy(item.id, tool.id, 'ALLOW')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.segmentBtnText,
                            currentPolicy === 'ALLOW' && styles.segmentBtnTextActiveAllow,
                          ]}
                        >
                          Allow
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.segmentBtn,
                          currentPolicy === 'ASK' && styles.segmentBtnActiveAsk,
                        ]}
                        onPress={() => handleSetToolPolicy(item.id, tool.id, 'ASK')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.segmentBtnText,
                            currentPolicy === 'ASK' && styles.segmentBtnTextActiveAsk,
                          ]}
                        >
                          Ask
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.segmentBtn,
                          currentPolicy === 'DENY' && styles.segmentBtnActiveDeny,
                        ]}
                        onPress={() => handleSetToolPolicy(item.id, tool.id, 'DENY')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.segmentBtnText,
                            currentPolicy === 'DENY' && styles.segmentBtnTextActiveDeny,
                          ]}
                        >
                          Deny
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            ) : collapsedIntegrations[item.id] !== true && (!item.tools || item.tools.length === 0) ? (
              PERMISSION_LEVELS.filter(
                (perm) =>
                  !item.supportedActionTypes ||
                  item.supportedActionTypes.length === 0 ||
                  item.supportedActionTypes.includes(perm.actionType)
              ).map((perm) => {
                const currentPolicy: 'ALLOW' | 'ASK' | 'DENY' =
                  item.policies?.[perm.actionType] ??
                  (perm.actionType === 'READ'
                    ? (item.autoApprove?.READ === false ? 'DENY' : 'ALLOW')
                    : (item.autoApprove?.[perm.actionType] ? 'ALLOW' : 'ASK'));

                return (
                  <View key={perm.actionType} style={styles.permissionPolicyBlock}>
                    <View style={styles.permissionTopRow}>
                      <View style={styles.permissionTitleRow}>
                        <Icon name={perm.icon} size={14} color={colors.primaryFixed} style={{ marginRight: 6 }} />
                        <Text style={styles.permissionTitle}>{perm.title}</Text>
                      </View>
                      <Text
                        style={[
                          styles.policyBadgeText,
                          currentPolicy === 'ALLOW' && styles.policyAllowText,
                          currentPolicy === 'ASK' && styles.policyAskText,
                          currentPolicy === 'DENY' && styles.policyDenyText,
                        ]}
                      >
                        {currentPolicy === 'ALLOW' ? 'Auto-Executes' : currentPolicy === 'ASK' ? 'Asks in Chat' : 'Blocked'}
                      </Text>
                    </View>

                    <Text style={styles.permissionSubtitle}>{perm.desc}</Text>

                    {/* 3-Way Segmented Control */}
                    <View style={styles.segmentedControl}>
                      <TouchableOpacity
                        style={[
                          styles.segmentBtn,
                          currentPolicy === 'ALLOW' && styles.segmentBtnActiveAllow,
                        ]}
                        onPress={() => handleSetPolicy(item.id, perm.actionType, 'ALLOW')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.segmentBtnText,
                            currentPolicy === 'ALLOW' && styles.segmentBtnTextActiveAllow,
                          ]}
                        >
                          Allow
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.segmentBtn,
                          currentPolicy === 'ASK' && styles.segmentBtnActiveAsk,
                        ]}
                        onPress={() => handleSetPolicy(item.id, perm.actionType, 'ASK')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.segmentBtnText,
                            currentPolicy === 'ASK' && styles.segmentBtnTextActiveAsk,
                          ]}
                        >
                          Ask
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.segmentBtn,
                          currentPolicy === 'DENY' && styles.segmentBtnActiveDeny,
                        ]}
                        onPress={() => handleSetPolicy(item.id, perm.actionType, 'DENY')}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.segmentBtnText,
                            currentPolicy === 'DENY' && styles.segmentBtnTextActiveDeny,
                          ]}
                        >
                          Deny
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            ) : null}
          </View>
        )}

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
          onPress={handleBack}
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
  permissionsSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  permissionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  permissionsHeaderText: {
    color: colors.primaryFixed,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  permissionsHeaderToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 4,
  },
  permissionsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: rounded.sm,
    marginLeft: 8,
  },
  actionTypeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  permissionPolicyBlock: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  permissionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  permissionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  permissionTitle: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  permissionSubtitle: {
    color: colors.outline,
    fontSize: 11,
    lineHeight: 15,
  },
  policyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  policyAllowText: {
    color: colors.primaryFixed,
  },
  policyAskText: {
    color: '#F59E0B',
  },
  policyDenyText: {
    color: '#EF4444',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: rounded.md,
    padding: 2,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rounded.sm,
  },
  segmentBtnActiveAllow: {
    backgroundColor: 'rgba(0, 219, 233, 0.16)',
    borderWidth: 1,
    borderColor: colors.primaryFixed,
  },
  segmentBtnActiveAsk: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  segmentBtnActiveDeny: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  segmentBtnText: {
    color: colors.outline,
    fontSize: 12,
    fontWeight: '600',
  },
  segmentBtnTextActiveAllow: {
    color: colors.primaryFixed,
    fontWeight: '700',
  },
  segmentBtnTextActiveAsk: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  segmentBtnTextActiveDeny: {
    color: '#F87171',
    fontWeight: '700',
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
