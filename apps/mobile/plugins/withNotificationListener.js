const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to inject JarvisNotificationListenerService into AndroidManifest.xml
 */
const withNotificationListener = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

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

    return config;
  });
};

module.exports = withNotificationListener;
