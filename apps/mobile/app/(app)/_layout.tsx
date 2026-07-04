import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../../lib/auth';

export default function AppLayout() {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#14bfa6',
        tabBarInactiveTintColor: '#8a9a92',
        tabBarStyle: { backgroundColor: '#141d19', borderTopColor: '#243029' },
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
