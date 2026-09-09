const fs = require('fs');
const { execSync } = require('child_process');

// Only run patch-package if patches exist AND the target package is installed
// In CI environments like Vercel deploying only the backend/brain, mobile packages are not present
if (fs.existsSync('patches') && fs.existsSync('node_modules/expo-notifications')) {
  try {
    execSync('npx patch-package', { stdio: 'inherit' });
  } catch (error) {
    console.warn('[patch-package] Warning: patch application skipped or non-fatal:', error.message);
  }
} else {
  console.log('[postinstall] Skipping patch-package (target mobile package not in current workspace build)');
}
