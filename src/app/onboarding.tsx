import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { CreateClubForm, JoinClubForm } from '@/components/ClubForms';
import { space, useTheme } from '@/components/theme';
import { Avatar, Banner, Button, Card, ClubLogo, Input, Row, Segmented, Stack, Txt } from '@/components/ui';
import { takePendingInvite } from '@/lib/links';
import { friendlyError, supabase } from '@/lib/supabase';
import { pickAndUploadImage } from '@/lib/upload';
import { useAuth } from '@/providers/AuthProvider';
import { useClub } from '@/providers/ClubProvider';

export default function Onboarding() {
  const { profile, userId, refreshProfile, signOut } = useAuth();
  const { pendingMemberships, refetch } = useClub();
  const [step, setStep] = useState<'profile' | 'club'>(profile?.onboarded ? 'club' : 'profile');
  const [invite] = useState(() => takePendingInvite());
  const [mode, setMode] = useState<'join' | 'create'>('join');

  return (
    <AuthShell
      title={step === 'profile' ? `Hi${profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}!` : 'Find your bunch'}
      subtitle={
        step === 'profile'
          ? 'This is how your club mates will see you on the start list.'
          : 'Join your club with an invite code, or start a new one and invite your riding mates.'
      }>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="label">Step {step === 'profile' ? 1 : 2} of 2</Txt>
        <Txt variant="small" muted onPress={signOut}>
          Sign out
        </Txt>
      </Row>

      {step === 'profile' ? (
        <ProfileStep
          onDone={async () => {
            await refreshProfile();
            setStep('club');
          }}
          userId={userId!}
          initialName={profile?.display_name ?? ''}
          avatarUrl={profile?.avatar_url ?? null}
        />
      ) : (
        <Stack gap={space.lg}>
          {pendingMemberships.length ? (
            <Card>
              <Stack gap={space.md}>
                {pendingMemberships.map((m) => (
                  <Row key={m.club_id} gap={space.md}>
                    <ClubLogo name={m.club.name} url={m.club.logo_url} color={m.club.color} size={40} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="h3">{m.club.name}</Txt>
                      <Txt variant="small" muted>
                        Waiting for an admin to approve you
                      </Txt>
                    </View>
                  </Row>
                ))}
                <Button title="Check again" variant="secondary" small icon="refresh" onPress={() => refetch()} />
              </Stack>
            </Card>
          ) : null}

          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'join', label: 'Join a club' },
              { value: 'create', label: 'Create a club' },
            ]}
          />
          {mode === 'join' ? <JoinClubForm initialCode={invite ?? ''} /> : <CreateClubForm />}
        </Stack>
      )}
    </AuthShell>
  );
}

function ProfileStep({
  userId,
  initialName,
  avatarUrl,
  onDone,
}: {
  userId: string;
  initialName: string;
  avatarUrl: string | null;
  onDone: () => void;
}) {
  const { c } = useTheme();
  const [name, setName] = useState(initialName);
  const [city, setCity] = useState('');
  const [avatar, setAvatar] = useState(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changePhoto() {
    try {
      const url = await pickAndUploadImage('avatars', userId);
      if (url) setAvatar(url);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function save() {
    if (!name.trim()) return setError('Please enter your name.');
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), city: city.trim() || null, avatar_url: avatar, onboarded: true })
      .eq('id', userId);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    onDone();
  }

  return (
    <Stack gap={space.lg}>
      <Pressable onPress={changePhoto} style={{ alignSelf: 'center', alignItems: 'center', gap: 8 }}>
        <Avatar name={name || '?'} url={avatar} size={96} />
        <Txt variant="small" color={c.brand} style={{ fontWeight: '700' }}>
          {avatar ? 'Change photo' : 'Add a photo'}
        </Txt>
      </Pressable>
      <Input label="Name" value={name} onChangeText={setName} autoComplete="name" maxLength={80} />
      <Input label="Town (optional)" value={city} onChangeText={setCity} placeholder="Where do you ride from?" maxLength={80} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button title="Continue" onPress={save} loading={busy} />
    </Stack>
  );
}
