import * as Updates from 'expo-updates';
import * as React from 'react';
import { Alert, AppState, AppStateStatus, Platform } from 'react-native';

export interface UpdateInfo {
  isChecking: boolean;
  isDownloading: boolean;
  lastChecked: Date | null;
}

/**
 * useOtaUpdates — silently checks for and applies OTA JS bundle updates.
 *
 * Behaviour:
 *  - On app launch: checks for an available update after a 3s delay
 *  - On app foreground resume: re-checks if last check was >30 minutes ago
 *  - If found: downloads silently, then shows a non-blocking alert asking
 *    the user to restart to apply it
 *  - Does nothing in development (Expo Go / dev server) — only runs in
 *    production/preview builds where expo-updates is active
 *  - Never throws or disrupts the app — all errors are silently swallowed
 */
export function useOtaUpdates(): UpdateInfo {
  const [isChecking, setIsChecking] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [lastChecked, setLastChecked] = React.useState<Date | null>(null);
  const lastCheckedRef = React.useRef<Date | null>(null);
  const isBusyRef = React.useRef(false);

  const checkAndApply = React.useCallback(async () => {
    // expo-updates is disabled in Expo Go / dev mode — skip silently
    if (__DEV__ || !Updates.isEnabled) return;
    if (Platform.OS === 'web') return;
    // Guard against concurrent checks
    if (isBusyRef.current) return;

    isBusyRef.current = true;
    try {
      setIsChecking(true);
      const result = await Updates.checkForUpdateAsync();
      const now = new Date();
      lastCheckedRef.current = now;
      setLastChecked(now);
      setIsChecking(false);

      if (!result.isAvailable) return;

      setIsDownloading(true);
      await Updates.fetchUpdateAsync();
      setIsDownloading(false);

      // Ask user to restart — non-blocking, they can dismiss
      Alert.alert(
        '✨ Jarvis Updated',
        'A new version of Jarvis is ready. Restart now to apply it.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Restart Now',
            onPress: () => Updates.reloadAsync().catch(() => {}),
          },
        ],
        { cancelable: true }
      );
    } catch {
      // Silently ignore — network error, no update, etc.
      setIsChecking(false);
      setIsDownloading(false);
    } finally {
      isBusyRef.current = false;
    }
  }, []);

  // Check on cold launch (after 3s delay so the UI renders first)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      void checkAndApply();
    }, 3000);
    return () => clearTimeout(timer);
  }, [checkAndApply]);

  // Re-check whenever the app comes back to the foreground,
  // but at most once every 30 minutes to avoid hammering the server.
  // This ensures updates published after the launch check are caught.
  React.useEffect(() => {
    const FOREGROUND_RECHECK_MS = 30 * 60 * 1000;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      const last = lastCheckedRef.current;
      const elapsed = last ? Date.now() - last.getTime() : Infinity;
      if (elapsed >= FOREGROUND_RECHECK_MS) {
        void checkAndApply();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [checkAndApply]);

  return { isChecking, isDownloading, lastChecked };
}
