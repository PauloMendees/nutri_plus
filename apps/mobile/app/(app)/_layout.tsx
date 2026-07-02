import { Redirect, Tabs } from 'expo-router';
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
        tabBarStyle: { backgroundColor: '#141d19', borderTopColor: '#243029' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="planos" options={{ title: 'Planos' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
