import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { ClubHeader } from '@/components/ClubHeader';
import { Fab } from '@/components/Fab';
import { RouteThumb } from '@/components/RouteThumb';
import { MAX_WIDTH, space, useTheme } from '@/components/theme';
import { Card, Chip, EmptyState, Icon, Input, Loading, Row, Txt } from '@/components/ui';
import { useRoutes } from '@/hooks/data';
import { rideTypeLabel } from '@/lib/format';
import { useClub } from '@/providers/ClubProvider';

type Filter = 'all' | 'fav' | 'short' | 'long';

export default function RoutesScreen() {
  const { c } = useTheme();
  const { club } = useClub();
  const routes = useRoutes(club?.id ?? null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (routes.data ?? []).filter((r) => {
      if (needle && !`${r.title} ${r.description ?? ''}`.toLowerCase().includes(needle)) return false;
      if (filter === 'fav' && !r.favorite) return false;
      if (filter === 'short' && Number(r.distance_km ?? 0) > 60) return false;
      if (filter === 'long' && Number(r.distance_km ?? 0) <= 60) return false;
      return true;
    });
  }, [routes.data, q, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ClubHeader title="Route library" subtitle="Every GPX your club has ridden" />
      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={routes.isRefetching} onRefresh={() => routes.refetch()} tintColor={c.brand} />}
        contentContainerStyle={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg, paddingBottom: 110, gap: space.md }}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <Input icon="search" value={q} onChangeText={setQ} placeholder="Search routes" autoCorrect={false} />
            <Row gap={8} wrap>
              <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label="Favourites" icon="star" active={filter === 'fav'} onPress={() => setFilter('fav')} />
              <Chip label="≤ 60 km" active={filter === 'short'} onPress={() => setFilter('short')} />
              <Chip label="> 60 km" active={filter === 'long'} onPress={() => setFilter('long')} />
            </Row>
          </View>
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/route/${item.id}`)} style={{ padding: space.md }}>
            <Row gap={space.md}>
              <RouteThumb line={item.preview} color={club?.color} />
              <View style={{ flex: 1, gap: 2 }}>
                <Row gap={6}>
                  <Txt variant="h3" numberOfLines={1} style={{ flex: 1 }}>
                    {item.title}
                  </Txt>
                  {item.favorite ? <Icon name="star" size={16} color={c.accent} /> : null}
                </Row>
                <Txt variant="small" muted>
                  {[
                    item.distance_km ? `${Number(item.distance_km)} km` : null,
                    item.elevation_gain_m ? `${item.elevation_gain_m} m ↑` : null,
                    item.ride_type ? rideTypeLabel(item.ride_type) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Txt>
                {item.visibility === 'public' ? (
                  <Txt variant="caption" color={c.brand}>
                    Public route
                  </Txt>
                ) : null}
              </View>
              <Icon name="chevron-forward" size={18} color={c.faint} />
            </Row>
          </Card>
        )}
        ListEmptyComponent={
          routes.isPending ? (
            <Loading />
          ) : (
            <EmptyState
              icon="map-outline"
              title={q || filter !== 'all' ? 'No matching routes' : 'No routes yet'}
              body="Upload a GPX from Komoot, Strava, RideWithGPS or your Garmin."
            />
          )
        }
      />
      <Fab label="Upload GPX" icon="cloud-upload-outline" onPress={() => router.push('/route/upload')} />
    </View>
  );
}
