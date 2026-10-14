import { Link, router } from 'expo-router';
import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Row, Txt } from '@/components/ui';
import { authRedirectUrl } from '@/lib/links';
import { friendlyError, supabase } from '@/lib/supabase';
import { passwordProblems } from '@/lib/validation';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issues = passwordProblems(password);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('Please enter your name.');
    if (!validEmail) return setError('Please enter a valid email address.');
    if (issues.length) return setError(`Password needs ${issues.join(', ')}.`);
    setBusy(true);
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { display_name: name.trim() }, emailRedirectTo: authRedirectUrl() },
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    // Supabase hides whether an address exists; an empty identity list means it does.
    if (data.user && data.user.identities?.length === 0) {
      return setError('An account with this email already exists. Try signing in or reset your password.');
    }
    if (!data.session) {
      router.replace({ pathname: '/verify', params: { email: cleanEmail, type: 'signup' } });
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="We’ll email you a 6-digit code to confirm it’s really you.">
      <Input label="Your name" icon="person-outline" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="First and last name" />
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
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder="Choose a password"
        hint={password && issues.length ? `Needs ${issues.join(', ')}` : 'Min. 8 characters with upper/lowercase and a number'}
        error={error}
      />
      <Button title="Create account" onPress={submit} loading={busy} />
      <Txt variant="caption" center>
        By creating an account you agree that your name and photo are visible to members of clubs you join.
      </Txt>
      <Row style={{ justifyContent: 'center' }} gap={6}>
        <Txt muted>Already riding with us?</Txt>
        <Link href="/sign-in">
          <Txt style={{ fontWeight: '700', textDecorationLine: 'underline' }}>Sign in</Txt>
        </Link>
      </Row>
    </AuthShell>
  );
}
