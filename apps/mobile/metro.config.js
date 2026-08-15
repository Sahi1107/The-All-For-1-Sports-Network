// Monorepo-aware Metro config. The mobile app lives in apps/mobile but consumes
// @af1/* packages in ../../packages, with its deps hoisted to the workspace root.
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

// 3. Don't walk up past these — hierarchical lookup + a monorepo makes Metro
//    resolve two copies of React Native. Pinning the search paths avoids it.
config.resolver.disableHierarchicalLookup = true;

// 4. Resolve @af1/* to their TS source, not their compiled dist. Metro transpiles
//    the TS itself, so a change to a shared package hot-reloads without a rebuild
//    (the same source-resolution the web app uses via its Vite alias). Node
//    consumers — the API server — still use each package's dist via "main".
const af1Source = {
  '@af1/api-client': path.resolve(workspaceRoot, 'packages/api-client/src/index.ts'),
  '@af1/core': path.resolve(workspaceRoot, 'packages/core/src/index.ts'),
  '@af1/tokens': path.resolve(workspaceRoot, 'packages/tokens/src/index.ts'),
  '@af1/validation': path.resolve(workspaceRoot, 'packages/validation/src/index.ts'),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const redirect = af1Source[moduleName];
  return context.resolveRequest(context, redirect ?? moduleName, platform);
};

module.exports = config;
