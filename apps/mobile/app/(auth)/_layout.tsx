import { Redirect, Stack, useSegments } from 'expo-router';
import { useSession } from '../../lib/auth';

export default function AuthLayout() {
  const { session, loading } = useSession();
  const segments = useSegments();
  // verifyOtp establishes a short-lived recovery session mid-flow on the
  // reset screen; do NOT bounce the user into (app) before they set the new
  // password. reset-password navigates to (app) itself once updateUser wins.
  const onResetScreen = (segments[segments.length - 1] as string) === 'reset-password';
  if (loading) return null;
  if (session && !onResetScreen) return <Redirect href="/(app)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
