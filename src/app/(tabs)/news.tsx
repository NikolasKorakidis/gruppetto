import { router } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';

import { ClubHeader } from '@/components/ClubHeader';
import { Fab } from '@/components/Fab';
import { MAX_WIDTH, space, useTheme } from '@/components/theme';
import { Avatar, Card, Chip, EmptyState, Loading, Row, Txt } from '@/components/ui';
import { useNews } from '@/hooks/data';
import { fmtRelative } from '@/lib/format';
import { useClub } from '@/providers/ClubProvider';

export default function NewsScreen() {
  const { c } = useTheme();
  const { club, isAdmin } = useClub();
  const news = useNews(club?.id ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ClubHeader title="Club news" subtitle="Announcements from your club" />
      {news.isPending ? (
        <Loading />
      ) : (
        <FlatList
          data={news.data}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={news.isRefetching} onRefresh={() => news.refetch()} tintColor={c.brand} />}
          contentContainerStyle={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg, paddingBottom: 110, gap: space.md }}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/news/${item.id}`)}>
              <Row gap={8} style={{ marginBottom: 8 }}>
                <Avatar name={item.author.display_name} url={item.author.avatar_url} size={24} />
                <Txt variant="small" muted style={{ flex: 1 }}>
                  {item.author.display_name} · {fmtRelative(item.created_at)}
                </Txt>
                {item.pinned ? <Chip icon="pin" label="Pinned" tone="accent" /> : null}
              </Row>
              <Txt variant="h2">{item.title}</Txt>
              <Txt muted numberOfLines={3} style={{ marginTop: 4 }}>
                {item.body}
              </Txt>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="newspaper-outline"
              title="No news yet"
              body={isAdmin ? 'Share the season calendar, a route change or a social event.' : 'Club announcements will show up here.'}
            />
          }
        />
      )}
      {isAdmin ? <Fab label="New post" icon="create-outline" onPress={() => router.push('/news/new')} /> : null}
    </View>
  );
}
