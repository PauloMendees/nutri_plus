import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useSession } from '../../lib/auth';
import { getTabBarColors } from '../../lib/theme';

export default function AppLayout() {
  const { session, loading } = useSession();
  const { colorScheme } = useColorScheme();
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  const tab = getTabBarColors(colorScheme);
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
    </Tabs>
  );
}
