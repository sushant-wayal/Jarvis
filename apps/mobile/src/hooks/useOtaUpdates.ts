import * as Updates from 'expo-updates';
import * as React from 'react';
import { Alert, Platform } from 'react-native';

export interface UpdateInfo {
  isChecking: boolean;
  isDownloading: boolean;
  lastChecked: Date | null;
}

/**
 * useOtaUpdates — silently checks for and applies OTA JS bundle updates.
 *
 * Behaviour:
 *  - On app launch: checks for an available update in the background
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

  React.useEffect(() => {
    // expo-updates is disabled in Expo Go / dev mode — skip silently
    if (__DEV__ || !Updates.isEnabled) return;
    // Not relevant on web
    if (Platform.OS === 'web') return;

    let cancelled = false;

    const checkAndApply = async () => {
      try {
        setIsChecking(true);
        const result = await Updates.checkForUpdateAsync();
        setLastChecked(new Date());
        setIsChecking(false);

        if (!result.isAvailable || cancelled) return;

        setIsDownloading(true);
        await Updates.fetchUpdateAsync();
        setIsDownloading(false);

        if (cancelled) return;

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
      }
    };

    // Small delay so the app UI renders first before we hit the network
    const timer = setTimeout(checkAndApply, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { isChecking, isDownloading, lastChecked };
}
