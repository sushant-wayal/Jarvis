/**
 * Safe shim for warnOfExpoGoPushUsage in Expo Go.
 * In SDK 53+, expo-notifications throws an unhandled exception on Android in Expo Go
 * when evaluating push token registration modules.
 * This shim downgrades the throw to a non-fatal console warning so local notifications
 * (alarms, timers, chimes, media notifications) and Expo Router routes initialize cleanly.
 */
import { isRunningInExpoGo } from 'expo';

let didWarn = false;

export const warnOfExpoGoPushUsage = () => {
  if (isRunningInExpoGo() && !didWarn) {
    didWarn = true;
    console.warn(
      '[expo-notifications] Remote push notifications are disabled in Expo Go. Local scheduled notifications and audio channels remain active.'
    );
  }
};
