import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { space, useTheme } from '@/components/theme';
import { Avatar, Banner, Loading, Button, Card, confirmAsync, Input, Screen, SectionHeader, showMessage, Stack, ToggleRow, Txt } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import type { NotifyPrefs, ProfilePrivate } from '@/lib/types';
import { pickAndUploadImage } from '@/lib/upload';
import { useAuth } from '@/providers/AuthProvider';

const DEFAULT_PREFS: NotifyPrefs = { ride_new: true, ride_changed: true, comment: true, news: true };

export default function Profile() {
  const { userId } = useAuth();
  const priv = useQuery({
    queryKey: ['private', userId],
    queryFn: async () => {
      const { data } = await supabase.from('profile_private').select('*').eq('user_id', userId!).maybeSingle();
      return data as ProfilePrivate | null;
    },
  });
  if (priv.isPending) return <Loading />;
  return <ProfileForm initialPrivate={priv.data ?? null} />;
}

function ProfileForm({ initialPrivate }: { initialPrivate: ProfilePrivate | null }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { userId, email, profile, refreshProfile, setRecovering, signOut } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [phone, setPhone] = useState(initialPrivate?.phone ?? '');
  const [iceName, setIceName] = useState(initialPrivate?.emergency_name ?? '');
  const [icePhone, setIcePhone] = useState(initialPrivate?.emergency_phone ?? '');
  const [prefs, setPrefs] = useState<NotifyPrefs>({ ...DEFAULT_PREFS, ...profile?.notify_prefs });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changePhoto() {
    try {
      const url = await pickAndUploadImage('avatars', userId!);
      if (!url) return;
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId!);
      await refreshProfile();
    } catch (e) {
      showMessage('Upload failed', friendlyError(e));
    }
  }

  async function save() {
    if (!name.trim()) return setError('Your name can’t be empty.');
    setBusy(true);
    setError(null);
    const [a, b] = await Promise.all([
      supabase.from('profiles').update({ display_name: name.trim(), city: city.trim() || null, bio: bio.trim() || null, notify_prefs: prefs }).eq('id', userId!),
      supabase.from('profile_private').upsert({
        user_id: userId!,
        phone: phone.trim() || null,
        emergency_name: iceName.trim() || null,
        emergency_phone: icePhone.trim() || null,
      }),
    ]);
    setBusy(false);
    const err = a.error ?? b.error;
    if (err) return setError(friendlyError(err));
    await refreshProfile();
    qc.invalidateQueries({ queryKey: ['private', userId] });
    showMessage('Saved');
  }

  async function deleteAccount() {
    const ok = await confirmAsync(
      'Delete your account?',
      'Your profile, sign-ups, messages and routes you uploaded are permanently deleted. Clubs you own are handed to another admin or deleted if you are the only member.',
      'Delete forever',
      true,
    );
    if (!ok) return;
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) return showMessage('Could not delete', friendlyError(error));
    await signOut();
  }

  const setPref = (k: keyof NotifyPrefs) => (v: boolean) => setPrefs({ ...prefs, [k]: v });

  return (
    <Screen>
      <Stack gap={space.md}>
        <Pressable onPress={changePhoto} style={{ alignSelf: 'center', alignItems: 'center', gap: 8 }}>
          <Avatar name={name || '?'} url={profile?.avatar_url} size={96} />
          <Txt variant="small" color={c.brand} style={{ fontWeight: '700' }}>
            Change photo
          </Txt>
        </Pressable>
        <Txt variant="small" muted center>
          {email}
        </Txt>

        <SectionHeader title="Public profile" />
        <Input label="Name" value={name} onChangeText={setName} maxLength={80} />
        <Input label="Town" value={city} onChangeText={setCity} maxLength={80} />
        <Input label="About you" value={bio} onChangeText={setBio} multiline maxLength={500} placeholder="Bikes, favourite climbs, coffee order…" />

        <SectionHeader title="Private — only you and club admins" />
        <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" maxLength={40} />
        <Input label="Emergency contact name" value={iceName} onChangeText={setIceName} maxLength={80} />
        <Input label="Emergency contact phone" value={icePhone} onChangeText={setIcePhone} keyboardType="phone-pad" maxLength={40} />

        <SectionHeader title="Notify me about" />
        <Card>
          <ToggleRow label="New rides in my clubs" value={prefs.ride_new} onChange={setPref('ride_new')} />
          <ToggleRow label="Changes & cancellations" description="For rides you joined or organise" value={prefs.ride_changed} onChange={setPref('ride_changed')} />
          <ToggleRow label="Ride chat messages" value={prefs.comment} onChange={setPref('comment')} />
          <ToggleRow label="Club news" value={prefs.news} onChange={setPref('news')} />
        </Card>

        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button title="Save" icon="save-outline" onPress={save} loading={busy} />

        <SectionHeader title="Account" />
        <Button title="Change password" icon="key-outline" variant="secondary" onPress={() => setRecovering(true)} />
        <Button title="Sign out" icon="log-out-outline" variant="ghost" onPress={signOut} />
        <Button title="Delete account" icon="trash-outline" variant="danger" onPress={deleteAccount} />
      </Stack>
    </Screen>
  );
}
