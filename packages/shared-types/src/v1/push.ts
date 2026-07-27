export type PushPlatform = 'ios' | 'android';

export interface RegisterPushTokenRequest {
  token: string;
  platform?: PushPlatform;
}
