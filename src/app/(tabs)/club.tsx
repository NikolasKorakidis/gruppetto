import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, View } from 'react-native';

import { ClubHeader } from '@/components/ClubHeader';
import { MAX_WIDTH, radius, space, useTheme } from '@/components/theme';
import { Avatar, Banner, Button, Card, ClubLogo, Icon, Input, Row, Sheet, Stack, Txt } from '@/components/ui';
import { useMembers } from '@/hooks/data';
import { supabase } from '@/lib/supabase';
import { ROLE_LABEL } from '@/lib/format';
import type { Member, ProfilePrivate } from '@/lib/types';
import { useClub } from '@/providers/ClubProvider';

export default function ClubScreen() {
  const { c } = useTheme();
  const { club, isAdmin } = useClub();
  const members = useMembers(club?.id ?? null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Member | null>(null);

  const active = useMemo(() => (members.data ?? []).filter((m) => m.status === 'active'), [members.data]);
  const pending = (members.data ?? []).filter((m) => m.status === 'pending').length;
  const list = active.filter((m) => m.profile.display_name.toLowerCase().includes(q.trim().toLowerCase()));

  if (!club) return null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ClubHeader />
      <FlatList
        data={list}
        keyExtractor={(m) => m.user_id}
        refreshControl={<RefreshControl refreshing={members.isRefetching} onRefresh={() => members.refetch()} tintColor={c.brand} />}
        contentContainerStyle={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg, paddingBottom: 60, gap: 2 }}
        ListHeaderComponent={
          <Stack gap={space.md} style={{ marginBottom: space.md }}>
            <Card>
              <Row gap={space.md}>
                <ClubLogo name={club.name} url={club.logo_url} color={club.color} size={60} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h2">{club.name}</Txt>
                  <Txt variant="small" muted>
                    {[club.city, `${active.length} member${active.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
              </Row>
              {club.description ? <Txt style={{ marginTop: space.md }}>{club.description}</Txt> : null}
            </Card>
            {isAdmin ? (
              <>
                {pending ? (
                  <Pressable onPress={() => router.push('/club/manage')}>
                    <Banner tone="warn" icon="person-add">
                      {`${pending} join request${pending === 1 ? '' : 's'} waiting — tap to review`}
                    </Banner>
                  </Pressable>
                ) : null}
                <Button title="Manage club & invite riders" icon="settings-outline" variant="secondary" onPress={() => router.push('/club/manage')} />
              </>
            ) : null}
            <Input icon="search" value={q} onChangeText={setQ} placeholder="Search members" autoCorrect={false} />
          </Stack>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Row gap={12} style={{ paddingVertical: 10 }}>
              <Avatar name={item.profile.display_name} url={item.profile.avatar_url} size={42} />
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '700' }}>{item.profile.display_name}</Txt>
                {item.profile.city ? <Txt variant="small" muted>{item.profile.city}</Txt> : null}
              </View>
              {item.role !== 'member' ? (
                <View style={{ backgroundColor: item.role === 'leader' ? c.brandSoft : c.accentSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill }}>
                  <Txt variant="caption" color={item.role === 'leader' ? c.brand : c.accent} style={{ fontWeight: '700' }}>
                    {ROLE_LABEL[item.role]}
                  </Txt>
                </View>
              ) : null}
            </Row>
          </Pressable>
        )}
      />
      <MemberSheet member={selected} onClose={() => setSelected(null)} canSeePrivate={isAdmin} />
    </View>
  );
}

function MemberSheet({ member, onClose, canSeePrivate }: { member: Member | null; onClose: () => void; canSeePrivate: boolean }) {
  const { c } = useTheme();
  const priv = useQuery({
    queryKey: ['private', member?.user_id],
    enabled: !!member && canSeePrivate,
    queryFn: async () => {
      const { data } = await supabase.from('profile_private').select('*').eq('user_id', member!.user_id).maybeSingle();
      return data as ProfilePrivate | null;
    },
  });
  return (
    <Sheet visible={!!member} onClose={onClose}>
      {member ? (
        <Stack gap={space.md} style={{ alignItems: 'center', paddingBottom: space.md }}>
          <Avatar name={member.profile.display_name} url={member.profile.avatar_url} size={88} />
          <Txt variant="title">{member.profile.display_name}</Txt>
          <Txt muted>
            {ROLE_LABEL[member.role]}
            {member.profile.city ? ` · ${member.profile.city}` : ''}
          </Txt>
          {canSeePrivate && priv.data && (priv.data.phone || priv.data.emergency_phone) ? (
            <Card style={{ alignSelf: 'stretch' }}>
              <Txt variant="label" style={{ marginBottom: 8 }}>
                Admin only
              </Txt>
              {priv.data.phone ? (
                <Pressable onPress={() => Linking.openURL(`tel:${priv.data!.phone}`)}>
                  <Row gap={8} style={{ paddingVertical: 4 }}>
                    <Icon name="call-outline" size={16} />
                    <Txt>{priv.data.phone}</Txt>
                  </Row>
                </Pressable>
              ) : null}
              {priv.data.emergency_phone ? (
                <Pressable onPress={() => Linking.openURL(`tel:${priv.data!.emergency_phone}`)}>
                  <Row gap={8} style={{ paddingVertical: 4 }}>
                    <Icon name="medkit-outline" size={16} color={c.danger} />
                    <Txt>
                      ICE: {priv.data.emergency_name ? `${priv.data.emergency_name} · ` : ''}
                      {priv.data.emergency_phone}
                    </Txt>
                  </Row>
                </Pressable>
              ) : null}
            </Card>
          ) : null}
        </Stack>
      ) : null}
    </Sheet>
  );
}
