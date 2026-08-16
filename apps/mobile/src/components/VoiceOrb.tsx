import { JarvisState } from '@jarvis/shared';
import * as React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface VoiceOrbProps {
  state: JarvisState;
  onPress: () => void;
  audioLevel?: number;
  key?: string;
}

export function VoiceOrb({ state, onPress, audioLevel = 0 }: VoiceOrbProps): React.ReactElement {
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const rotateAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (state === 'LISTENING') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15 + audioLevel * 0.25,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 250,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else if (state === 'THINKING' || state === 'PROCESSING') {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        })
      ).start();
    } else if (state === 'SPEAKING') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 300, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.95, duration: 300, useNativeDriver: true }),
        ])
      ).start();
    } else {
      // IDLE breathing animation
      pulseAnim.setValue(1);
      rotateAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.96, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [state, audioLevel, pulseAnim, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getOrbColor = (): string => {
    switch (state) {
      case 'LISTENING':
        return '#00F2FE'; // Vibrant Cyan
      case 'PROCESSING':
      case 'THINKING':
        return '#7F00FF'; // Purple
      case 'SPEAKING':
        return '#00E676'; // Emerald Green
      case 'ERROR':
        return '#FF5252'; // Red
      case 'OFFLINE':
        return '#757575'; // Grey
      case 'IDLE':
      default:
        return '#4FACFE'; // Cyan Blue
    }
  };

  const getLabelText = (): string => {
    switch (state) {
      case 'LISTENING':
        return 'Listening...';
      case 'PROCESSING':
        return 'Transcribing...';
      case 'THINKING':
        return 'Jarvis Thinking...';
      case 'SPEAKING':
        return 'Jarvis Speaking...';
      case 'ERROR':
        return 'Tap to retry';
      case 'OFFLINE':
        return 'No Connection';
      case 'IDLE':
      default:
        return 'Tap to speak';
    }
  };

  const color = getOrbColor();

  return (
    <View style={styles.container}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={state === 'PROCESSING' || state === 'THINKING'}>
        <Animated.View
          style={[
            styles.outerOrb,
            {
              borderColor: color,
              transform: [{ scale: pulseAnim }, { rotate: spin }],
              shadowColor: color,
            },
          ]}
        >
          <View style={[styles.innerCore, { backgroundColor: color }]}>
            <Text style={styles.iconText}>
              {state === 'LISTENING' ? '🎙️' : state === 'SPEAKING' ? '🔊' : state === 'THINKING' ? '⚡' : '◉'}
            </Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
      <Text style={[styles.statusText, { color }]}>{getLabelText()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  outerOrb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
    backgroundColor: '#0F172A',
  },
  innerCore: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  iconText: {
    fontSize: 36,
  },
  statusText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
