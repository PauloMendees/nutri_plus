module.exports = {
  preset: 'jest-expo',
  // NOTE: under pnpm's default (isolated/symlinked) node_modules layout, packages
  // physically live under `node_modules/.pnpm/<name>@<version>/node_modules/<name>/...`
  // and Jest resolves symlinks to that real path before testing transformIgnorePatterns.
  // The `(\.pnpm/[^/]+/node_modules/)?` prefix lets the whitelist below match packages
  // reached through the pnpm store, not just the top-level symlinked path.
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|@gluestack-ui/.*|@legendapp/.*|@supabase/.*))',
  ],
};
