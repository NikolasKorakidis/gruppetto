// Native push registration (Expo push service → APNs/FCM).
// Needs a development/production build with an EAS projectId; silently does
// nothing in environments without push support.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPush(userId: string): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Rides & club updates',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase
      .from('push_tokens')
      .upsert({ token, user_id: userId, platform: Platform.OS, last_seen: new Date().toISOString() });
    return token;
  } catch (e) {
    console.warn('Push registration skipped:', e);
    return null;
  }
}

export async function unregisterPush(token: string | null) {
  if (token) await supabase.from('push_tokens').delete().eq('token', token);
}

/** Navigate when the user taps a notification. Returns an unsubscribe function. */
export function listenForNotificationTaps(): () => void {
  const open = (data: unknown) => {
    const url = (data as { url?: string } | undefined)?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) open(last.notification.request.content.data);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
  return () => sub.remove();
}
