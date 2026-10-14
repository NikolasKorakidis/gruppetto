import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { DemoHint } from '@/components/DemoNotice';
import { useTheme } from '@/components/theme';
import { Banner, Button, Input, Txt } from '@/components/ui';
import { authRedirectUrl } from '@/lib/links';
import { friendlyError, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

/** Enter the code from the email. Used for sign-up confirmation and password reset. */
export default function Verify() {
  const { c } = useTheme();
  const { setRecovering } = useAuth();
  const params = useLocalSearchParams<{ email: string; type: 'signup' | 'recovery' }>();
  const email = params.email ?? '';
  const type = params.type === 'recovery' ? 'recovery' : 'signup';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(value = code) {
    const token = value.replace(/\D/g, '');
    if (token.length < 6) return;
    setError(null);
    setBusy(true);
    if (type === 'recovery') setRecovering(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type });
    setBusy(false);
    if (error) {
      setRecovering(false);
      setError(friendlyError(error));
    }
    // On success the session changes and the router moves on automatically.
  }

  async function resend() {
    setError(null);
    setInfo(null);
    const { error } =
      type === 'recovery'
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() })
        : await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authRedirectUrl() } });
    if (error) setError(friendlyError(error));
    else {
      setInfo('A new code is on its way.');
      setCooldown(60);
    }
  }

  return (
    <AuthShell
      title={type === 'recovery' ? 'Check your inbox' : 'Confirm your email'}
      subtitle={`We sent a code to ${email}. Enter it below, or tap the button in the email.`}>
      <Input
        label="Code"
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, 10);
          setCode(digits);
          if (digits.length === 6) verify(digits);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        placeholder="123456"
        maxLength={10}
        autoFocus
        style={{ fontSize: 26, letterSpacing: 10, fontWeight: '700', fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }}
        error={error}
      />
      <DemoHint>Demo: no email is sent — type any 6 digits.</DemoHint>
      {info ? <Banner tone="brand" icon="mail">{info}</Banner> : null}
      <Button title="Verify" onPress={() => verify()} loading={busy} disabled={code.length < 6} />
      <Button
        title={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        variant="ghost"
        onPress={resend}
        disabled={cooldown > 0}
      />
      <Txt variant="small" center muted>
        Can’t find it? Check your spam folder. Wrong address?{' '}
        <Txt variant="small" color={c.ink} style={{ textDecorationLine: 'underline' }} onPress={() => router.replace(type === 'recovery' ? '/forgot-password' : '/sign-up')}>
          Start over
        </Txt>
      </Txt>
    </AuthShell>
  );
}
