/**
 * ReminderScheduler Service
 * Registers time-based reminders directly with the phone's native hardware AlarmManager
 * using expo-notifications.
 *
 * When the scheduled time arrives (e.g. 9:00 PM), the phone's OS wakes up, vibrates,
 * displays a prominent notification banner, and if earbuds are active, chimes and speaks aloud.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { apiClient } from './apiClient';
import { earbudService } from './earbudService';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class ReminderScheduler {
  private isInitialized = false;
  private notificationListener: { remove: () => void } | null = null;
  private responseListener: { remove: () => void } | null = null;

  /**
   * Initializes notification channels and earbud trigger listeners
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      await this.requestPermissions();

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('jarvis-reminders', {
          name: 'Jarvis Reminders',
          description: 'High-priority timed reminders and task notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#00F0FF',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      }

      // Listen for when a notification fires while app is running / in background
      this.notificationListener = Notifications.addNotificationReceivedListener(
        async (notification) => {
          await this.handleNotificationFired(notification);
        }
      );
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Requests system notification permission
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      return finalStatus === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Schedules a native on-device hardware alarm for an exact timestamp
   */
  async scheduleTaskReminder(
    taskId: string,
    title: string,
    scheduledFor: string | Date,
    description?: string
  ): Promise<string | null> {
    try {
      await this.initialize();

      const targetDate = typeof scheduledFor === 'string' ? new Date(scheduledFor) : scheduledFor;
      const targetTimeMs = targetDate.getTime();
      const nowMs = Date.now();

      // If scheduled time is in the past or invalid, don't schedule
      if (isNaN(targetTimeMs) || targetTimeMs <= nowMs) {
        return null;
      }

      const secondsFromNow = Math.max(1, Math.round((targetTimeMs - nowMs) / 1000));

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Reminder: ${title}`,
          body: description || `It is time: ${title}`,
          data: {
            taskId,
            title,
            description,
            type: 'TIME_REMINDER',
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsFromNow,
          channelId: 'jarvis-reminders',
        },
      });

      return notificationId;
    } catch {
      return null;
    }
  }

  /**
   * Cancels a previously scheduled notification by ID
   */
  async cancelReminder(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
      // ignore
    }
  }

  /**
   * Handles when an alarm/notification triggers:
   * 1. If earbuds are connected or standby is active: chime + speak aloud
   * 2. Mark task completed on brain if online
   */
  private async handleNotificationFired(
    notification: Notifications.Notification
  ): Promise<void> {
    const data = notification.request.content.data;
    const title = (data?.title as string) || notification.request.content.title || 'Reminder';
    const taskId = data?.taskId as string | undefined;

    // 1. Option 3: Earbud Voice Announcement
    const earbudStatus = earbudService.getStatus();
    if (earbudStatus.isStandbyActive || earbudStatus.isConnected) {
      try {
        await earbudService.playWakeChime();

        // Synthesize short speech alert
        const spokenText = `Sir, here is your reminder: ${title}.`;
        const speech = await apiClient.synthesizeSpeech(spokenText);
        if (speech?.audioBase64) {
          const { sound } = await Audio.Sound.createAsync(
            { uri: `data:audio/mp3;base64,${speech.audioBase64}` },
            { shouldPlay: true, volume: 1.0 }
          );
          sound.setOnPlaybackStatusUpdate((st) => {
            if (st.isLoaded && st.didJustFinish) {
              sound.unloadAsync().catch(() => {});
            }
          });
        }
      } catch {
        // Fallback: system chime
      }
    }

    // 2. Mark task as COMPLETED on brain
    if (taskId) {
      try {
        await apiClient.updateTask(taskId, { status: 'COMPLETED' });
      } catch {
        // Safe fallback if offline
      }
    }
  }

  /**
   * Syncs any active tasks from the brain with future nextRunAt timestamps
   * so alarms persist across reboots or fresh app launches.
   */
  async syncPendingTasks(): Promise<void> {
    try {
      const activeTasks = await apiClient.getTasks('ACTIVE');
      const now = Date.now();

      for (const task of activeTasks) {
        if (task.nextRunAt) {
          const runTime = new Date(task.nextRunAt).getTime();
          if (runTime > now) {
            await this.scheduleTaskReminder(task.id, task.title, task.nextRunAt, task.description);
          }
        }
      }
    } catch {
      // fallback
    }
  }
}

export const reminderScheduler = new ReminderScheduler();
