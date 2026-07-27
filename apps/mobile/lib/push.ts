import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { RegisterPushTokenRequest } from '@nutri-plus/shared-types';
import { apiFetch } from './api';

export type RegisterResult = { token: string } | { denied: true };

export async function registerForPush(): Promise<RegisterResult> {
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return { denied: true };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const body: RegisterPushTokenRequest = { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' };
  await apiFetch('/me/push-tokens', { method: 'PUT', body });
  return { token };
}

export async function unregisterPush(token: string): Promise<void> {
  await apiFetch(`/me/push-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
}
