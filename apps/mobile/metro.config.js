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

module.exports = config;



