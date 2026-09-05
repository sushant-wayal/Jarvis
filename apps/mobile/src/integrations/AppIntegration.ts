/**
 * AppIntegration
 * Open any app on Android and iOS using direct intent & deep-link cascading.
 * Works without being blocked by Android 11+ package visibility queries.
 */

import { Linking, NativeModules, Platform } from 'react-native';
import { ActionResult } from '@jarvis/shared';
import { APP_DEEP_LINKS, APP_TO_PACKAGE } from './constants';

export class AppIntegration {
  /**
   * Open any app by its friendly or typed name (e.g. 'whatsapp', 'youtube', 'spotify', 'calculator').
   * Employs cascading fallback: native launcher intent -> custom scheme -> registered fallbacks -> generic scheme.
   */
  async openApp(appName: string): Promise<ActionResult> {
    const cleanApp = appName.toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
    if (!cleanApp) {
      return { success: false, error: 'App name cannot be empty.' };
    }

    // 0. On Android, try native package launcher first via Android PackageManager
    const knownPackage = APP_TO_PACKAGE[cleanApp] || (cleanApp.startsWith('com.') ? cleanApp : null);
    if (Platform.OS === 'android' && knownPackage && NativeModules.JarvisNotificationListener?.launchApplication) {
      try {
        const launched = await NativeModules.JarvisNotificationListener.launchApplication(knownPackage);
        if (launched) {
          return { success: true, message: `Opened ${appName}.` };
        }
      } catch {
        // Fall back to URL schemes
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

    // 2. If known package exists on Android, add direct launcher Intent URI
    if (knownPackage && Platform.OS === 'android') {
      candidates.push(
        `intent:#Intent;package=${knownPackage};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`
      );
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
    phoneNumber?: string
  ): Promise<ActionResult> {
    const cleanApp = appName.toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
    const linkConfig = APP_DEEP_LINKS[cleanApp];

    if (linkConfig?.conversation) {
      let conversationUrl = linkConfig.conversation;
      if (phoneNumber) {
        conversationUrl = conversationUrl.replace('{phone}', phoneNumber.replace(/\s+/g, ''));
      } else if (conversationKey) {
        conversationUrl = conversationUrl.replace('{phone}', conversationKey);
        conversationUrl = conversationUrl.replace('{username}', conversationKey);
      }

      try {
        await Linking.openURL(conversationUrl);
        return { success: true, message: `Opened conversation on ${appName}.` };
      } catch {
        // Fall back to opening root
      }
    }

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
