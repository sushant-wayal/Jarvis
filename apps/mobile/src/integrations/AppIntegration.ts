/**
 * AppIntegration
 * Open apps and deep-link into conversations using Android Linking.
 * Works in Expo Go and APK builds.
 */

import { Linking, Platform } from 'react-native';
import { ActionResult } from '@jarvis/shared';
import { APP_DEEP_LINKS, APP_TO_PACKAGE } from './constants';

export class AppIntegration {
  /**
   * Open an app by its friendly name ('whatsapp', 'instagram', etc.).
   * Uses the registered deep-link scheme; falls back to Play Store URL on Android.
   */
  async openApp(appName: string): Promise<ActionResult> {
    const normalizedApp = appName.toLowerCase().trim();
    const linkConfig = APP_DEEP_LINKS[normalizedApp];

    if (!linkConfig) {
      return {
        success: false,
        error: `No deep-link scheme registered for "${appName}".`,
      };
    }

    const url = Platform.OS === 'ios' && linkConfig.ios
      ? linkConfig.ios
      : linkConfig.android;

    return this.tryOpenUrl(url, normalizedApp);
  }

  /**
   * Open a specific conversation inside an app.
   * Falls back to opening the app root if the conversation link is unavailable.
   */
  async openConversation(
    appName: string,
    conversationKey?: string,
    phoneNumber?: string,
  ): Promise<ActionResult> {
    const normalizedApp = appName.toLowerCase().trim();
    const linkConfig = APP_DEEP_LINKS[normalizedApp];

    if (!linkConfig) {
      return {
        success: false,
        error: `No deep-link scheme registered for "${appName}".`,
      };
    }

    // Build conversation-specific URL
    if (linkConfig.conversation) {
      let conversationUrl = linkConfig.conversation;
      if (phoneNumber) {
        conversationUrl = conversationUrl.replace('{phone}', phoneNumber.replace(/\s+/g, ''));
      } else if (conversationKey) {
        conversationUrl = conversationUrl.replace('{phone}', conversationKey);
        conversationUrl = conversationUrl.replace('{username}', conversationKey);
      }

      const result = await this.tryOpenUrl(conversationUrl, normalizedApp);
      if (result.success) return result;

      // Fallback: open app root
      return this.openApp(appName);
    }

    // App has no conversation deep-link; open the root
    return this.openApp(appName);
  }

  /** Open a tel: or https: URL directly */
  async openUrl(url: string): Promise<ActionResult> {
    return this.tryOpenUrl(url, url);
  }

  private async tryOpenUrl(url: string, label: string): Promise<ActionResult> {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        return {
          success: false,
          error: `Cannot open "${label}" — app may not be installed.`,
        };
      }
      await Linking.openURL(url);
      return { success: true, message: `Opened ${label}.` };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : `Failed to open ${label}.`,
      };
    }
  }

  /** Check if an app's deep link can be resolved (i.e., installed) */
  async isAppInstalled(appName: string): Promise<boolean> {
    const normalizedApp = appName.toLowerCase().trim();
    const linkConfig = APP_DEEP_LINKS[normalizedApp];
    if (!linkConfig) return false;

    const url = Platform.OS === 'ios' && linkConfig.ios
      ? linkConfig.ios
      : linkConfig.android;

    try {
      return Linking.canOpenURL(url);
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
