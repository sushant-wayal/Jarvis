const { withAndroidManifest, withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to inject JarvisNotificationListenerService into Android project:
 * 1. Copies Kotlin source files into the native Android folder
 * 2. Registers JarvisNotificationPackage in MainApplication.kt
 * 3. Declares NotificationListenerService and permissions in AndroidManifest.xml
 */
const withNotificationListener = (config) => {
  // 1. Copy native Kotlin files into Android project during prebuild
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const srcDir = path.join(projectRoot, 'plugins', 'native-modules', 'com', 'jarvis', 'notification');
      const destDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'jarvis',
        'notification'
      );

      if (fs.existsSync(srcDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        const files = fs.readdirSync(srcDir);
        for (const file of files) {
          fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
        }
      }
      return modConfig;
    },
  ]);

  // 2. Register JarvisNotificationPackage in MainApplication.kt
  config = withMainApplication(config, async (modConfig) => {
    let content = modConfig.modResults.contents;
    const packageImport = 'import com.jarvis.notification.JarvisNotificationPackage';

    if (!content.includes(packageImport)) {
      content = content.replace(
        'import com.facebook.react.ReactPackage',
        `import com.facebook.react.ReactPackage\n${packageImport}`
      );
    }

    if (!content.includes('JarvisNotificationPackage()')) {
      const target = 'PackageList(this).packages.apply {';
      if (content.includes(target)) {
        content = content.replace(
          target,
          `${target}\n              add(JarvisNotificationPackage())`
        );
      }
    }

    modConfig.modResults.contents = content;
    return modConfig;
  });

  // 3. AndroidManifest configuration for NotificationListenerService
  config = withAndroidManifest(config, async (modConfig) => {
    const androidManifest = modConfig.modResults.manifest;

    if (!androidManifest.application) {
      androidManifest.application = [{}];
    }

    const app = androidManifest.application[0];
    if (!app.service) {
      app.service = [];
    }

    const serviceName = 'com.jarvis.notification.JarvisNotificationListenerService';

    // Check if the service is already declared
    const existingService = app.service.find(
      (s) => s.$ && s.$['android:name'] === serviceName
    );

    if (!existingService) {
      app.service.push({
        $: {
          'android:name': serviceName,
          'android:label': 'Jarvis Notification Service',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.service.notification.NotificationListenerService',
                },
              },
            ],
          },
        ],
      });
    }

    return modConfig;
  });

  return config;
};

module.exports = withNotificationListener;

