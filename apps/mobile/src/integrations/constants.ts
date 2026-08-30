/**
 * Integration Constants
 * Central registry of app identifiers, deep-link schemes, and storage keys.
 * Add new apps here — nowhere else.
 */

/** Android package → friendly app name mapping */
export const PACKAGE_TO_APP: Record<string, string> = {
  'com.whatsapp': 'whatsapp',
  'com.whatsapp.w4b': 'whatsapp_business',
  'com.instagram.android': 'instagram',
  'org.telegram.messenger': 'telegram',
  'com.android.mms': 'sms',
  'com.google.android.apps.messaging': 'sms',
  'com.samsung.android.messaging': 'sms',
  'com.google.android.gm': 'gmail',
  'com.discord': 'discord',
  'com.Slack': 'slack',
  'com.facebook.orca': 'messenger',
  'com.snapchat.android': 'snapchat',
  'com.twitter.android': 'twitter',
};

/** Friendly app name → Android package name */
export const APP_TO_PACKAGE: Record<string, string> = Object.fromEntries(
  Object.entries(PACKAGE_TO_APP).map(([pkg, app]) => [app, pkg])
);

/** Deep-link schemes for opening apps (Android + iOS where applicable) */
export const APP_DEEP_LINKS: Record<string, {
  android: string;
  ios?: string;
  /** Deep-link pattern for opening a specific conversation. {phone} will be replaced. */
  conversation?: string;
}> = {
  whatsapp: {
    android: 'whatsapp://send',
    ios: 'whatsapp://send',
    conversation: 'whatsapp://send?phone={phone}',
  },
  whatsapp_business: {
    android: 'whatsapp://send',
    conversation: 'whatsapp://send?phone={phone}',
  },
  instagram: {
    android: 'instagram://direct-inbox',
    ios: 'instagram://direct-inbox',
  },
  telegram: {
    android: 'tg://resolve?domain={username}',
    ios: 'tg://resolve?domain={username}',
    conversation: 'tg://resolve?domain={username}',
  },
  gmail: {
    android: 'googlegmail://co',
    ios: 'googlegmail://co',
  },
  discord: {
    android: 'discord://',
  },
  slack: {
    android: 'slack://',
  },
  messenger: {
    android: 'fb-messenger://',
    ios: 'fb-messenger://',
  },
};

/** AsyncStorage keys */
export const STORAGE_KEYS = {
  CONTACT_ALIASES: 'jarvis:contact_aliases',
  NOTIFICATION_STORE: 'jarvis:notification_store',
  NOTIFICATION_SETTINGS: 'jarvis:notification_settings',
  INTEGRATION_SETTINGS: 'jarvis:integration_settings',
} as const;

/** Apps observed by the notification listener (user can toggle these) */
export const OBSERVABLE_APPS = [
  { id: 'whatsapp',   label: 'WhatsApp',  packageName: 'com.whatsapp' },
  { id: 'instagram',  label: 'Instagram', packageName: 'com.instagram.android' },
  { id: 'telegram',   label: 'Telegram',  packageName: 'org.telegram.messenger' },
  { id: 'sms',        label: 'Messages',  packageName: 'com.google.android.apps.messaging' },
  { id: 'gmail',      label: 'Gmail',     packageName: 'com.google.android.gm' },
  { id: 'discord',    label: 'Discord',   packageName: 'com.discord' },
  { id: 'slack',      label: 'Slack',     packageName: 'com.Slack' },
  { id: 'messenger',  label: 'Messenger', packageName: 'com.facebook.orca' },
] as const;

export type ObservableAppId = typeof OBSERVABLE_APPS[number]['id'];

/** Maximum notifications kept in the local store */
export const MAX_NOTIFICATION_STORE_SIZE = 100;

/** Default retention window in milliseconds (24 hours) */
export const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Max events sent to brain per request */
export const MAX_CONTEXT_EVENTS = 20;
