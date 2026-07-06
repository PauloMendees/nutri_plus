import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'iNutri',
  slug: 'nutri-plus-mobile',
  scheme: 'nutriplus',
  version: '0.0.1',
  orientation: 'portrait',
  // 'automatic' lets the app switch appearance at runtime and lets 'system'
  // mode follow the OS. 'dark' here locks the native appearance and blocks the
  // in-app light/dark toggle.
  userInterfaceStyle: 'automatic',
  ios: { supportsTablet: true },
  android: {},
  plugins: ['expo-router', 'expo-secure-store', 'expo-font', 'expo-splash-screen'],
  experiments: { typedRoutes: true },
};

export default config;
