/**
 * expo-notifications Expo Go Safe Shim
 *
 * In SDK 53+, expo-notifications has multiple sub-modules that call
 * `requireNativeModule(...)` at import time. In Expo Go for Android, these
 * native modules don't exist and throw fatal errors that prevent ALL routes
 * from loading. This shim intercepts those modules and provides safe no-ops.
 *
 * Native modules affected (all throw "Cannot find native module 'X'" in Expo Go):
 *   - ExpoTopicSubscriptionModule   (TopicSubscriptionModule.android.js)
 *   - ExpoPushTokenManager          (PushTokenManager.native.js)
 *   - NotificationsServerRegistrationModule (ServerRegistrationModule.native.js)
 *   - ExpoNotificationsEmitter      (NotificationsEmitterModule.native.js)
 *   - ExpoNotificationsHandlerModule (NotificationsHandlerModule.native.js)
 *   - ExpoNotificationScheduler     (NotificationScheduler.native.js)
 *   - ExpoNotificationPresenter     (NotificationPresenterModule.native.js)
 *   - ExpoNotificationCategoriesModule (NotificationCategoriesModule.native.js)
 *   - ExpoBackgroundNotificationTasksModule (BackgroundNotificationTasksModule.native.js)
 *   - ExpoBadgeModule               (BadgeModule.native.js)
 *
 * This shim replaces the entire expo-notifications module with safe implementations
 * that allow the app UI to boot cleanly in Expo Go. Local notifications, channel
 * setup, and scheduling will silently no-op. Full functionality is preserved in
 * standalone APK builds where native modules are present.
 */

const noop = () => {};
const noopAsync = async () => {};
const noopPromise = () => Promise.resolve(null);
const noopListener = () => ({ remove: noop });

// ─── Android Importance Levels ─────────────────────────────────────────────
const AndroidImportance = {
  NONE: 0,
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
  MAX: 5,
};

// ─── Android Notification Priority ─────────────────────────────────────────
const AndroidNotificationPriority = {
  MIN: 'min',
  LOW: 'low',
  DEFAULT: 'default',
  HIGH: 'high',
  MAX: 'max',
};

// ─── Android Notification Visibility ───────────────────────────────────────
const AndroidNotificationVisibility = {
  UNKNOWN: 0,
  PUBLIC: 1,
  PRIVATE: 2,
  SECRET: 3,
};

// ─── Schedulable Trigger Types ──────────────────────────────────────────────
const SchedulableTriggerInputTypes = {
  DATE: 'date',
  TIME_INTERVAL: 'timeInterval',
  CALENDAR: 'calendar',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  YEARLY: 'yearly',
};

module.exports = {
  // ── Constants ──────────────────────────────────────────────────────────────
  AndroidImportance,
  AndroidNotificationPriority,
  AndroidNotificationVisibility,
  SchedulableTriggerInputTypes,

  // ── Permission APIs ────────────────────────────────────────────────────────
  getPermissionsAsync: async () => ({
    status: 'undetermined',
    expires: 'never',
    granted: false,
    canAskAgain: true,
  }),
  requestPermissionsAsync: async () => ({
    status: 'undetermined',
    expires: 'never',
    granted: false,
    canAskAgain: true,
  }),

  // ── Notification Handler ───────────────────────────────────────────────────
  setNotificationHandler: noop,

  // ── Schedule / Cancel ──────────────────────────────────────────────────────
  scheduleNotificationAsync: noopPromise,
  cancelScheduledNotificationAsync: noopAsync,
  cancelAllScheduledNotificationsAsync: noopAsync,
  getAllScheduledNotificationsAsync: async () => [],
  getNextTriggerDateAsync: async () => null,

  // ── Notification Channels (Android) ───────────────────────────────────────
  setNotificationChannelAsync: noopPromise,
  getNotificationChannelAsync: async () => null,
  getNotificationChannelsAsync: async () => [],
  deleteNotificationChannelAsync: noopAsync,
  setNotificationChannelGroupAsync: noopPromise,
  getNotificationChannelGroupAsync: async () => null,
  getNotificationChannelGroupsAsync: async () => [],
  deleteNotificationChannelGroupAsync: noopAsync,

  // ── Notification Categories ────────────────────────────────────────────────
  setNotificationCategoryAsync: noopPromise,
  getNotificationCategoriesAsync: async () => [],
  deleteNotificationCategoryAsync: noopAsync,

  // ── Presented Notifications ────────────────────────────────────────────────
  getPresentedNotificationsAsync: async () => [],
  dismissNotificationAsync: noopAsync,
  dismissAllNotificationsAsync: noopAsync,

  // ── Listeners ─────────────────────────────────────────────────────────────
  addNotificationReceivedListener: noopListener,
  addNotificationsDroppedListener: noopListener,
  addNotificationResponseReceivedListener: noopListener,
  addPushTokenListener: noopListener,
  useLastNotificationResponse: () => undefined,

  // ── Push Token / Remote Notifications (removed from Expo Go in SDK 53) ─────
  getDevicePushTokenAsync: async () => {
    throw new Error('[expo-notifications] Remote push tokens are not available in Expo Go. Use a development build.');
  },
  getExpoPushTokenAsync: async () => {
    throw new Error('[expo-notifications] Expo push tokens are not available in Expo Go. Use a development build.');
  },
  unregisterForNotificationsAsync: noopAsync,
  subscribeToTopicAsync: noopAsync,
  unsubscribeFromTopicAsync: noopAsync,

  // ── Badge ──────────────────────────────────────────────────────────────────
  getBadgeCountAsync: async () => 0,
  setBadgeCountAsync: async () => false,

  // ── Background Tasks ───────────────────────────────────────────────────────
  registerTaskAsync: noopAsync,
  unregisterTaskAsync: noopAsync,
  BackgroundNotificationTaskResult: {
    NewData: 'newData',
    NoData: 'noData',
    Failed: 'failed',
  },

  // ── Auto Server Registration ───────────────────────────────────────────────
  setAutoServerRegistrationEnabledAsync: noopAsync,
};
