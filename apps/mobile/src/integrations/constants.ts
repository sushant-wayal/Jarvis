/**
 * Integration Constants
 * Central registry of app identifiers, deep-link schemes, and storage keys.
 */

/** Android package → friendly app name mapping */
export const PACKAGE_TO_APP: Record<string, string> = {
  // Messaging & Social
  'com.whatsapp': 'whatsapp',
  'com.whatsapp.w4b': 'whatsapp',
  'com.instagram.android': 'instagram',
  'org.telegram.messenger': 'telegram',
  'com.facebook.orca': 'messenger',
  'com.discord': 'discord',
  'com.Slack': 'slack',
  'com.snapchat.android': 'snapchat',
  'com.twitter.android': 'twitter',
  'com.linkedin.android': 'linkedin',
  
  // Media & Video
  'com.google.android.youtube': 'youtube',
  'com.spotify.music': 'spotify',
  'com.netflix.mediaclient': 'netflix',
  'com.amazon.avod.thirdpartyclient': 'prime_video',

  // Google & Tools
  'com.android.chrome': 'chrome',
  'com.google.android.gm': 'gmail',
  'com.google.android.apps.maps': 'maps',
  'com.google.android.calculator': 'calculator',
  'com.google.android.deskclock': 'clock',
  'com.google.android.calendar': 'calendar',
  'com.google.android.apps.photos': 'photos',
  
  // System / SMS
  'com.android.mms': 'sms',
  'com.google.android.apps.messaging': 'sms',
  'com.samsung.android.messaging': 'sms',

  // Rides & Food & Shopping
  'com.ubercab': 'uber',
  'com.olacabs.customer': 'ola',
  'in.swiggy.android': 'swiggy',
  'com.application.zomato': 'zomato',
  'in.amazon.mShop.android.shopping': 'amazon',
  'com.flipkart.android': 'flipkart',

  // Payments & Finance
  'com.phonepe.app': 'phonepe',
  'com.google.android.apps.nbu.paisa.user': 'gpay',
  'net.one97.paytm': 'paytm',
};

/** Friendly app name → Android package name (explicitly ordered with primary consumer packages first) */
export const APP_TO_PACKAGE: Record<string, string> = {
  whatsapp: 'com.whatsapp',
  whatsapp_business: 'com.whatsapp.w4b',
  instagram: 'com.instagram.android',
  telegram: 'org.telegram.messenger',
  messenger: 'com.facebook.orca',
  discord: 'com.discord',
  slack: 'com.Slack',
  snapchat: 'com.snapchat.android',
  twitter: 'com.twitter.android',
  x: 'com.twitter.android',
  linkedin: 'com.linkedin.android',
  youtube: 'com.google.android.youtube',
  spotify: 'com.spotify.music',
  netflix: 'com.netflix.mediaclient',
  prime_video: 'com.amazon.avod.thirdpartyclient',
  chrome: 'com.android.chrome',
  gmail: 'com.google.android.gm',
  maps: 'com.google.android.apps.maps',
  calculator: 'com.google.android.calculator',
  clock: 'com.google.android.deskclock',
  calendar: 'com.google.android.calendar',
  photos: 'com.google.android.apps.photos',
  sms: 'com.google.android.apps.messaging',
  uber: 'com.ubercab',
  ola: 'com.olacabs.customer',
  swiggy: 'in.swiggy.android',
  zomato: 'com.application.zomato',
  amazon: 'in.amazon.mShop.android.shopping',
  flipkart: 'com.flipkart.android',
  phonepe: 'com.phonepe.app',
  gpay: 'com.google.android.apps.nbu.paisa.user',
  paytm: 'net.one97.paytm',
};

