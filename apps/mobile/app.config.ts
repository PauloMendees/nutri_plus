import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'iNutri',
  slug: 'nutri-plus-mobile',
  scheme: 'nutriplus',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  ios: { supportsTablet: true },
  android: {},
  plugins: ['expo-router', 'expo-secure-store', 'expo-font', 'expo-splash-screen'],
  experiments: { typedRoutes: true },
};

export default config;
