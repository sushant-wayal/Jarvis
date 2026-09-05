/**
 * AppIntegration
 * Open any app on Android and iOS using direct intent & deep-link cascading.
 * Works without being blocked by Android 11+ package visibility queries.
 */

import { Linking, NativeModules, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { ActionResult } from '@jarvis/shared';
import { APP_DEEP_LINKS, APP_PACKAGE_CANDIDATES, APP_TO_PACKAGE } from './constants';

export class AppIntegration {
  /**
   * Open any app by its friendly or typed name (e.g. 'whatsapp', 'youtube', 'spotify', 'calculator').
   * Employs cascading fallback: native launcher intent -> custom scheme -> registered fallbacks -> generic scheme.
   */
  async openApp(appName: string): Promise<ActionResult> {
    const raw = appName.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    if (!raw) {
      return { success: false, error: 'App name cannot be empty.' };
    }

    // Normalized alias matching for common voice typos and colloquial names
    let cleanApp = raw;
    if (raw.includes('whatsapp') || raw.includes('watsapp') || raw.includes('wjatsapp') || raw.includes('wa')) {
      cleanApp = 'whatsapp';
    } else if (raw.includes('instagram') || raw.includes('insta')) {
      cleanApp = 'instagram';
    } else if (raw.includes('telegram')) {
      cleanApp = 'telegram';
    } else if (raw.includes('youtube') || raw.includes('yt')) {
      cleanApp = 'youtube';
    } else if (raw.includes('spotify')) {
      cleanApp = 'spotify';
    } else if (raw.includes('chrome') || raw.includes('browser')) {
      cleanApp = 'chrome';
    } else if (raw.includes('calc')) {
      cleanApp = 'calculator';
    } else if (raw.includes('camera')) {
      cleanApp = 'camera';
    } else if (raw.includes('clock') || raw.includes('alarm')) {
      cleanApp = 'clock';
    } else if (raw.includes('map')) {
      cleanApp = 'maps';
    } else if (raw.includes('setting')) {
      cleanApp = 'settings';
    } else if (raw.includes('message') || raw.includes('sms')) {
      cleanApp = 'sms';
    }

    // Collect all candidate package names for this app in priority order
    const packagesToTry: string[] = [];
    if (APP_PACKAGE_CANDIDATES[cleanApp]) {
      packagesToTry.push(...APP_PACKAGE_CANDIDATES[cleanApp]);
    }
    if (APP_TO_PACKAGE[cleanApp] && !packagesToTry.includes(APP_TO_PACKAGE[cleanApp])) {
      packagesToTry.push(APP_TO_PACKAGE[cleanApp]);
    }
    if (cleanApp.startsWith('com.') && !packagesToTry.includes(cleanApp)) {
      packagesToTry.push(cleanApp);
    }

    // 0. On Android, try native package launcher first via Android PackageManager
    if (Platform.OS === 'android' && packagesToTry.length > 0) {
      for (const pkg of packagesToTry) {
        if (NativeModules.JarvisEarbudModule?.launchApp) {
          try {
            const launched = await NativeModules.JarvisEarbudModule.launchApp(pkg);
            if (launched) {
              return { success: true, message: `Opened ${appName}.` };
            }
          } catch {
            // Fall through
          }
        }
        if (NativeModules.JarvisNotificationListener?.launchApplication) {
          try {
            const launched = await NativeModules.JarvisNotificationListener.launchApplication(pkg);
            if (launched) {
              return { success: true, message: `Opened ${appName}.` };
            }
          } catch {
            // Fall through
          }
        }

        // Standard Android package launcher (works in Expo Go & standalone APK)
        try {
          await IntentLauncher.openApplication(pkg);
          return { success: true, message: `Opened ${appName}.` };
        } catch {
          // Fall through to next candidate or URL scheme
        }
      }
    }

    const candidates: string[] = [];

    // 1. Check registered deep-link configs
    const linkConfig = APP_DEEP_LINKS[cleanApp];
    if (linkConfig) {
      if (Platform.OS === 'ios' && linkConfig.ios) {
        candidates.push(linkConfig.ios);
      } else {
        candidates.push(linkConfig.android);
      }
      if (linkConfig.fallbacks) {
        candidates.push(...linkConfig.fallbacks);
      }
    }

    // 2. Direct launcher Intent URIs for candidate packages
    if (Platform.OS === 'android') {
      for (const pkg of packagesToTry) {
        candidates.push(
          `intent:#Intent;package=${pkg};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`
        );
      }
    }

    // 3. Generic custom scheme e.g. "youtube://", "spotify://", "uber://"
    candidates.push(`${cleanApp}://`);

    // 4. Android system categories for special system apps
    if (Platform.OS === 'android') {
      if (cleanApp.includes('calc')) {
        candidates.push('intent:#Intent;category=android.intent.category.APP_CALCULATOR;end');
      } else if (cleanApp.includes('camera')) {
        candidates.push('intent:#Intent;action=android.media.action.IMAGE_CAPTURE;end');
      } else if (cleanApp.includes('clock') || cleanApp.includes('alarm')) {
        candidates.push('intent:#Intent;category=android.intent.category.APP_ALARM;end');
      } else if (cleanApp.includes('setting')) {
        candidates.push('intent:#Intent;action=android.settings.SETTINGS;end');
      } else if (cleanApp.includes('map')) {
        candidates.push('geo:0,0');
      }

      // Standard Android package name heuristics
      candidates.push(
        `intent:#Intent;package=com.${cleanApp};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`,
        `intent:#Intent;package=com.google.android.${cleanApp};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`
      );
    }

    // 5. Try each candidate URL sequentially without blocking on canOpenURL
    for (const url of candidates) {
      try {
        await Linking.openURL(url);
        return { success: true, message: `Opened ${appName}.` };
      } catch {
        // Try next candidate in the chain
      }
    }

    return {
      success: false,
      error: `Unable to open "${appName}". The application may not be installed.`,
    };
  }

  /**
   * Open a specific conversation inside an app.
   */
  async openConversation(
    appName: string,
    conversationKey?: string,
    phoneNumber?: string,
    text?: string
  ): Promise<ActionResult> {
    const cleanApp = appName.toLowerCase().replace(/[^a-z0-9_]/g, '').trim();

    // Clean phone number
    const cleanPhone = phoneNumber ? phoneNumber.replace(/[^0-9+]/g, '').replace(/^\+/, '') : undefined;
    const hasValidPhone = Boolean(cleanPhone && cleanPhone.length >= 7);

    if (cleanApp === 'whatsapp' || cleanApp === 'whatsapp_business') {
      const candidates: string[] = [];
      if (hasValidPhone) {
        const textParam = text ? `&text=${encodeURIComponent(text)}` : '';
        candidates.push(
          `whatsapp://send?phone=${cleanPhone}${textParam}`,
          `https://api.whatsapp.com/send?phone=${cleanPhone}${textParam}`,
          `https://wa.me/${cleanPhone}${text ? `?text=${encodeURIComponent(text)}` : ''}`
        );
      } else if (text) {
        // No phone number known: open WhatsApp share composer with pre-filled text so user can pick recipient
        candidates.push(
          `whatsapp://send?text=${encodeURIComponent(text)}`,
          `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
        );
      } else {
        return this.openApp(appName);
      }

      for (const url of candidates) {
        try {
          await Linking.openURL(url);
          return { success: true, message: `Opened ${appName}.` };
        } catch {
          // Try next candidate
        }
      }
      return this.openApp(appName);
    }

    if (cleanApp === 'telegram') {
      const candidates: string[] = [];
      if (conversationKey && !conversationKey.includes('{')) {
        candidates.push(`tg://resolve?domain=${encodeURIComponent(conversationKey)}`);
      } else if (hasValidPhone) {
        candidates.push(`https://t.me/+${cleanPhone}`);
      }
      if (text) {
        candidates.push(`tg://msg?text=${encodeURIComponent(text)}`);
      }
      for (const url of candidates) {
        try {
          await Linking.openURL(url);
          return { success: true, message: `Opened conversation on Telegram.` };
        } catch {
          // Try next
        }
      }
      return this.openApp(appName);
    }

    // Generic fallback for other apps with registered APP_DEEP_LINKS
    const linkConfig = APP_DEEP_LINKS[cleanApp];
    if (linkConfig?.conversation) {
      let conversationUrl = linkConfig.conversation;
      if (hasValidPhone && cleanPhone) {
        conversationUrl = conversationUrl.replace('{phone}', cleanPhone);
      }
      if (conversationKey && !conversationKey.includes('{')) {
        conversationUrl = conversationUrl.replace('{username}', conversationKey);
      }

      // CRITICAL: NEVER open a URL that still contains literal template variables like {phone}
      if (!conversationUrl.includes('{phone}') && !conversationUrl.includes('{username}')) {
        try {
          await Linking.openURL(conversationUrl);
          return { success: true, message: `Opened conversation on ${appName}.` };
        } catch {
          // Fall through to opening root
        }
      }
    }

    return this.openApp(appName);
  }

  /**
   * Play a song, track, artist, playlist, or video directly on Spotify, YouTube, or YouTube Music.
   * Leverages Android MEDIA_PLAY_FROM_SEARCH for instant playback.
   */
  async playMedia(
    query: string,
    appName = 'spotify',
    videoId?: string
  ): Promise<ActionResult> {
    const cleanApp = appName.toLowerCase().trim();
    const cleanQuery = query.trim();

    // ── 1. Spotify Direct Playback ──────────────────────────────────────────
    if (cleanApp.includes('spotify')) {
      // 1. Direct Spotify URI schemes (guaranteed 1-tap open into Spotify with zero Android chooser dialogs)
      const spotifyUrls = [
        `spotify:search:${encodeURIComponent(cleanQuery)}`,
        `https://open.spotify.com/search/${encodeURIComponent(cleanQuery)}`,
      ];
      for (const url of spotifyUrls) {
        try {
          await Linking.openURL(url);
          return { success: true, message: `Playing "${cleanQuery}" on Spotify.` };
        } catch {
          // Try next
        }
      }

      // 2. Direct Spotify explicit Intent (only with explicit Spotify package and launcher class)
      if (Platform.OS === 'android') {
        try {
          await IntentLauncher.startActivityAsync('android.media.action.MEDIA_PLAY_FROM_SEARCH', {
            packageName: 'com.spotify.music',
            className: 'com.spotify.mobile.android.ui.Launcher',
            extra: {
              'query': cleanQuery,
              'android.intent.extra.focus': 'vnd.android.cursor.item/*',
              'android.intent.extra.title': cleanQuery,
              'SearchManager.QUERY': cleanQuery,
            },
          });
          return { success: true, message: `Playing "${cleanQuery}" on Spotify.` };
        } catch {
          // Fall through
        }
      }

      return this.openApp('spotify');
    }

    // ── 2. YouTube & YouTube Music Playback ──────────────────────────────────
    if (cleanApp.includes('youtube')) {
      // If a specific video ID was provided or resolved, open it directly to start playing instantly!
      if (videoId) {
        const directUrls = [
          `vnd.youtube:${videoId}`,
          `https://www.youtube.com/watch?v=${videoId}`,
        ];
        for (const url of directUrls) {
          try {
            await Linking.openURL(url);
            return { success: true, message: `Playing "${cleanQuery}" on YouTube.` };
          } catch {
            // Try next
          }
        }
      }

      // If YouTube Music is targeted or preferred:
      if (cleanApp.includes('music') && Platform.OS === 'android') {
        try {
          await IntentLauncher.startActivityAsync('android.media.action.MEDIA_PLAY_FROM_SEARCH', {
            packageName: 'com.google.android.apps.youtube.music',
            className: 'com.google.android.apps.youtube.music.activities.MusicActivity',
            extra: {
              'query': cleanQuery,
              'android.intent.extra.focus': 'vnd.android.cursor.item/*',
              'android.intent.extra.title': cleanQuery,
            },
          });
          return { success: true, message: `Playing "${cleanQuery}" on YouTube Music.` };
        } catch {
          // Fall through
        }
      }

      // Standard YouTube App Search & Play links
      const ytCandidates = [
        `vnd.youtube://search?q=${encodeURIComponent(cleanQuery)}`,
        `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`,
      ];
      for (const url of ytCandidates) {
        try {
          await Linking.openURL(url);
          return { success: true, message: `Playing "${cleanQuery}" on YouTube.` };
        } catch {
          // Try next
        }
      }
      return this.openApp('youtube');
    }

    // Default fallback: open the requested app
    return this.openApp(appName);
  }

  /** Open a tel: or https: URL directly */
  async openUrl(url: string): Promise<ActionResult> {
    try {
      await Linking.openURL(url);
      return { success: true, message: `Opened ${url}.` };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : `Failed to open ${url}.`,
      };
    }
  }

  /** Check if an app's deep link can be resolved */
  async isAppInstalled(appName: string): Promise<boolean> {
    const cleanApp = appName.toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
    const linkConfig = APP_DEEP_LINKS[cleanApp];
    if (!linkConfig) return false;

    const url = Platform.OS === 'ios' && linkConfig.ios ? linkConfig.ios : linkConfig.android;
    try {
      return await Linking.canOpenURL(url);
    } catch {
      return false;
    }
  }

  /** List which registered apps appear to be installed */
  async getInstalledApps(): Promise<string[]> {
    const results = await Promise.all(
      Object.keys(APP_DEEP_LINKS).map(async (app) => ({
        app,
        installed: await this.isAppInstalled(app),
      }))
    );
    return results.filter((r) => r.installed).map((r) => r.app);
  }
}

export const appIntegration = new AppIntegration();
