import { JarvisState } from '@jarvis/shared';
import * as React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, typography } from '../theme/tokens';
import { Icon } from './Icon';

export interface StatusHeaderProps {
  state?: JarvisState;
  isOnline: boolean;
  onRefresh?: () => Promise<void> | void;
  title?: string;
  showAvatar?: boolean;
}

export function StatusHeader({
  state = 'IDLE',
  isOnline,
  onRefresh,
  title,
}: StatusHeaderProps): React.ReactElement {
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);

  const handleRefresh = async (): Promise<void> => {
    if (onRefresh && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  };

  return (
    <View style={styles.header}>
      {/* Left indicator: Online status */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handleRefresh}
        style={styles.leftStatus}
      >
        <View
          style={[
            styles.pulseDot,
            { backgroundColor: isOnline ? colors.primaryFixed : colors.error },
          ]}
        />
        <Text style={[typography.labelCaps, styles.statusLabel]}>
          {isOnline ? 'Online' : 'Offline'}
        </Text>
      </TouchableOpacity>

      {/* Center Branding if title provided */}
      {title ? (
        <View style={styles.centerBrand}>
          <Text style={[typography.headlineLgMobile, styles.brandTitle]}>{title}</Text>
        </View>
      ) : null}

      {/* Right: Voice Ready Indicator with Material mic Icon */}
      <View style={styles.rightStatus}>
        {isRefreshing ? (
          <ActivityIndicator size="small" color={colors.primaryFixed} />
        ) : (
          <View style={styles.voiceReadyGroup}>
            <Icon
              name="mic"
              size={14}
              color={isOnline ? colors.primaryFixed : colors.outline}
            />
            <Text
              style={[
                typography.labelCaps,
                { color: isOnline ? colors.primaryFixed : colors.outline },
              ]}
            >
              Voice Ready
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  leftStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  statusLabel: {
    color: colors.onSurfaceVariant,
    letterSpacing: 1.5,
  },
  centerBrand: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    color: colors.primary,
    letterSpacing: 3,
    fontSize: 16,
    fontWeight: '700',
  },
  rightStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  voiceReadyGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
