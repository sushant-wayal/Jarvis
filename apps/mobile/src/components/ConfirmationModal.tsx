import * as React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ToolRiskLevel } from '@jarvis/shared';

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
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <View style={styles.header}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.title}>Confirm Action</Text>
          </View>

          <View style={styles.riskBadge}>
            <Text style={styles.riskText}>Risk: {riskLevel}</Text>
          </View>

          <Text style={styles.toolText}>Tool: {toolName}</Text>
          <Text style={styles.summaryText}>{summary}</Text>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
              <Text style={styles.confirmText}>Approve & Execute</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  warningIcon: {
    fontSize: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  riskBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#78350F',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 10,
  },
  riskText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: 'bold',
  },
  toolText: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 14,
    color: '#F1F5F9',
    lineHeight: 20,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelText: {
    color: '#F8FAFC',
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1.5,
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
