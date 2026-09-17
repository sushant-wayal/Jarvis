import * as React from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { colors, rounded } from '../theme/tokens';

export interface GlassCardProps extends ViewProps {
  variant?: 'subtle' | 'medium' | 'active' | 'glow';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function GlassCard({
  variant = 'subtle',
  style,
  children,
  ...props
}: GlassCardProps): React.ReactElement {
  return (
    <View
      style={[
        styles.base,
        variant === 'medium' && styles.medium,
        variant === 'active' && styles.active,
        variant === 'glow' && styles.glow,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    borderRadius: rounded.lg,
  },
  medium: {
    backgroundColor: colors.glassFillMedium,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  active: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.glassBorderCyan,
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 4,
  },
  glow: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(125, 244, 255, 0.2)',
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 6,
  },
});
