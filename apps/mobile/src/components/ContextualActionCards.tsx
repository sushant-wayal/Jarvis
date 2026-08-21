import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, rounded, typography } from '../theme/tokens';
import { GlassCard } from './GlassCard';
import { Icon, IconName } from './Icon';

export interface ActionCardData {
  forecast?: {
    temp: string;
    label: string;
    summary: string;
  };
  flight?: {
    from: string;
    to: string;
    price: string;
  };
  toolResult?: {
    title: string;
    icon: IconName;
    details: string;
  };
  actionTitle?: string;
}

export interface ContextualActionCardsProps {
  data?: ActionCardData;
  onActionPress?: (action: string) => void;
}

export function ContextualActionCards({
  data,
  onActionPress,
}: ContextualActionCardsProps): React.ReactElement | null {
  if (!data || (!data.forecast && !data.flight && !data.toolResult && !data.actionTitle)) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {/* Weather Forecast Card */}
        {data.forecast && (
          <GlassCard style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="thermostat" size={18} color={colors.primaryContainer} />
              <Text style={[typography.labelCaps, styles.cardCategory]}>FORECAST</Text>
            </View>
            <View style={styles.tempRow}>
              <Text style={styles.bigTemp}>{data.forecast.temp}</Text>
              <Text style={[typography.bodySm, styles.tempLabel]}>{data.forecast.label}</Text>
            </View>
            <Text style={[typography.bodySm, styles.cardDesc]}>{data.forecast.summary}</Text>
          </GlassCard>
        )}

        {/* Flight Suggestion Card */}
        {data.flight && (
          <GlassCard style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="flight_takeoff" size={18} color={colors.tertiaryContainer} />
              <Text style={[typography.labelCaps, styles.cardCategory]}>FLIGHT TRENDS</Text>
            </View>
            <View style={styles.flightRoute}>
              <Text style={styles.airport}>{data.flight.from}</Text>
              <Icon name="arrow_forward" size={14} color={colors.outlineVariant} />
              <Text style={styles.airport}>{data.flight.to}</Text>
            </View>
            <Text style={[typography.bodySm, styles.cardDesc]}>{data.flight.price}</Text>
          </GlassCard>
        )}

        {/* Tool Execution Card */}
        {data.toolResult && (
          <GlassCard style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name={data.toolResult.icon || 'smart_toy'} size={18} color={colors.secondaryFixed} />
              <Text style={[typography.labelCaps, styles.cardCategory]}>{data.toolResult.title}</Text>
            </View>
            <Text style={[typography.bodySm, styles.cardDesc, { marginTop: 8 }]}>
              {data.toolResult.details}
            </Text>
          </GlassCard>
        )}
      </View>

      {/* Action Button */}
      {data.actionTitle && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onActionPress?.(data.actionTitle || 'ACTION')}
          style={styles.actionButton}
        >
          <Icon name="event_note" size={16} color={colors.primaryFixed} />
          <Text style={[typography.labelCaps, styles.btnText]}>{data.actionTitle}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 14,
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  card: {
    flex: 1,
    minWidth: 140,
    padding: 16,
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  cardCategory: {
    color: colors.outlineVariant,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginVertical: 4,
  },
  bigTemp: {
    color: colors.onSurface,
    fontSize: 26,
    fontWeight: '300',
  },
  tempLabel: {
    color: colors.outline,
    fontSize: 11,
  },
  cardDesc: {
    color: colors.onSurfaceVariant,
    lineHeight: 18,
  },
  flightRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
  },
  airport: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  btnText: {
    color: colors.primaryFixed,
    fontSize: 11,
    letterSpacing: 1.5,
  },
});
