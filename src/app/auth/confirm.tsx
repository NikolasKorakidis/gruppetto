import type { EmailOtpType } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, Loading } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

function parseParams(url: string) {
  const out: Record<string, string> = {};
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  for (const part of [query, hash]) {
    new URLSearchParams(part).forEach((v, k) => (out[k] = v));
  }
  return out;
}

/**
 * Landing page for links in auth emails, on every platform:
 *   #access_token=…&refresh_token=…&type=signup|recovery   (implicit flow)
 *   ?code=…                                                (PKCE flow)
 *   ?token_hash=…&type=…                                   (custom templates)
 */
export default function ConfirmScreen() {
  const nativeUrl = Linking.useLinkingURL();
  const { setRecovering } = useAuth();
  const [state, setState] = useState<'working' | 'confirmed' | 'error'>('working');
  const [message, setMessage] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    const href = Platform.OS === 'web' ? window.location.href : nativeUrl;
    if (!href || handled.current) return;
    handled.current = true;
    if (Platform.OS === 'web') window.history.replaceState(null, '', window.location.pathname);

    (async () => {
      const p = parseParams(href);
      try {
        if (p.error || p.error_description) throw new Error(p.error_description ?? p.error);
        const isRecovery = p.type === 'recovery';
        if (isRecovery) setRecovering(true);

        if (p.access_token && p.refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
          if (error) throw error;
        } else if (p.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(p.code);
          // The code verifier lives on the device that started sign-up. If the
          // link was opened elsewhere, the email is still confirmed: ask to sign in.
          if (error) {
            setRecovering(false);
            setState('confirmed');
            return;
          }
        } else if (p.token_hash && p.type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: p.token_hash, type: p.type as EmailOtpType });
          if (error) throw error;
        } else {
          setState('confirmed');
          return;
        }
        // The navigator re-renders once the session lands; this is a fallback.
        try {
          router.replace(isRecovery ? '/reset-password' : '/');
        } catch {}
      } catch (e) {
        setRecovering(false);
        setMessage(friendlyError(e));
        setState('error');
      }
    })();
  }, [nativeUrl, setRecovering]);

  if (state === 'working') return <Loading label="Confirming…" />;

  return (
    <AuthShell
      title={state === 'confirmed' ? 'Email confirmed' : 'Link problem'}
      subtitle={state === 'confirmed' ? 'Your account is ready. Sign in to continue.' : undefined}>
      {message ? <Banner tone="danger">{message}</Banner> : null}
      <Button title={state === 'confirmed' ? 'Sign in' : 'Back to sign in'} onPress={() => router.replace('/sign-in')} />
    </AuthShell>
  );
}
