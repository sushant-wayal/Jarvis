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

// 5. Fallback resolver to catch any `./apps/mobile/index` entry resolution
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
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
