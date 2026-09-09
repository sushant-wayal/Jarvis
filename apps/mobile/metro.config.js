const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the entire monorepo
config.watchFolders = [workspaceRoot];

// 2. Tell Metro where to resolve node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Force React, React Native, Reanimated and Skia to resolve from workspace root
config.resolver.extraNodeModules = {
  'react': path.resolve(workspaceRoot, 'node_modules', 'react'),
  'react-dom': path.resolve(workspaceRoot, 'node_modules', 'react-dom'),
  'react-native': path.resolve(workspaceRoot, 'node_modules', 'react-native'),
  'react-native-reanimated': path.resolve(workspaceRoot, 'node_modules', 'react-native-reanimated'),
  '@shopify/react-native-skia': path.resolve(workspaceRoot, 'node_modules', '@shopify/react-native-skia'),
};

// 4. In a monorepo, Expo Go requests the bundle as `/apps/mobile/index.bundle`
// Ensure serverRoot and URL rewriting route both `/apps/mobile/...` and `/...` correctly
config.server = config.server || {};
config.server.unstable_serverRoot = projectRoot;

config.server.rewriteRequestUrl = (url) => {
  if (url.startsWith('/apps/mobile/')) {
    return url.replace('/apps/mobile/', '/');
  }
  return url;
};

const originalEnhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const enhanced = (req, res, next) => {
    if (req.url && req.url.startsWith('/apps/mobile/')) {
      req.url = req.url.replace('/apps/mobile/', '/');
    }
    return middleware(req, res, next);
  };
  return originalEnhanceMiddleware ? originalEnhanceMiddleware(enhanced, server) : enhanced;
};

// 5. Expo Go compatibility shims + monorepo index resolver
//
// IMPORTANT: EAS Cloud Build sets process.env.EAS_BUILD='true'.
// We MUST NOT apply expo-notifications shims during EAS builds — the shims
// replace real native bridge code with no-ops, which would silently break ALL
// local notifications (alarms, timed reminders, media channels) in the standalone APK.
//
// The shims only apply in local dev (Expo Go), where the native push modules
// don't exist and throw fatal errors that crash all routes before they load.
//
// In standalone APK (EAS build):
//   - IS_EAS_BUILD = true → shims are NOT applied → real native modules are bundled
//   - All notification features (scheduleNotificationAsync, channels, permissions) work
//
// In Expo Go (local dev):
//   - IS_EAS_BUILD = false → shims ARE applied → routes load without crashing
//   - push/remote notification APIs are silently no-oped; local alarms still work via patch-package

const IS_EAS_BUILD = process.env.EAS_BUILD === 'true' || process.env.NODE_ENV === 'production';

const EXPO_NOTIFICATIONS_CRASHING_MODULES = [
  // Each of these calls requireNativeModule('...') which throws in Expo Go:
  'TopicSubscriptionModule.android',
  'PushTokenManager.native',
  'ServerRegistrationModule.native',
  'NotificationsEmitterModule.native',
  'NotificationsHandlerModule.native',
  'NotificationScheduler.native',
  'NotificationPresenterModule.native',
  'NotificationCategoriesModule.native',
  'BackgroundNotificationTasksModule.native',
  'BadgeModule.native',
  'NotificationPermissionsModule.native',
  'NotificationChannelManager.native',
  'NotificationChannelGroupManager.native',
  // Push-token auto-registration (triggers warnOfExpoGoPushUsage throw):
  'DevicePushTokenAutoRegistration.fx',
  'warnOfExpoGoPushUsage',
  'getDevicePushTokenAsync',
  'getExpoPushTokenAsync',
  'topicSubscription',
  'unregisterForNotificationsAsync',
];

const EXPO_NOTIFICATIONS_SHIM = path.resolve(
  projectRoot,
  'src/shims/expo-notifications-expo-go.js'
);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Intercept crashing expo-notifications native sub-modules — ONLY in local dev (Expo Go).
  // Skip entirely when IS_EAS_BUILD is true so the real native bridges are bundled into the APK.
  if (!IS_EAS_BUILD) {
    const isExpoNotificationsSubModule =
      context.originModulePath &&
      context.originModulePath.includes('expo-notifications') &&
      EXPO_NOTIFICATIONS_CRASHING_MODULES.some((m) => moduleName.includes(m));

    const isDirectCrashingImport = EXPO_NOTIFICATIONS_CRASHING_MODULES.some(
      (m) =>
        moduleName === `expo-notifications/build/${m}` ||
        moduleName.endsWith(`expo-notifications/build/${m}.js`)
    );

    if (isExpoNotificationsSubModule || isDirectCrashingImport) {
      return { filePath: EXPO_NOTIFICATIONS_SHIM, type: 'sourceFile' };
    }
  }

  // Monorepo index.js path rewriting for Expo Go bundle URL
  if (moduleName.startsWith('./apps/mobile/') || moduleName.startsWith('apps/mobile/')) {
    const cleanPath = moduleName.replace(/^(\.\/)?apps\/mobile\//, './');
    try {
      return context.resolveRequest(context, cleanPath, platform);
    } catch {
      if (cleanPath === './index' || cleanPath === 'index') {
        return {
          filePath: path.resolve(projectRoot, 'index.js'),
          type: 'sourceFile',
        };
      }
    }
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

