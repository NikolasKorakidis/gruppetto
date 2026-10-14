import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const APP_URL = (process.env.EXPO_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
/** Sub-path the web app is served from ('' at the domain root, '/gruppetto' on GitHub Pages). */
const WEB_BASE = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
const webRoot = () => `${window.location.origin}${WEB_BASE}`;

/** Where Supabase sends people after they click a link in an auth email. */
export function authRedirectUrl() {
  if (Platform.OS === 'web') return `${webRoot()}/auth/confirm`;
  return Linking.createURL('/auth/confirm');
}

/** Shareable invite link. Prefers the deployed web app so it works for everyone. */
export function inviteLink(code: string) {
  if (APP_URL) return `${APP_URL}/join/${code}`;
  if (Platform.OS === 'web') return `${webRoot()}/join/${code}`;
  return Linking.createURL(`/join/${code}`);
}

const PENDING_INVITE = 'gruppetto.pendingInvite';

export function rememberInvite(code: string) {
  try {
    localStorage.setItem(PENDING_INVITE, code);
  } catch {}
}

export function takePendingInvite(): string | null {
  try {
    const code = localStorage.getItem(PENDING_INVITE);
    if (code) localStorage.removeItem(PENDING_INVITE);
    return code;
  } catch {
    return null;
  }
}

/** Public link to a page in the app, e.g. appLink('/ride/123'). */
export function appLink(path: string) {
  if (APP_URL) return `${APP_URL}${path}`;
  if (Platform.OS === 'web') return `${webRoot()}${path}`;
  return Linking.createURL(path);
}
