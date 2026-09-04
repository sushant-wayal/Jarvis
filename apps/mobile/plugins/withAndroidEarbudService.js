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
  require('@expo/config-plugins');
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

    // ── Service ──────────────────────────────────────────────────────────
    if (!app.service) app.service = [];

    const serviceName = 'com.jarvis.earbud.JarvisForegroundService';
    const serviceExists = app.service.some(
      (s) => s.$ && s.$['android:name'] === serviceName
    );
    if (!serviceExists) {
      app.service.push({
        $: {
          'android:name': serviceName,
          'android:foregroundServiceType': 'mediaPlayback',
          'android:exported': 'false',
        },
      });
      console.log('[withAndroidEarbudService] Added JarvisForegroundService to manifest');
    }

    // ── BroadcastReceiver ────────────────────────────────────────────────
    if (!app.receiver) app.receiver = [];

    const receiverName = 'com.jarvis.earbud.JarvisMediaButtonReceiver';
    const receiverExists = app.receiver.some(
      (r) => r.$ && r.$['android:name'] === receiverName
    );
    if (!receiverExists) {
      app.receiver.push({
        $: {
          'android:name': receiverName,
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '1000' },
            action: [{ $: { 'android:name': 'android.intent.action.MEDIA_BUTTON' } }],
          },
        ],
      });
      console.log('[withAndroidEarbudService] Added JarvisMediaButtonReceiver to manifest');
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
