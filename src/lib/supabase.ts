import './storage-polyfill';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { DEMO_URL, demoFetch } from '@/demo/backend';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Demo mode runs the whole app against built-in sample data (src/demo).
 * It is on when EXPO_PUBLIC_DEMO=1, or automatically when no Supabase keys are set.
 */
export const isDemo = process.env.EXPO_PUBLIC_DEMO === '1' || !(url && key);

export const supabase = createClient(isDemo ? DEMO_URL : url!, isDemo ? 'demo' : key!, {
  global: isDemo ? { fetch: demoFetch } : undefined,
  auth: {
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    // Links from emails are handled explicitly by /auth/confirm on every platform.
    detectSessionInUrl: false,
  },
});

// Only refresh tokens while the app is in the foreground (native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Turn Supabase/Postgres errors into something a rider can read. */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
  if (/Email not confirmed/i.test(msg)) return 'Please confirm your email first. Check your inbox for the code.';
  if (/User already registered/i.test(msg)) return 'An account with this email already exists. Try signing in.';
  if (/Token has expired or is invalid|otp_expired/i.test(msg)) return 'That code is invalid or has expired. Request a new one.';
  if (/rate limit/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/row-level security/i.test(msg)) return "You don't have permission to do that.";
  if (/Failed to fetch|Network request failed/i.test(msg)) return 'No connection. Check your internet and try again.';
  return msg;
}
