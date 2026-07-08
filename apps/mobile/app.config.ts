import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'iNutri',
  slug: 'nutri-plus-mobile',
  scheme: 'nutriplus',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // 'automatic' lets the app switch appearance at runtime and lets 'system'
  // mode follow the OS. 'dark' here locks the native appearance and blocks the
  // in-app light/dark toggle.
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
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
      // Run `eas init` (on your Expo account) and paste the printed projectId
      // here, or set the EAS_PROJECT_ID env var. Build numbers are managed
      // remotely (see eas.json: appVersionSource "remote" + autoIncrement).
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