/** Candidate packages to try per app, in priority order */
export const APP_PACKAGE_CANDIDATES: Record<string, string[]> = {
  whatsapp: ['com.whatsapp', 'com.whatsapp.w4b'],
  whatsapp_business: ['com.whatsapp.w4b', 'com.whatsapp'],
  sms: ['com.google.android.apps.messaging', 'com.android.mms', 'com.samsung.android.messaging'],
  calculator: ['com.google.android.calculator', 'com.android.calculator2', 'com.sec.android.app.popupcalculator'],
  clock: ['com.google.android.deskclock', 'com.sec.android.app.clockpackage', 'com.android.deskclock'],
  calendar: ['com.google.android.calendar', 'com.android.calendar'],
  photos: ['com.google.android.apps.photos', 'com.sec.android.gallery3d'],
  maps: ['com.google.android.apps.maps'],
  chrome: ['com.android.chrome'],
  youtube: ['com.google.android.youtube'],
  spotify: ['com.spotify.music'],
  instagram: ['com.instagram.android'],
  telegram: ['org.telegram.messenger', 'org.telegram.messenger.web'],
  amazon: ['in.amazon.mShop.android.shopping', 'com.amazon.mShop.android.shopping'],
};

/** Deep-link schemes for opening apps (Android + iOS where applicable) */
export const APP_DEEP_LINKS: Record<
  string,
  {
    android: string;
    ios?: string;
    fallbacks?: string[];
    conversation?: string;
  }
> = {
  whatsapp: {
    android: 'whatsapp://',
    ios: 'whatsapp://',
    fallbacks: ['whatsapp://app'],
    conversation: 'whatsapp://send?phone={phone}',
  },
  whatsapp_business: {
    android: 'whatsapp://',
    fallbacks: ['whatsapp://app'],
    conversation: 'whatsapp://send?phone={phone}',
  },
  instagram: {
    android: 'instagram://direct-inbox',
    ios: 'instagram://direct-inbox',
    fallbacks: ['instagram://app', 'intent:#Intent;package=com.instagram.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  telegram: {
    android: 'tg://',
    ios: 'tg://',
    fallbacks: ['intent:#Intent;package=org.telegram.messenger;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
    conversation: 'tg://resolve?domain={username}',
  },
  youtube: {
    android: 'vnd.youtube://',
    ios: 'youtube://',
    fallbacks: ['intent:#Intent;package=com.google.android.youtube;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end', 'https://youtube.com'],
  },
  spotify: {
    android: 'spotify://',
    ios: 'spotify://',
    fallbacks: ['intent:#Intent;package=com.spotify.music;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  gmail: {
    android: 'googlegmail://',
    ios: 'googlegmail://',
    fallbacks: ['mailto:', 'intent:#Intent;package=com.google.android.gm;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  chrome: {
    android: 'googlechrome://',
    ios: 'googlechrome://',
    fallbacks: ['intent:#Intent;package=com.android.chrome;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end', 'https://google.com'],
  },
  maps: {
    android: 'geo:0,0',
    ios: 'maps://',
    fallbacks: ['intent:#Intent;package=com.google.android.apps.maps;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end', 'https://maps.google.com'],
  },
  uber: {
    android: 'uber://',
    ios: 'uber://',
    fallbacks: ['intent:#Intent;package=com.ubercab;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  swiggy: {
    android: 'swiggy://',
    fallbacks: ['intent:#Intent;package=in.swiggy.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  zomato: {
    android: 'zomato://',
    fallbacks: ['intent:#Intent;package=com.application.zomato;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  netflix: {
    android: 'nflx://',
    ios: 'nflx://',
    fallbacks: ['intent:#Intent;package=com.netflix.mediaclient;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  discord: {
    android: 'discord://',
    ios: 'discord://',
    fallbacks: ['intent:#Intent;package=com.discord;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  slack: {
    android: 'slack://',
    ios: 'slack://',
    fallbacks: ['intent:#Intent;package=com.Slack;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  messenger: {
    android: 'fb-messenger://',
    ios: 'fb-messenger://',
    fallbacks: ['intent:#Intent;package=com.facebook.orca;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  twitter: {
    android: 'twitter://',
    ios: 'twitter://',
    fallbacks: ['intent:#Intent;package=com.twitter.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
  },
  x: {
    android: 'twitter://',
    ios: 'twitter://',
    fallbacks: ['intent:#Intent;package=com.twitter.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end'],
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
