import { useState } from 'react';

import { Banner, Button, Input, Screen, Stack, Txt } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { passwordProblems } from '@/lib/validation';
import { useAuth } from '@/providers/AuthProvider';

export default function ResetPassword() {
  const { setRecovering, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issues = passwordProblems(password);

  async function save() {
    if (issues.length) return setError(`Password needs ${issues.join(', ')}.`);
    if (password !== confirm) return setError('The passwords do not match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setRecovering(false);
  }

  return (
    <Screen>
      <Stack gap={16}>
        <Txt variant="title">Choose a new password</Txt>
        <Txt muted>You’re signed in. Set a new password to finish.</Txt>
        <Input label="New password" secureTextEntry value={password} onChangeText={setPassword} autoComplete="new-password" textContentType="newPassword" />
        <Input label="Repeat password" secureTextEntry value={confirm} onChangeText={setConfirm} autoComplete="new-password" onSubmitEditing={save} />
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button title="Save password" onPress={save} loading={busy} />
        <Button title="Cancel" variant="ghost" onPress={() => setRecovering(false)} />
        <Button title="Sign out instead" variant="ghost" small onPress={signOut} />
      </Stack>
    </Screen>
  );
}
