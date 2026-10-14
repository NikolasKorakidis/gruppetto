import { Link, router } from 'expo-router';
import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { DemoSignIn } from '@/components/DemoNotice';
import { Button, Input, Row, Txt } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) {
      if (/Email not confirmed/i.test(error.message)) {
        await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
        router.push({ pathname: '/verify', params: { email: email.trim().toLowerCase(), type: 'signup' } });
        return;
      }
      setError(friendlyError(error));
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Your club’s rides, routes and riders in one place.">
      <DemoSignIn />
      <Input
        label="Email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
      />
      <Input
        label="Password"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!show}
        autoComplete="current-password"
        textContentType="password"
        placeholder="Your password"
        onSubmitEditing={submit}
        right={
          <Txt variant="small" muted onPress={() => setShow((s) => !s)}>
            {show ? 'Hide' : 'Show'}
          </Txt>
        }
        error={error}
      />
      <Link href="/forgot-password" style={{ alignSelf: 'flex-end' }}>
        <Txt variant="small" style={{ fontWeight: '600', textDecorationLine: 'underline' }}>
          Forgot password?
        </Txt>
      </Link>
      <Button title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
      <Row style={{ justifyContent: 'center', marginTop: 8 }} gap={6}>
        <Txt muted>New here?</Txt>
        <Link href="/sign-up">
          <Txt style={{ fontWeight: '700', textDecorationLine: 'underline' }}>Create an account</Txt>
        </Link>
      </Row>
    </AuthShell>
  );
}
