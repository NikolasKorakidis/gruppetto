import { router, Stack as RouterStack } from 'expo-router';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { MAX_WIDTH, radius, space, useTheme } from '@/components/theme';
import { Button, EmptyState, Icon, Loading, Row, Txt, type IconName } from '@/components/ui';
import { useMarkNotificationsRead, useNotifications } from '@/hooks/data';
import { fmtRelative } from '@/lib/format';
import type { AppNotification } from '@/lib/types';
import { useClub } from '@/providers/ClubProvider';

const ICONS: Record<string, IconName> = {
  ride_new: 'bicycle',
  ride_changed: 'create',
  ride_cancelled: 'close-circle',
  ride_reactivated: 'refresh-circle',
  comment: 'chatbubble',
  news: 'newspaper',
  member_request: 'person-add',
  member_approved: 'checkmark-circle',
};

export default function Notifications() {
  const { c } = useTheme();
  const { setActiveClub } = useClub();
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unread = list.data?.filter((n) => !n.read_at).length ?? 0;

  function open(n: AppNotification) {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.club_id && (n.type === 'news' || n.type.startsWith('member'))) setActiveClub(n.club_id);
    if (n.ride_id) router.push(`/ride/${n.ride_id}`);
    else if (n.type === 'news' && n.data.post_id) router.push(`/news/${n.data.post_id}`);
    else if (n.type === 'member_request') router.push('/club/manage');
    else if (n.type === 'member_approved') router.navigate('/');
  }

  if (list.isPending) return <Loading />;

  return (
    <>
      <RouterStack.Screen
        options={{ headerRight: () => (unread ? <Button title="Mark all read" variant="ghost" small onPress={() => markRead.mutate(undefined)} /> : null) }}
      />
      <FlatList
        style={{ backgroundColor: c.bg }}
        data={list.data}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={c.brand} />}
        contentContainerStyle={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg, gap: space.sm }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => open(item)}
            style={({ pressed }) => ({
              backgroundColor: item.read_at ? c.card : c.brandSoft,
              borderRadius: radius.lg,
              padding: space.md,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Row gap={12} align="flex-start">
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.subtle, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={ICONS[item.type] ?? 'notifications'} size={18} color={item.type === 'ride_cancelled' ? c.danger : c.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontWeight: item.read_at ? '500' : '700' }}>{item.title}</Txt>
                {item.body ? (
                  <Txt variant="small" muted numberOfLines={2}>
                    {item.body}
                  </Txt>
                ) : null}
                <Txt variant="caption">{fmtRelative(item.created_at)}</Txt>
              </View>
            </Row>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState icon="notifications-off-outline" title="All quiet" body="New rides, changes and chat messages will show up here." />}
      />
    </>
  );
}
