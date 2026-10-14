import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { friendlyError, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useClub } from '@/providers/ClubProvider';

import { DemoInviteHint } from './DemoNotice';
import { radius, space, useTheme } from './theme';
import { Banner, Button, Card, ClubLogo, Input, Row, Stack, ToggleRow, Txt } from './ui';

export const CLUB_COLORS = ['#0E7C66', '#1F6FEB', '#7C3AED', '#DB2777', '#E4572E', '#C2410C', '#15803D', '#0F172A'];

type Preview = { id: string; name: string; city: string | null; logo_url: string | null; color: string; member_count: number; requires_approval: boolean };

/** Look up a club by invite code, show it, and join. */
export function JoinClubForm({ initialCode = '', onJoined }: { initialCode?: string; onJoined?: (clubId: string, status: string) => void }) {
  const { c } = useTheme();
  const { refetch, setActiveClub, memberships } = useClub();
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const existing = preview ? memberships.find((m) => m.club_id === preview.id) : null;

  async function lookup() {
    setError(null);
    setPreview(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('club_by_invite', { p_code: code.trim() });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    if (!data?.length) return setError('No club found with that code. Check it with your club admin.');
    setPreview(data[0] as Preview);
  }

  async function join() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('join_club', { p_code: code.trim() });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    const row = (data as { club_id: string; status: string }[])[0];
    await refetch();
    if (row.status === 'active') setActiveClub(row.club_id);
    setDone(row.status);
    onJoined?.(row.club_id, row.status);
  }

  return (
    <Stack gap={space.md}>
      <Input
        label="Invite code"
        icon="key-outline"
        value={code}
        onChangeText={(v) => {
          setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12));
          setPreview(null);
          setDone(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="e.g. K7QM2XPA"
        onSubmitEditing={lookup}
        hint="Ask your club admin for the code, or open their invite link."
        style={{ letterSpacing: 3, fontWeight: '700' }}
      />
      {!preview && !code ? <DemoInviteHint onUse={setCode} /> : null}
      {!preview ? <Button title="Find club" variant="secondary" onPress={lookup} loading={busy} disabled={code.length < 6} /> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {preview ? (
        <Card>
          <Row gap={space.md}>
            <ClubLogo name={preview.name} url={preview.logo_url} color={preview.color} size={52} />
            <View style={{ flex: 1 }}>
              <Txt variant="h2">{preview.name}</Txt>
              <Txt variant="small" muted>
                {[preview.city, `${preview.member_count} member${preview.member_count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
              </Txt>
            </View>
          </Row>
          <View style={{ marginTop: space.lg }}>
            {done === 'pending' || existing?.status === 'pending' ? (
              <Banner tone="warn" icon="hourglass">
                Request sent. An admin needs to approve you — you’ll get a notification.
              </Banner>
            ) : done === 'active' || existing?.status === 'active' ? (
              <Banner tone="brand" icon="checkmark-circle">
                You’re a member of this club.
              </Banner>
            ) : (
              <Button
                title={preview.requires_approval ? 'Request to join' : 'Join club'}
                icon="enter-outline"
                variant="brand"
                onPress={join}
                loading={busy}
              />
            )}
          </View>
        </Card>
      ) : null}
      {preview?.requires_approval && !done && !existing ? (
        <Txt variant="caption" style={{ color: c.muted }}>
          This club approves new members manually.
        </Txt>
      ) : null}
    </Stack>
  );
}

/** Create a club. The creator becomes its owner. */
export function CreateClubForm({ onCreated }: { onCreated?: (clubId: string) => void }) {
  const { c } = useTheme();
  const { userId } = useAuth();
  const { refetch, setActiveClub } = useClub();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(CLUB_COLORS[0]);
  const [approval, setApproval] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (name.trim().length < 2) return setError('Give your club a name.');
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from('clubs')
      .insert({
        name: name.trim(),
        city: city.trim() || null,
        description: description.trim() || null,
        color,
        requires_approval: approval,
        created_by: userId,
      })
      .select('id')
      .single();
    setBusy(false);
    if (error) return setError(friendlyError(error));
    await refetch();
    qc.invalidateQueries({ queryKey: ['members'] });
    setActiveClub(data.id);
    onCreated?.(data.id);
  }

  return (
    <Stack gap={space.md}>
      <Row gap={space.md}>
        <ClubLogo name={name || 'Club'} color={color} size={52} />
        <View style={{ flex: 1 }}>
          <Input label="Club name" value={name} onChangeText={setName} placeholder="e.g. Riverside Riders" maxLength={80} />
        </View>
      </Row>
      <Input label="Home town" value={city} onChangeText={setCity} placeholder="e.g. Utrecht" maxLength={80} />
      <Input label="About (optional)" value={description} onChangeText={setDescription} multiline placeholder="Who rides with you, where and when" maxLength={2000} />
      <View style={{ gap: 6 }}>
        <Txt variant="small" style={{ fontWeight: '600' }}>
          Club colour
        </Txt>
        <Row gap={10} wrap>
          {CLUB_COLORS.map((col) => (
            <Pressable
              key={col}
              accessibilityLabel={`Colour ${col}`}
              onPress={() => setColor(col)}
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.pill,
                backgroundColor: col,
                borderWidth: 3,
                borderColor: color === col ? c.ink : 'transparent',
              }}
            />
          ))}
        </Row>
      </View>
      <ToggleRow
        icon="shield-checkmark-outline"
        label="Approve new members"
        description="People with the invite code must be approved by an admin."
        value={approval}
        onChange={setApproval}
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button title="Create club" icon="flag-outline" onPress={create} loading={busy} />
    </Stack>
  );
}
