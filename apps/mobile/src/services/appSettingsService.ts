/**
 * appSettingsService.ts
 * Centralized persistence for user app settings and UI preferences.
 * Backed by AsyncStorage with in-memory caching for instant access.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './apiClient';

export type ResponseProtocol = 'Concise' | 'Detailed Analysis' | 'Conversational';

export interface AppSettings {
  userName: string;
  responseProtocol: ResponseProtocol;
  serverUrl: string;
  autoSpeak: boolean;
  locationEnabled: boolean;
}

const STORAGE_KEY = 'jarvis:app_settings';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  userName: 'Sushant',
  responseProtocol: 'Concise',
  serverUrl: apiClient.getBaseUrl() || 'https://brainofjarvis.vercel.app/api/v1',
  autoSpeak: true,
  locationEnabled: true,
};

type SettingsListener = (settings: AppSettings) => void;

class AppSettingsService {
  private settings: AppSettings = { ...DEFAULT_APP_SETTINGS };
  private initialized = false;
  private listeners: Set<SettingsListener> = new Set();

  public async initialize(): Promise<AppSettings> {
    if (this.initialized) return { ...this.settings };

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        this.settings = {
          ...DEFAULT_APP_SETTINGS,
          ...parsed,
        };
      }
    } catch {
      this.settings = { ...DEFAULT_APP_SETTINGS };
    }

    if (this.settings.serverUrl) {
      apiClient.setBaseUrl(this.settings.serverUrl);
    }

    this.initialized = true;
    this.notify();
    return { ...this.settings };
  }

  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.settings = {
      ...this.settings,
      ...partial,
    };

    if (partial.serverUrl) {
      apiClient.setBaseUrl(partial.serverUrl);
    }

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Non-critical persistence error
    }

    this.notify();
    return { ...this.settings };
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const copy = { ...this.settings };
    for (const listener of this.listeners) {
      try {
        listener(copy);
      } catch {
        // ignore listener errors
      }
    }
  }
}

export const appSettingsService = new AppSettingsService();
