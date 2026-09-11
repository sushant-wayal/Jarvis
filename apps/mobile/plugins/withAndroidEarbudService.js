/**
 * withAndroidEarbudService.js
 *
 * Expo Config Plugin that sets up the full native Android earbud interaction stack:
 *
 *  1. Copies Kotlin source files into the generated Android project
 *  2. Registers JarvisEarbudPackage in MainApplication.kt
 *  3. Declares the ForegroundService + MediaButtonReceiver in AndroidManifest.xml
 *  4. Adds the androidx.media dependency to app/build.gradle
 */

const { withAndroidManifest, withMainApplication, withDangerousMod, withAppBuildGradle } =
  require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withAndroidEarbudService = (config) => {
  // ── 1. Copy Kotlin files into the android project ────────────────────────
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const srcDir = path.join(
        projectRoot, 'plugins', 'native-modules', 'com', 'jarvis', 'earbud'
      );
      const destDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java', 'com', 'jarvis', 'earbud'
      );

      if (fs.existsSync(srcDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        for (const file of fs.readdirSync(srcDir)) {
          if (file.endsWith('.kt')) {
            fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
            console.log(`[withAndroidEarbudService] Copied ${file} → android/.../${file}`);
          }
        }
      } else {
        console.warn(`[withAndroidEarbudService] Source dir not found: ${srcDir}`);
      }
      return modConfig;
    },
  ]);

  // ── 2. Register JarvisEarbudPackage in MainApplication.kt ───────────────
  config = withMainApplication(config, async (modConfig) => {
    let content = modConfig.modResults.contents;

    const pkgImport = 'import com.jarvis.earbud.JarvisEarbudPackage';
    if (!content.includes(pkgImport)) {
      content = content.replace(
        'import com.facebook.react.ReactPackage',
        `import com.facebook.react.ReactPackage\n${pkgImport}`
      );
    }

    if (!content.includes('JarvisEarbudPackage()')) {
      const target = 'PackageList(this).packages.apply {';
      if (content.includes(target)) {
        content = content.replace(
          target,
          `${target}\n              add(JarvisEarbudPackage())`
        );
      }
    }

    modConfig.modResults.contents = content;
    return modConfig;
  });

  // ── 3. AndroidManifest: Service + Receiver declarations ─────────────────
  config = withAndroidManifest(config, async (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const app = manifest.application[0];

    // ── Permissions ──────────────────────────────────────────────────────
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    const requiredPermissions = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.CALL_PHONE',
      'android.permission.QUERY_ALL_PACKAGES',
    ];
    for (const perm of requiredPermissions) {
      if (!manifest['uses-permission'].some((p) => p.$ && p.$['android:name'] === perm)) {
        manifest['uses-permission'].push({ $: { 'android:name': perm } });
      }
    }

    // ── Queries for Package Visibility (Android 11+) ──────────────────────
    if (!manifest.queries) manifest.queries = [];
    const queries = manifest.queries;
    const queryIntents = [
      { intent: [{ action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }] }] },
      { intent: [{ action: [{ $: { 'android:name': 'android.intent.action.DIAL' } }] }] },
      { intent: [{ action: [{ $: { 'android:name': 'android.intent.action.CALL' } }] }] },
    ];
    for (const q of queryIntents) {
      queries.push(q);
    }

    // ── Service ──────────────────────────────────────────────────────────
    if (!app.service) app.service = [];

    const serviceName = 'com.jarvis.earbud.JarvisForegroundService';
    const existingService = app.service.find(
      (s) => s.$ && s.$['android:name'] === serviceName
    );
    if (existingService) {
      existingService.$['android:foregroundServiceType'] = 'mediaPlayback|microphone';
      existingService.$['android:exported'] = 'false';
    } else {
      app.service.push({
        $: {
          'android:name': serviceName,
          'android:foregroundServiceType': 'mediaPlayback|microphone',
          'android:exported': 'false',
        },
      });
      console.log('[withAndroidEarbudService] Added JarvisForegroundService to manifest');
    }

    // ── BroadcastReceiver ────────────────────────────────────────────────
    if (!app.receiver) app.receiver = [];

    const receiverName = 'com.jarvis.earbud.JarvisMediaButtonReceiver';
    const receiverFilter = [
      {
        $: { 'android:priority': '1000' },
        action: [
          { $: { 'android:name': 'android.intent.action.MEDIA_BUTTON' } },
          { $: { 'android:name': 'android.intent.action.VOICE_COMMAND' } },
        ],
      },
    ];

    const existingReceiver = app.receiver.find(
      (r) => r.$ && r.$['android:name'] === receiverName
    );
    if (existingReceiver) {
      existingReceiver['intent-filter'] = receiverFilter;
    } else {
      app.receiver.push({
        $: {
          'android:name': receiverName,
          'android:exported': 'true',
        },
        'intent-filter': receiverFilter,
      });
      console.log('[withAndroidEarbudService] Added JarvisMediaButtonReceiver to manifest');
    }

    // ── MainActivity: Register VOICE_COMMAND intent-filter ────────────────
    if (app.activity && app.activity.length > 0) {
      const mainActivity = app.activity[0];
      if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];
      const hasVoiceCommand = mainActivity['intent-filter'].some(
        (filter) => filter.action && filter.action.some((a) => a.$ && a.$['android:name'] === 'android.intent.action.VOICE_COMMAND')
      );
      if (!hasVoiceCommand) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.VOICE_COMMAND' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        });
        console.log('[withAndroidEarbudService] Added VOICE_COMMAND to MainActivity');
      }
    }

    return modConfig;
  });

  // ── 4. Add androidx.media dependency to app/build.gradle ────────────────
  config = withAppBuildGradle(config, (modConfig) => {
    const dep = "implementation 'androidx.media:media:1.7.0'";
    if (!modConfig.modResults.contents.includes(dep)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${dep}`
      );
      console.log('[withAndroidEarbudService] Added androidx.media dependency');
    }
    return modConfig;
  });

  return config;
};

module.exports = withAndroidEarbudService;
