import { ChatMessage, JarvisState, TaskItem, ToolRiskLevel, UserEventItem } from '@jarvis/shared';
import * as React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ConfirmationModal } from '../src/components/ConfirmationModal';
import { GlassCard } from '../src/components/GlassCard';
import { Icon } from '../src/components/Icon';
import { StatusHeader } from '../src/components/StatusHeader';
import { EtherealOrb } from '../src/components/EtherealOrb';
import { useEarbudManager } from '../src/hooks/useEarbudManager';
import { adaptiveLocationEngine } from '../src/services/adaptiveLocationEngine';
import { apiClient } from '../src/services/apiClient';
import { appSettingsService } from '../src/services/appSettingsService';
import { integrationManager } from '../src/integrations/IntegrationManager';
import { reminderScheduler } from '../src/services/reminderScheduler';
import { colors, rounded, typography } from '../src/theme/tokens';

export default function HomeScreen(): React.ReactElement {
  const {
    jarvisState,
    setJarvisState,
    settings: earbudSettings,
    status: earbudStatus,
    isRecording,
    recordingLevel,
    isPlaying,
    assistantSpokenText,
    errorMessage: earbudError,
    toggleVoiceInteraction,
    triggerSimulatedTap,
  } = useEarbudManager();

  const [isOnline, setIsOnline] = React.useState<boolean>(true);

  // Dynamic context info
  const [userName, setUserName] = React.useState<string>('Sir');
  const [contextHint, setContextHint] = React.useState<{
    icon: 'flight_takeoff' | 'my_location' | 'calendar_today' | 'blur_on';
    text: string;
  }>({
    icon: 'blur_on',
    text: 'Ready for your commands.',
  });

  // Confirmation modal state
  const [confirmationState, setConfirmationState] = React.useState<{
    visible: boolean;
    actionId: string;
    toolName: string;
    riskLevel: ToolRiskLevel;
    summary: string;
  }>({
    visible: false,
    actionId: '',
    toolName: '',
    riskLevel: 'SAFE',
    summary: '',
  });

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good morning, ${userName}.`;
    if (hour < 17) return `Good afternoon, ${userName}.`;
    return `Good evening, ${userName}.`;
  };

  const loadDynamicContext = async (): Promise<void> => {
    try {
      const [events, tasks, location, memories] = await Promise.all([
        apiClient.getEvents('ACTIVE').catch(() => [] as UserEventItem[]),
        apiClient.getTasks('ACTIVE').catch(() => [] as TaskItem[]),
        apiClient.getCurrentLocation().catch(() => null),
        apiClient.getMemories().catch(() => []),
      ]);

      // Extract user name from memory if available
      if (memories && memories.length > 0) {
        const nameMem = memories.find(
          (m) =>
            m.content.toLowerCase().includes('name is') ||
            m.content.toLowerCase().includes('call me') ||
            m.type === 'PERSON'
        );
        if (nameMem) {
          const match = nameMem.content.match(/(?:name is|call me)\s+([A-Za-z]+)/i);
          if (match && match[1]) {
            setUserName(match[1]);
          }
        }
      }

      if (events && events.length > 0) {
        const topEvent = events[0];
        setContextHint({
          icon: 'flight_takeoff',
          text: `${topEvent.title}${topEvent.locationName ? ` in ${topEvent.locationName}` : ''}`,
        });
      } else if (tasks && tasks.length > 0) {
        const topTask = tasks[0];
        setContextHint({
          icon: 'calendar_today',
          text: `Upcoming: ${topTask.title}`,
        });
      } else if (location && (location.city || location.state)) {
        setContextHint({
          icon: 'my_location',
          text: `Active in ${location.city || location.state}.`,
        });
      } else {
        setContextHint({
          icon: 'blur_on',
          text: 'Ready for your commands.',
        });
      }
    } catch {
      // Keep default context
    }
  };

  const runHealthCheck = async (): Promise<void> => {
    const health = await apiClient.checkHealth();
    const online = Boolean(health);
    setIsOnline(online);
    setJarvisState((prev: JarvisState) => {
      if (!online) return 'OFFLINE';
      if (prev === 'OFFLINE') return 'IDLE';
      return prev;
    });
  };

  React.useEffect(() => {
    runHealthCheck();
    loadDynamicContext();
    adaptiveLocationEngine.start();
    reminderScheduler.syncPendingTasks();
    integrationManager.initialize().catch(() => {});
    appSettingsService.initialize().then((s) => {
      if (s.userName) setUserName(s.userName);
    }).catch(() => {});

    const unsubSettings = appSettingsService.subscribe((s) => {
      if (s.userName) setUserName(s.userName);
    });

    const interval = setInterval(() => {
      runHealthCheck();
    }, 15000);

    return () => {
      clearInterval(interval);
      adaptiveLocationEngine.stop();
      unsubSettings();
    };
  }, []);

  const handleOrbPress = async (): Promise<void> => {
    await toggleVoiceInteraction();
  };

  const handleConfirmAction = async (confirmed: boolean) => {
    const actionId = confirmationState.actionId;
    setConfirmationState((prev) => ({ ...prev, visible: false }));
    try {
      await apiClient.confirmAction(actionId, confirmed);
    } catch {
      // ignore
    }
  };

  const isSpeakingState = jarvisState === 'SPEAKING' && Boolean(assistantSpokenText);
  const isListeningState = jarvisState === 'LISTENING';
  const isThinkingState = jarvisState === 'THINKING' || jarvisState === 'PROCESSING';


  return (
    <View style={styles.screenContainer}>
      {/* Background Atmospheric Digital Air Elements matching Home.html */}
      <View style={styles.atmosphereContainer} pointerEvents="none">
        <View style={styles.atmosphereTopLeft} />
        <View style={styles.atmosphereBottomRight} />
      </View>

      {/* Header matching Home.html & Jarvis Speaking.html */}
      <StatusHeader
        state={jarvisState}
        isOnline={isOnline}
        onRefresh={runHealthCheck}
      />

      {/* Main Immersive Canvas */}
      <View style={styles.mainCanvas}>
        {/* Living Ethereal Voice Orb */}
        <View style={styles.orbWrapper}>
          <EtherealOrb
            state={jarvisState}
            onPress={handleOrbPress}
            audioLevel={recordingLevel}
            size={280}
            showStatusLabel={false}
          />
        </View>

        {/* Dynamic Typography & Context Area */}
        {isSpeakingState ? (
          /* Jarvis Speaking State matching Jarvis Speaking.html */
          <View style={styles.typographyBlock}>
            <Text style={[typography.labelCaps, styles.speakingJarvisTag]}>JARVIS</Text>
            <Text style={[typography.headlineLgMobile, styles.speakingResponseText]}>
              "{assistantSpokenText}"
            </Text>
          </View>
        ) : isListeningState ? (
          /* Listening State Typography */
          <View style={styles.typographyBlock}>
            <Text style={[typography.displayLg, styles.stateHeading]}>
              Listening...
            </Text>
            <Text style={[typography.bodyMd, styles.stateSubtext]}>
              Speak naturally. Tap the button below when done.
            </Text>
          </View>
        ) : isThinkingState ? (
          /* Thinking/Processing State Typography */
          <View style={styles.typographyBlock}>
            <Text style={[typography.displayLg, styles.stateHeading]}>
              Processing...
            </Text>
            <Text style={[typography.bodyMd, styles.stateSubtext]}>
              Synthesizing response through cognition matrix.
            </Text>
          </View>
        ) : (
          /* Ambient Home State Greeting matching Home.html */
          <View style={styles.typographyBlock}>
            <Text style={[typography.displayLg, styles.displayGreeting]}>
              {getGreeting()}
            </Text>

            {/* Dynamic Glass Hint Pill matching Home.html */}
            <GlassCard style={styles.glassHintPill}>
              <Icon
                name={contextHint.icon}
                size={18}
                color={colors.primaryFixed}
                style={{ opacity: 0.85 }}
              />
              <Text style={[typography.bodyMd, styles.contextHintText]}>
                {contextHint.text}
              </Text>
            </GlassCard>

            {/* Earbud Standby Active Status Pill */}
            {earbudSettings.enabled ? (
              <View style={styles.earbudIndicatorBadge}>
                <View style={styles.earbudDotActive} />
                <Icon name="hearing" size={13} color={colors.primaryFixed} />
                <Text style={[typography.labelCaps, styles.earbudIndicatorText]}>
                  EARBUD LINK ACTIVE · SINGLE TAP READY
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Transient Error Notification */}
        {earbudError ? (
          <GlassCard style={styles.errorBox}>
            <Icon name="error" size={16} color={colors.error} />
            <Text style={styles.errorText}>{earbudError}</Text>
          </GlassCard>
        ) : null}
      </View>

      {/* Bottom Voice Interaction Trigger matching Home.html & Jarvis Speaking.html */}
      {isSpeakingState ? (
        <View style={styles.bottomControlZone}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleOrbPress}
            style={styles.stopButtonPill}
          >
            <Icon name="stop_circle" size={18} color={colors.primaryFixed} />
            <Text style={[typography.labelCaps, styles.stopButtonText]}>TAP TO STOP</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleOrbPress}
          style={styles.bottomVoiceTrigger}
        >
          <View style={styles.triggerContent}>
            <View
              style={[
                styles.triggerIconRing,
                isRecording && styles.triggerRingActive,
              ]}
            >
              <Icon
                name={isRecording ? 'stop_circle' : 'graphic_eq'}
                size={28}
                color={colors.primaryFixed}
              />
            </View>
            <Text style={[typography.labelCaps, styles.triggerLabel]}>
              {isRecording ? 'TAP TO COMPLETE' : 'TAP TO SPEAK'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={confirmationState.visible}
        actionId={confirmationState.actionId}
        toolName={confirmationState.toolName}
        riskLevel={confirmationState.riskLevel}
        summary={confirmationState.summary}
        onConfirm={() => handleConfirmAction(true)}
        onCancel={() => handleConfirmAction(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
    justifyContent: 'space-between',
  },
  atmosphereContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  atmosphereTopLeft: {
    position: 'absolute',
    top: '-15%',
    left: '-15%',
    width: '60%',
    height: '60%',
    borderRadius: 9999,
    backgroundColor: 'rgba(125, 244, 255, 0.04)',
  },
  atmosphereBottomRight: {
    position: 'absolute',
    bottom: '-15%',
    right: '-15%',
    width: '60%',
    height: '60%',
    borderRadius: 9999,
    backgroundColor: 'rgba(125, 244, 255, 0.03)',
  },
  mainCanvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  orbWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  typographyBlock: {
    alignItems: 'center',
    textAlign: 'center',
    width: '100%',
    maxWidth: 480,
    gap: 10,
  },
  displayGreeting: {
    color: colors.onSurface,
    textAlign: 'center',
    fontWeight: '300',
    fontSize: 32,
    lineHeight: 40,
  },
  stateHeading: {
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '300',
    fontSize: 32,
    lineHeight: 40,
  },
  stateSubtext: {
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
  },
  glassHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: rounded.full,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    marginTop: 2,
  },
  contextHintText: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
  },
  speakingJarvisTag: {
    color: colors.outlineVariant,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 4,
  },
  speakingResponseText: {
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 34,
    fontSize: 22,
    fontWeight: '400',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderRadius: rounded.md,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
  bottomControlZone: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 24,
    paddingTop: 10,
    zIndex: 20,
  },
  stopButtonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: rounded.full,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(125, 244, 255, 0.2)',
    borderWidth: 1,
  },
  stopButtonText: {
    color: colors.primaryFixed,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  bottomVoiceTrigger: {
    width: '100%',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(125, 244, 255, 0.08)',
    backgroundColor: 'rgba(125, 244, 255, 0.02)',
    zIndex: 20,
  },
  triggerContent: {
    alignItems: 'center',
    gap: 8,
  },
  triggerIconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(125, 244, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(125, 244, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerRingActive: {
    backgroundColor: 'rgba(125, 244, 255, 0.2)',
    borderColor: colors.primaryFixed,
  },
  triggerLabel: {
    color: colors.primaryFixed,
    fontSize: 11,
    letterSpacing: 2,
    opacity: 0.85,
  },
  earbudIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 240, 255, 0.04)',
    borderColor: 'rgba(0, 240, 255, 0.15)',
    borderWidth: 1,
    borderRadius: rounded.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 2,
  },
  earbudDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primaryFixed,
    shadowColor: colors.primaryFixed,
    shadowRadius: 6,
    shadowOpacity: 0.8,
  },
  earbudIndicatorText: {
    color: colors.primaryFixed,
    fontSize: 9,
    letterSpacing: 1.5,
  },
});

