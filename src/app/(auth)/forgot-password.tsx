import { Link, router } from 'expo-router';
import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Txt } from '@/components/ui';
import { authRedirectUrl } from '@/lib/links';
import { friendlyError, supabase } from '@/lib/supabase';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const clean = email.trim().toLowerCase();
    const { error } = await supabase.auth.resetPasswordForEmail(clean, { redirectTo: authRedirectUrl() });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    router.push({ pathname: '/verify', params: { email: clean, type: 'recovery' } });
  }

  return (
    <AuthShell title="Reset password" subtitle="Enter your email and we’ll send you a reset code.">
      <Input
        label="Email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@example.com"
        onSubmitEditing={submit}
        error={error}
      />
      <Button title="Send reset code" onPress={submit} loading={busy} disabled={!email.includes('@')} />
      <Link href="/sign-in" style={{ alignSelf: 'center' }}>
        <Txt style={{ textDecorationLine: 'underline' }}>Back to sign in</Txt>
      </Link>
    </AuthShell>
  );
}
