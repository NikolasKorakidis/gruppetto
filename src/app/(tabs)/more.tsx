import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ClubHeader } from '@/components/ClubHeader';
import { MAX_WIDTH, space, useTheme } from '@/components/theme';
import { Button, Card, confirmAsync, Icon, IconTile, Row, showMessage, Txt, type IconName } from '@/components/ui';
import { resetDemoData } from '@/demo/backend';
import { friendlyError, isDemo, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useClub } from '@/providers/ClubProvider';

function Item({ icon, label, detail, onPress, danger }: { icon: IconName; label: string; detail?: string; onPress: () => void; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Row gap={14} style={{ paddingVertical: 11, paddingHorizontal: space.lg }}>
        <IconTile icon={icon} size={38} color={danger ? c.danger : c.ink} bg={danger ? c.dangerSoft : c.subtle} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontWeight: '600' }} color={danger ? c.danger : undefined}>
            {label}
          </Txt>
          {detail ? <Txt variant="small" muted>{detail}</Txt> : null}
        </View>
        {!danger ? <Icon name="chevron-forward" size={16} color={c.faint} /> : null}
      </Row>
    </Pressable>
  );
}

export default function MoreScreen() {
  const { c } = useTheme();
  const { userId, email, signOut } = useAuth();
  const { club, role, refetch } = useClub();

  async function leave() {
    if (!club) return;
    if (!(await confirmAsync(`Leave ${club.name}?`, 'You can rejoin later with the invite code.', 'Leave', true))) return;
    const { error } = await supabase.from('club_members').delete().eq('club_id', club.id).eq('user_id', userId!);
    if (error) return showMessage('Could not leave', friendlyError(error));
    await refetch();
  }

  const group = (children: ReactNode) => (
    <Card padded={false} style={{ marginBottom: space.lg }}>
      {children}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ClubHeader title="More" />
      <ScrollView contentContainerStyle={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg }}>
        {group(
          <>
            <Item icon="bicycle-outline" label="My rides" detail="Rides you joined or organise" onPress={() => router.push('/my-rides')} />
            <Item icon="calendar-outline" label="Calendar sync" detail="Rides in Apple, Google or Outlook calendar" onPress={() => router.push('/calendar')} />
            <Item icon="notifications-outline" label="Notifications" onPress={() => router.push('/notifications')} />
          </>,
        )}
        {group(
          <>
            <Item icon="enter-outline" label="Join another club" onPress={() => router.push('/club/join')} />
            <Item icon="add-circle-outline" label="Create a club" onPress={() => router.push('/club/new')} />
            {role === 'owner' || role === 'admin' ? <Item icon="settings-outline" label="Manage club" onPress={() => router.push('/club/manage')} /> : null}
            {club && role !== 'owner' ? <Item icon="exit-outline" label={`Leave ${club.name}`} danger onPress={leave} /> : null}
          </>,
        )}
        {group(
          <>
            <Item icon="person-circle-outline" label="Profile & settings" detail={email ?? undefined} onPress={() => router.push('/profile')} />
            <Item icon="log-out-outline" label="Sign out" danger onPress={signOut} />
          </>,
        )}
        {isDemo ? (
          <Card style={{ marginBottom: space.lg }}>
            <Row gap={12}>
              <IconTile icon="flask" color={c.brand} bg={c.brandSoft} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Demo mode</Txt>
                <Txt variant="small" muted>
                  Sample data, saved on this device only.
                </Txt>
              </View>
              <Button
                title="Reset"
                small
                variant="secondary"
                onPress={async () => {
                  if (await confirmAsync('Reset demo data?', 'All sample clubs, rides and chats go back to the start.', 'Reset')) resetDemoData();
                }}
              />
            </Row>
          </Card>
        ) : null}
        <Txt variant="caption" center>
          gruppetto · group rides, sorted
        </Txt>
      </ScrollView>
    </View>
  );
}
