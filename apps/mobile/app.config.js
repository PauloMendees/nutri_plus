/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'iNutri',
  slug: 'nutri-plus-mobile',
  owner: 'paulo-mendes-tecnologia',
  scheme: 'nutriplus',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // 'automatic' lets the app switch appearance at runtime and lets 'system'
  // mode follow the OS. 'dark' here locks the native appearance and blocks the
  // in-app light/dark toggle.
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.inutri.app',
  },
  android: {
    package: 'com.inutri.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FFFFFF',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 200, backgroundColor: '#FFFFFF' },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: {
      // EAS project @paulo-mendes-tecnologia/nutri-plus-mobile.
      // Build numbers are managed remotely (eas.json: appVersionSource "remote").
      projectId: '6b0a41da-200c-40b8-bfc5-81dc5362f2d4',
    },
  },
};

module.exports = config;
