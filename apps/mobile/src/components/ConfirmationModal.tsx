import { ToolRiskLevel } from '@jarvis/shared';
import * as React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, rounded, typography } from '../theme/tokens';
import { GlassCard } from './GlassCard';

export interface ConfirmationModalProps {
  visible: boolean;
  actionId: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
  summary: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  visible,
  toolName,
  riskLevel,
  summary,
  onConfirm,
  onCancel,
}: ConfirmationModalProps): React.ReactElement {
  const isHighRisk = riskLevel === 'HIGH_RISK' || riskLevel === 'CRITICAL';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <GlassCard style={styles.modalBox} variant="active">
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.alertIcon}>⚠️</Text>
            <Text style={[typography.headlineLgMobile, styles.title]}>Action Authorization</Text>
          </View>

          {/* Risk Level Badge */}
          <View
            style={[
              styles.riskBadge,
              { backgroundColor: isHighRisk ? 'rgba(239, 68, 68, 0.15)' : 'rgba(254, 214, 57, 0.15)' },
            ]}
          >
            <Text
              style={[
                typography.labelCaps,
                { color: isHighRisk ? colors.error : colors.tertiaryContainer },
              ]}
            >
              RISK PROTOCOL: {riskLevel}
            </Text>
          </View>

          {/* Tool Designation */}
          <View style={styles.toolRow}>
            <Text style={[typography.labelCaps, styles.toolLabel]}>TARGET TOOL:</Text>
            <Text style={styles.toolName}>{toolName}</Text>
          </View>

          {/* Action Summary */}
          <Text style={[typography.bodyMd, styles.summaryText]}>{summary}</Text>

          {/* Button Options */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={[typography.labelCaps, styles.cancelText]}>DISMISS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
              <Text style={[typography.labelCaps, styles.confirmText]}>AUTHORIZE</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: rounded.lg,
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  alertIcon: {
    fontSize: 20,
  },
  title: {
    color: colors.onSurface,
    fontSize: 18,
    letterSpacing: 1,
  },
  riskBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 14,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  toolLabel: {
    color: colors.outline,
    fontSize: 10,
  },
  toolName: {
    color: colors.primaryFixed,
    fontSize: 13,
    fontWeight: '600',
  },
  summaryText: {
    color: colors.onSurfaceVariant,
    lineHeight: 22,
    marginBottom: 24,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: rounded.full,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  confirmBtn: {
    flex: 1.5,
    backgroundColor: 'rgba(0, 240, 255, 0.15)',
    borderColor: 'rgba(0, 240, 255, 0.4)',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: rounded.full,
    alignItems: 'center',
  },
  confirmText: {
    color: colors.primaryFixed,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
});
