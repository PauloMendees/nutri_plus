import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../../lib/auth';
import { getTabBarColors, useTheme } from '../../lib/theme';
import { useMyConsent } from '../../lib/queries/consent';
import { ConsentGate } from '../../components/consent/consent-gate';

export default function AppLayout() {
  const { session, loading } = useSession();
  const { scheme } = useTheme();
  const consent = useMyConsent(!!session && !loading);
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (consent.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }
  if (consent.data?.needsConsent) {
    return <ConsentGate currentVersion={consent.data.currentVersion} />;
  }
  const tab = getTabBarColors(scheme);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tab.active,
        tabBarInactiveTintColor: tab.inactive,
        tabBarStyle: { backgroundColor: tab.background, borderTopColor: tab.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Evolução',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="planos"
        options={{
          title: 'Planos',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="fora-de-casa"
        options={{
          title: 'Fora de casa',
          tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="configuracoes"
        options={{
          title: 'Config',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="nova-medicao" options={{ href: null }} />
    </Tabs>
  );
}
