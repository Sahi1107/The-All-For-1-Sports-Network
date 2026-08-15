// Monorepo-aware Metro config. The mobile app lives in apps/mobile but consumes
// @af1/* packages that live in ../../packages, and its deps are hoisted to the
// workspace-root node_modules. Metro must watch the whole workspace and resolve
// modules from both the app-local and root node_modules, or the shared packages
// (and hoisted React Native) won't resolve.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so edits to @af1/* trigger a rebuild.
config.watchFolders = [workspaceRoot];

// 2. Resolve from app-local first, then the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Don't walk up past these — hierarchical lookup + a monorepo causes Metro to
//    resolve two copies of React/React Native. Pinning the search paths avoids it.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
