import { JarvisState } from '@jarvis/shared';
import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface StatusHeaderProps {
  state: JarvisState;
  isOnline: boolean;
  onRefresh?: () => Promise<void> | void;
  key?: string;
}

export function StatusHeader({ state, isOnline, onRefresh }: StatusHeaderProps): React.ReactElement {
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);

  const handleRefresh = async (): Promise<void> => {
    if (onRefresh && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  };

  const getStateInfo = (): { label: string; color: string; icon: string } => {
    switch (state) {
      case 'LISTENING':
        return { label: 'Listening...', color: '#38BDF8', icon: '🎙️' };
      case 'THINKING':
        return { label: 'Thinking...', color: '#A855F7', icon: '⚡' };
      case 'SPEAKING':
        return { label: 'Speaking', color: '#10B981', icon: '🔊' };
      case 'PROCESSING':
        return { label: 'Processing...', color: '#F59E0B', icon: '⏳' };
      case 'ERROR':
        return { label: 'Error', color: '#EF4444', icon: '⚠️' };
      case 'OFFLINE':
        return { label: 'Offline', color: '#EF4444', icon: '🔴' };
      case 'IDLE':
      default:
        return { label: isOnline ? 'Voice Ready' : 'Offline', color: isOnline ? '#38BDF8' : '#64748B', icon: isOnline ? '✨' : '🔴' };
    }
  };

  const statusInfo = getStateInfo();

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>JARVIS</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
          activeOpacity={0.7}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#38BDF8" />
          ) : (
            <Text style={styles.refreshText}>🔄 Refresh</Text>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.badgesRow}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: isOnline ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              borderColor: statusInfo.color,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: statusInfo.color }]}>
            {statusInfo.icon} {statusInfo.label}
          </Text>
        </View>

        <View
          style={[
            styles.badge,
            {
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              borderColor: '#334155',
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: '#94A3B8' }]}>📱 Online</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 2,
  },
  refreshButton: {
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderColor: '#334155',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  refreshText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
