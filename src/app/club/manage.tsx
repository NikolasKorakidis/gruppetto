import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { CLUB_COLORS } from '@/components/ClubForms';
import { radius, space, useTheme } from '@/components/theme';
import {
  Avatar,
  Banner,
  Button,
  Card,
  ClubLogo,
  confirmAsync,
  Icon,
  Input,
  Row,
  Screen,
  SectionHeader,
  Sheet,
  showMessage,
  Stack,
  ToggleRow,
  Txt,
} from '@/components/ui';
import { useMembers, useSavedLocations } from '@/hooks/data';
import { fmtRelative, ROLE_LABEL } from '@/lib/format';
import { inviteLink } from '@/lib/links';
import { friendlyError, supabase } from '@/lib/supabase';
import type { ClubRole, Member } from '@/lib/types';
import { pickAndUploadImage } from '@/lib/upload';
import { useAuth } from '@/providers/AuthProvider';
import { useClub } from '@/providers/ClubProvider';

export default function ManageClub() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { club, role, isAdmin, refetch } = useClub();
  const members = useMembers(club?.id ?? null);
  const locations = useSavedLocations(club?.id ?? null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [name, setName] = useState(club?.name ?? '');
  const [city, setCity] = useState(club?.city ?? '');
  const [description, setDescription] = useState(club?.description ?? '');
  const [color, setColor] = useState(club?.color ?? CLUB_COLORS[0]);
  const [approval, setApproval] = useState(club?.requires_approval ?? true);
  const [busy, setBusy] = useState(false);

  if (!club || !isAdmin) {
    return (
      <Screen>
        <Banner tone="warn">Only club admins can manage the club.</Banner>
      </Screen>
    );
  }

  const link = inviteLink(club.invite_code);
  const pending = (members.data ?? []).filter((m) => m.status === 'pending');
  const active = (members.data ?? []).filter((m) => m.status === 'active');
  const isOwner = role === 'owner';

  const refreshMembers = () => qc.invalidateQueries({ queryKey: ['members', club.id] });

  async function decide(m: Member, approve: boolean) {
    const { error } = await supabase
      .from('club_members')
      .update({ status: approve ? 'active' : 'rejected' })
      .eq('club_id', club!.id)
      .eq('user_id', m.user_id);
    if (error) return showMessage('Error', friendlyError(error));
    refreshMembers();
  }

  async function setRole(m: Member, next: ClubRole) {
    const { error } = await supabase.from('club_members').update({ role: next }).eq('club_id', club!.id).eq('user_id', m.user_id);
    if (error) return showMessage('Not allowed', friendlyError(error));
    setEditing(null);
    refreshMembers();
    if (m.user_id === userId) refetch();
  }

  async function removeMember(m: Member) {
    if (!(await confirmAsync(`Remove ${m.profile.display_name}?`, 'They lose access to club rides, routes and news.', 'Remove', true))) return;
    const { error } = await supabase.from('club_members').delete().eq('club_id', club!.id).eq('user_id', m.user_id);
    if (error) return showMessage('Not allowed', friendlyError(error));
    setEditing(null);
    refreshMembers();
  }

  async function regenerate() {
    if (!(await confirmAsync('New invite code?', 'The old code and link stop working immediately.', 'Regenerate'))) return;
    const { error } = await supabase.rpc('regenerate_invite_code', { p_club: club!.id });
    if (error) return showMessage('Error', friendlyError(error));
    refetch();
  }

  async function saveSettings() {
    setBusy(true);
    const { error } = await supabase
      .from('clubs')
      .update({ name: name.trim(), city: city.trim() || null, description: description.trim() || null, color, requires_approval: approval })
      .eq('id', club!.id);
    setBusy(false);
    if (error) return showMessage('Could not save', friendlyError(error));
    await refetch();
    qc.invalidateQueries({ queryKey: ['rides'] });
    showMessage('Saved');
  }

  async function changeLogo() {
    try {
      const url = await pickAndUploadImage('club-logos', club!.id);
      if (!url) return;
      const { error } = await supabase.from('clubs').update({ logo_url: url }).eq('id', club!.id);
      if (error) throw error;
      refetch();
    } catch (e) {
      showMessage('Upload failed', friendlyError(e));
    }
  }

  async function deleteClub() {
    if (!(await confirmAsync(`Delete ${club!.name}?`, 'All rides, routes, news and memberships are permanently deleted.', 'Delete club', true))) return;
    const { error } = await supabase.from('clubs').delete().eq('id', club!.id);
    if (error) return showMessage('Could not delete', friendlyError(error));
    await refetch();
    router.replace('/');
  }

  const roleOptions: ClubRole[] = isOwner ? ['member', 'leader', 'admin', 'owner'] : ['member', 'leader'];

  return (
    <Screen>
      <Stack gap={space.md}>
        <SectionHeader title="Invite riders" />
        <Card>
          <Stack gap={space.md} style={{ alignItems: 'center' }}>
            <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: radius.md }}>
              <QRCode value={link} size={168} />
            </View>
            <Txt variant="caption">Scan to join, or share the code</Txt>
            <Txt variant="title" style={{ letterSpacing: 4 }} selectable>
              {club.invite_code}
            </Txt>
            <Row gap={8}>
              <Button
                title="Copy link"
                icon="copy-outline"
                variant="secondary"
                small
                onPress={async () => {
                  await Clipboard.setStringAsync(link);
                  showMessage('Invite link copied');
                }}
              />
              <Button
                title="Share"
                icon="share-outline"
                small
                onPress={() => Share.share({ message: `Join ${club.name} on Gruppetto: ${link} (code ${club.invite_code})` }).catch(() => {})}
              />
            </Row>
            <Button title="Regenerate code" variant="ghost" small onPress={regenerate} />
          </Stack>
        </Card>

        {pending.length ? (
          <>
            <SectionHeader title={`Join requests · ${pending.length}`} />
            {pending.map((m) => (
              <Card key={m.user_id} style={{ padding: space.md }}>
                <Row gap={10}>
                  <Avatar name={m.profile.display_name} url={m.profile.avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: '700' }}>{m.profile.display_name}</Txt>
                    <Txt variant="caption">requested {fmtRelative(m.requested_at)}</Txt>
                  </View>
                  <Button title="Decline" variant="ghost" small onPress={() => decide(m, false)} />
                  <Button title="Approve" variant="brand" small onPress={() => decide(m, true)} />
                </Row>
              </Card>
            ))}
          </>
        ) : null}

        <SectionHeader title={`Members · ${active.length}`} />
        <Card padded={false}>
          {active.map((m, i) => (
            <Pressable
              key={m.user_id}
              onPress={() => setEditing(m)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, borderTopWidth: i ? 1 : 0, borderTopColor: c.border })}>
              <Row gap={10} style={{ padding: space.md }}>
                <Avatar name={m.profile.display_name} url={m.profile.avatar_url} size={34} />
                <Txt style={{ flex: 1, fontWeight: '600' }}>{m.profile.display_name}</Txt>
                <Txt variant="small" muted>
                  {ROLE_LABEL[m.role]}
                </Txt>
                <Icon name="chevron-forward" size={16} color={c.faint} />
              </Row>
            </Pressable>
          ))}
        </Card>

        <SectionHeader title="Club details" />
        <Card>
          <Stack gap={space.md}>
            <Pressable onPress={changeLogo}>
              <Row gap={space.md}>
                <ClubLogo name={club.name} url={club.logo_url} color={color} size={56} />
                <Txt color={c.brand} style={{ fontWeight: '700' }}>
                  Change logo
                </Txt>
              </Row>
            </Pressable>
            <Input label="Name" value={name} onChangeText={setName} maxLength={80} />
            <Input label="Home town" value={city} onChangeText={setCity} maxLength={80} />
            <Input label="About" value={description} onChangeText={setDescription} multiline maxLength={2000} />
            <Row gap={10} wrap>
              {CLUB_COLORS.map((col) => (
                <Pressable
                  key={col}
                  accessibilityLabel={`Colour ${col}`}
                  onPress={() => setColor(col)}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: col, borderWidth: 3, borderColor: color === col ? c.ink : 'transparent' }}
                />
              ))}
            </Row>
            <ToggleRow icon="shield-checkmark-outline" label="Approve new members" value={approval} onChange={setApproval} />
            <Button title="Save details" onPress={saveSettings} loading={busy} />
          </Stack>
        </Card>

        {locations.data?.length ? (
          <>
            <SectionHeader title="Start locations" />
            <Card padded={false}>
              {locations.data.map((l, i) => (
                <Row key={l.id} gap={10} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                  <Icon name="location-outline" size={18} color={c.muted} />
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: '600' }}>{l.name}</Txt>
                    {l.address ? <Txt variant="small" muted>{l.address}</Txt> : null}
                  </View>
                  <Pressable
                    accessibilityLabel={`Delete ${l.name}`}
                    onPress={async () => {
                      await supabase.from('saved_locations').delete().eq('id', l.id);
                      qc.invalidateQueries({ queryKey: ['locations', club.id] });
                    }}>
                    <Icon name="trash-outline" size={18} color={c.danger} />
                  </Pressable>
                </Row>
              ))}
            </Card>
          </>
        ) : null}

        {isOwner ? (
          <>
            <SectionHeader title="Danger zone" />
            <Button title="Delete club" icon="trash-outline" variant="danger" onPress={deleteClub} />
          </>
        ) : null}
      </Stack>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.profile.display_name}>
        {editing ? (
          <Stack gap={space.sm}>
            <Txt variant="label">Role</Txt>
            {roleOptions.map((r) => (
              <Pressable key={r} onPress={() => setRole(editing, r)}>
                <Row gap={10} style={{ padding: 12, borderRadius: radius.md, backgroundColor: editing.role === r ? c.brandSoft : c.subtle }}>
                  <Icon name={editing.role === r ? 'radio-button-on' : 'radio-button-off'} size={18} color={editing.role === r ? c.brand : c.muted} />
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: '700' }}>{ROLE_LABEL[r]}</Txt>
                    <Txt variant="small" muted>
                      {
                        {
                          member: 'Rides, signs up, chats, uploads routes.',
                          leader: 'Can be assigned to lead rides and manage them.',
                          admin: 'Manages members, news, rides and club settings.',
                          owner: 'Full control, including deleting the club.',
                        }[r]
                      }
                    </Txt>
                  </View>
                </Row>
              </Pressable>
            ))}
            {editing.user_id !== userId ? (
              <Button title="Remove from club" variant="danger" icon="person-remove-outline" onPress={() => removeMember(editing)} style={{ marginTop: space.md }} />
            ) : null}
          </Stack>
        ) : null}
      </Sheet>
    </Screen>
  );
}
