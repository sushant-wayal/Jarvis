import { JarvisState } from '@jarvis/shared';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface StatusHeaderProps {
  state: JarvisState;
  isOnline: boolean;
}

export const StatusHeader: React.FC<StatusHeaderProps> = ({ state, isOnline }) => {
  return (
    <View style={styles.headerContainer}>
      <View style={styles.brandRow}>
        <Text style={styles.brandTitle}>JARVIS</Text>
        <Text style={styles.versionBadge}>V1</Text>
      </View>
      <View style={styles.statusBadgeRow}>
        <View style={[styles.dot, { backgroundColor: isOnline ? '#00E676' : '#FF5252' }]} />
        <Text style={styles.statusText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
        <Text style={styles.separator}>•</Text>
        <Text style={styles.stateDetail}>{state}</Text>
        <Text style={styles.separator}>•</Text>
        <Text style={styles.earbudTag}>🎧 Earbuds Active</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#0A0D14',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  versionBadge: {
    marginLeft: 8,
    color: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  separator: {
    color: '#475569',
    marginHorizontal: 6,
    fontSize: 12,
  },
  stateDetail: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
  },
  earbudTag: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '500',
  },
});
