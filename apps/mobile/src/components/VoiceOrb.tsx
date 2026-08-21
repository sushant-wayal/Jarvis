import { JarvisState } from '@jarvis/shared';
import * as React from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { typography } from '../theme/tokens';

export interface VoiceOrbProps {
  state: JarvisState;
  onPress: () => void;
  audioLevel?: number;
  size?: number;
  showStatusLabel?: boolean;
}

/**
 * Living AI Voice Orb — pure React Native Animated.
 *
 * Creates an aurora-like light effect inside a dark sphere. Uses very
 * large, very faint circles whose centers orbit OUTSIDE the sphere.
 * Only their soft edges enter the clipped sphere zone, creating
 * shifting bands of ethereal light — no individual circles visible.
 *
 * 12 concentric pulse rings ripple outward from the center for depth.
 * A bright breathing nucleus anchors the center.
 */
export function VoiceOrb({
  state,
  onPress,
  audioLevel = 0,
  size = 260,
  showStatusLabel = false,
}: VoiceOrbProps): React.ReactElement {
  // ── Animation drivers ──
  // Each aurora light source orbits on its own timer
  const aura1 = React.useRef(new Animated.Value(0)).current;
  const aura2 = React.useRef(new Animated.Value(0)).current;
  const aura3 = React.useRef(new Animated.Value(0)).current;
  const aura4 = React.useRef(new Animated.Value(0)).current;
  const aura5 = React.useRef(new Animated.Value(0)).current;

  // Pulse rings driver
  const ringPulse = React.useRef(new Animated.Value(0)).current;

  // Breathing
  const breathe = React.useRef(new Animated.Value(0)).current;

  const isListening = state === 'LISTENING';
  const isSpeaking = state === 'SPEAKING';
  const isThinking = state === 'THINKING' || state === 'PROCESSING';
  const isError = state === 'ERROR';
  const isActive = isListening || isSpeaking || isThinking;

  const auras = [aura1, aura2, aura3, aura4, aura5];

  // ── Aurora orbit animations ──
  React.useEffect(() => {
    const speedMult = isThinking ? 0.3 : isActive ? 0.5 : 1.0;
    const baseDurs = [15000, 19000, 23000, 17000, 21000];

    const anims = auras.map((a, i) => {
      a.setValue(0);
      return Animated.loop(
        Animated.timing(a, {
          toValue: 1,
          duration: baseDurs[i] * speedMult,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
    });

    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pulse rings ──
  React.useEffect(() => {
    const dur = isSpeaking ? 1800 : isListening ? 2200 : isThinking ? 1500 : 5000;
    ringPulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(ringPulse, {
        toValue: 1,
        duration: dur,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Breathing ──
  React.useEffect(() => {
    const dur = isSpeaking ? 800 : isListening ? 1000 : isThinking ? 600 : 4000;
    breathe.setValue(0);
    const loop = Animated.loop(
      Animated.timing(breathe, {
        toValue: 1,
        duration: dur,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Geometry ──
  const sphereR = size * 0.40;
  const sphereD = sphereR * 2;

  // Aurora light sources — very large circles that orbit far outside
  // Only their inner edge enters the clipped sphere
  const auraRadius = sphereR * 2.8; // each aurora circle is much bigger than sphere
  const orbitR = sphereR * 1.9; // their centers orbit at this distance from sphere center

  // Colors
  const c1 = isError ? '#EF4444' : isThinking ? '#C084FC' : isSpeaking ? '#34D399' : '#7DF4FF';
  const c2 = isError ? '#F87171' : isThinking ? '#A78BFA' : isSpeaking ? '#6EE7B7' : '#67E8F9';
  const c3 = isError ? '#DC2626' : isThinking ? '#8B5CF6' : isSpeaking ? '#10B981' : '#06B6D4';
  const c4 = isError ? '#FCA5A5' : isThinking ? '#DDD6FE' : isSpeaking ? '#A7F3D0' : '#A5F3FC';
  const c5 = isError ? '#B91C1C' : isThinking ? '#7C3AED' : isSpeaking ? '#047857' : '#0891B2';

  const auraColors = [c1, c2, c3, c4, c5];
  const auraOpacities = [0.10, 0.08, 0.07, 0.06, 0.09];

  // Aurora positions — each orbits at a different phase
  const auraConfigs = auras.map((a, i) => {
    const phaseOffset = (i / auras.length) * 2; // evenly distributed around the circle
    return {
      translateX: a.interpolate({
        inputRange: [0, 0.25, 0.5, 0.75, 1],
        outputRange: [
          Math.cos(phaseOffset * Math.PI) * orbitR,
          Math.cos((phaseOffset + 0.5) * Math.PI) * orbitR,
          Math.cos((phaseOffset + 1.0) * Math.PI) * orbitR,
          Math.cos((phaseOffset + 1.5) * Math.PI) * orbitR,
          Math.cos((phaseOffset + 2.0) * Math.PI) * orbitR,
        ],
      }),
      translateY: a.interpolate({
        inputRange: [0, 0.25, 0.5, 0.75, 1],
        outputRange: [
          Math.sin(phaseOffset * Math.PI) * orbitR,
          Math.sin((phaseOffset + 0.5) * Math.PI) * orbitR,
          Math.sin((phaseOffset + 1.0) * Math.PI) * orbitR,
          Math.sin((phaseOffset + 1.5) * Math.PI) * orbitR,
          Math.sin((phaseOffset + 2.0) * Math.PI) * orbitR,
        ],
      }),
    };
  });

  // Breathing scale — smooth sine wave via interpolation
  const breatheScale = breathe.interpolate({
    inputRange: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    outputRange: [1, 1.015, 1.02, 1.015, 1, 0.985, 0.98, 0.985, 1],
  });

  // Pulse rings — 8 rings that ripple outward
  const numRings = 8;
  const rings = Array.from({ length: numRings }, (_, i) => {
    const phase = i / numRings;
    const minR = sphereR * 0.15;
    const maxR = sphereR * 0.95;

    return {
      scale: ringPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [
          (minR + (maxR - minR) * phase) / sphereR,
          (minR + (maxR - minR) * ((phase + 1) % 1)) / sphereR,
        ],
      }),
      opacity: ringPulse.interpolate({
        inputRange: [0, 0.25, 0.5, 0.75, 1],
        outputRange: [
          0.08 + 0.06 * Math.sin(phase * Math.PI * 2),
          0.08 + 0.06 * Math.sin((phase + 0.25) * Math.PI * 2),
          0.08 + 0.06 * Math.sin((phase + 0.5) * Math.PI * 2),
          0.08 + 0.06 * Math.sin((phase + 0.75) * Math.PI * 2),
          0.08 + 0.06 * Math.sin((phase + 1.0) * Math.PI * 2),
        ],
      }),
    };
  });

  // Nucleus pulse
  const nucleusScale = breathe.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 1.3, 1, 0.7, 1],
  });

  const nucleusGlowOpacity = breathe.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0.5, 0.8, 0.5, 0.3, 0.5],
  });

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        disabled={isThinking}
        style={[styles.touch, { width: size, height: size }]}
      >
        {/* Ambient backdrop glow */}
        <Animated.View
          style={[
            styles.ambientGlow,
            {
              width: sphereD * 1.3,
              height: sphereD * 1.3,
              borderRadius: sphereD * 0.65,
              backgroundColor: c1,
              opacity: isActive ? 0.12 : 0.06,
              transform: [{ scale: breatheScale }],
            },
          ]}
        />

        {/* Main sphere — hard clip boundary */}
        <Animated.View
          style={[
            styles.sphere,
            {
              width: sphereD,
              height: sphereD,
              borderRadius: sphereR,
              borderColor: c1,
              transform: [{ scale: breatheScale }],
            },
          ]}
        >
          {/* Aurora light sources — large, faint, orbiting outside */}
          {auraConfigs.map((cfg, i) => (
            <Animated.View
              key={`aura-${i}`}
              style={[
                styles.auraLight,
                {
                  width: auraRadius * 2,
                  height: auraRadius * 2,
                  borderRadius: auraRadius,
                  backgroundColor: auraColors[i],
                  opacity: auraOpacities[i] * (isActive ? 1.8 : 1),
                  transform: [
                    { translateX: cfg.translateX },
                    { translateY: cfg.translateY },
                  ],
                },
              ]}
            />
          ))}

          {/* Pulse rings — concentric ripples */}
          {rings.map((ring, i) => (
            <Animated.View
              key={`ring-${i}`}
              style={[
                styles.pulseRing,
                {
                  width: sphereD,
                  height: sphereD,
                  borderRadius: sphereR,
                  borderColor: c1,
                  opacity: ring.opacity,
                  transform: [{ scale: ring.scale }],
                },
              ]}
            />
          ))}

          {/* Inner glow — warm center light */}
          <View
            style={[
              styles.innerGlow,
              {
                width: sphereR * 0.8,
                height: sphereR * 0.8,
                borderRadius: sphereR * 0.4,
                backgroundColor: c1,
              },
            ]}
          />

          {/* Nucleus glow halo */}
          <Animated.View
            style={[
              styles.nucleusGlow,
              {
                width: sphereR * 0.35,
                height: sphereR * 0.35,
                borderRadius: sphereR * 0.175,
                backgroundColor: '#FFFFFF',
                opacity: nucleusGlowOpacity,
                transform: [{ scale: nucleusScale }],
              },
            ]}
          />

          {/* Nucleus — white bright core */}
          <View style={styles.nucleus} />

          {/* Specular highlight — top-left for 3D depth */}
          <View
            style={[
              styles.specular,
              {
                width: sphereR * 0.35,
                height: sphereR * 0.2,
                borderRadius: sphereR * 0.1,
              },
            ]}
          />
        </Animated.View>
      </TouchableOpacity>

      {showStatusLabel && (
        <View style={styles.labelRow}>
          <View style={[styles.labelDot, { backgroundColor: c1 }]} />
          <Text style={[typography.labelCaps, { color: c1 }]}>
            {isListening
              ? 'LISTENING...'
              : isThinking
              ? 'PROCESSING...'
              : isSpeaking
              ? 'JARVIS SPEAKING'
              : isError
              ? 'TAP TO RETRY'
              : 'JARVIS ACTIVE'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
  },
  touch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ambientGlow: {
    position: 'absolute',
    shadowColor: '#7DF4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 8,
  },
  sphere: {
    overflow: 'hidden',
    backgroundColor: '#08080A',
    borderWidth: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auraLight: {
    position: 'absolute',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 1,
  },
  innerGlow: {
    position: 'absolute',
    opacity: 0.12,
  },
  nucleusGlow: {
    position: 'absolute',
  },
  nucleus: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  specular: {
    position: 'absolute',
    top: '15%',
    left: '20%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
