const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// NOTE: hierarchical lookup MUST stay enabled (Expo's default). With pnpm's
// isolated linker, transitive deps live nested under `.pnpm/<pkg>/node_modules/`;
// disabling hierarchical lookup would restrict resolution to `nodeModulesPaths`
// only and break those nested deps (e.g. @expo/metro-runtime's whatwg-fetch).

// Keep colocated *.test/*.spec files out of the app bundle. expo-router's
// require.context over `app/` would otherwise pull them (and their test-only
// deps like @testing-library/react-native) into the production bundle. Jest is
// unaffected — it uses its own resolver, not Metro.
config.resolver.blockList = [/.*\.(test|spec)\.[jt]sx?$/];

module.exports = withNativeWind(config, { input: './global.css' });
