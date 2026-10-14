import { router } from 'expo-router';
import { FlatList, RefreshControl } from 'react-native';

import { RideCard } from '@/components/RideCard';
import { MAX_WIDTH, space, useTheme } from '@/components/theme';
import { Button, EmptyState, Loading } from '@/components/ui';
import { useMyRides } from '@/hooks/data';

export default function MyRides() {
  const { c } = useTheme();
  const rides = useMyRides();
  if (rides.isPending) return <Loading />;
  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      data={rides.data}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={rides.isRefetching} onRefresh={() => rides.refetch()} tintColor={c.brand} />}
      contentContainerStyle={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg, gap: space.md }}
      renderItem={({ item }) => <RideCard ride={item} showClub />}
      ListEmptyComponent={
        <EmptyState
          icon="calendar-clear-outline"
          title="Nothing planned"
          body="Rides you sign up for or organise show up here."
          action={<Button title="Browse rides" onPress={() => router.navigate('/')} />}
        />
      }
    />
  );
}
