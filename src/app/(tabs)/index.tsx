import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, SectionList, View, type ViewStyle } from 'react-native';

import { ClubHeader } from '@/components/ClubHeader';
import { Fab } from '@/components/Fab';
import { RideCard } from '@/components/RideCard';
import { DayStrip, dayKey, NextRideCard } from '@/components/RidesHome';
import { MAX_WIDTH, space, useTheme } from '@/components/theme';
import { Button, Chip, EmptyState, Row, Segmented, Sheet, SkeletonCard, Stack, ToggleRow, Txt } from '@/components/ui';
import { useMyRides, useRides, type RideRange } from '@/hooks/data';
import { dayLabel, RIDE_TYPES } from '@/lib/format';
import type { RideType, RideWithRelations } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useClub } from '@/providers/ClubProvider';

const WRAP: ViewStyle = { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg };

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Up early' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function RidesScreen() {
  const { c } = useTheme();
  const { profile, userId } = useAuth();
  const { club } = useClub();
  const [range, setRange] = useState<RideRange>('upcoming');
  const [includePublic, setIncludePublic] = useState(true);
  const [type, setType] = useState<RideType | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const rides = useRides({ clubId: club?.id ?? null, range, includePublic, type });
  const [now] = useState(() => Date.now());
  const mine = useMyRides();

  const nextRide = useMemo(
    () =>
      (mine.data ?? []).find(
        (r) => r.status === 'published' && r.rsvps.some((x) => x.user_id === userId && x.status === 'going') && new Date(r.starts_at).getTime() > now - 3600e3,
      ),
    [mine.data, userId, now],
  );

  const sections = useMemo(() => {
    const map = new Map<string, RideWithRelations[]>();
    for (const r of rides.data ?? []) {
      if (day && range !== 'past' && dayKey(r.starts_at) !== day) continue;
      const key = dayLabel(r.starts_at);
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [rides.data, day, range]);

  const weekCount = (rides.data ?? []).filter(
    (r) => r.status === 'published' && new Date(r.starts_at).getTime() < now + 7 * 864e5 && new Date(r.starts_at).getTime() > now,
  ).length;
  const firstName = profile?.display_name.split(' ')[0];
  const activeFilters = (includePublic ? 0 : 1) + (type ? 1 : 0) + (range === 'past' ? 1 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <SectionList
        sections={rides.isPending ? [] : sections}
        keyExtractor={(r) => r.id}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={rides.isRefetching}
            onRefresh={() => {
              rides.refetch();
              mine.refetch();
            }}
            tintColor={c.brand}
          />
        }
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: space.lg, marginBottom: space.xs }}>
            <ClubHeader
              title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
              subtitle={weekCount ? `${weekCount} ride${weekCount === 1 ? '' : 's'} on the calendar this week` : 'Nothing planned yet this week'}>
              {nextRide ? <NextRideCard ride={nextRide} /> : null}
            </ClubHeader>
            {range !== 'past' ? (
              <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>
                <DayStrip rides={rides.data ?? []} value={day} onChange={setDay} />
              </View>
            ) : null}
            <Row style={[WRAP, { justifyContent: 'space-between' }]}>
              <Txt variant="title">{range === 'past' ? 'Past rides' : day ? dayLabel(new Date(day).toISOString()) : 'Upcoming rides'}</Txt>
              <Chip icon="options-outline" label={activeFilters ? `Filters · ${activeFilters}` : 'Filters'} active={!!activeFilters} onPress={() => setFiltersOpen(true)} size="md" />
            </Row>
            {rides.isPending ? (
              <View style={[WRAP, { gap: space.md }]}>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={WRAP}>
            <Txt variant="label" style={{ marginTop: space.lg, marginBottom: space.sm }}>
              {section.title}
            </Txt>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        renderItem={({ item }) => (
          <View style={WRAP}>
            <RideCard ride={item} showClub={item.club_id !== club?.id} />
          </View>
        )}
        ListEmptyComponent={
          rides.isPending ? null : (
            <EmptyState
              icon="bicycle"
              title={range === 'past' ? 'No past rides' : day ? 'Nothing on this day' : 'No rides planned yet'}
              body={range === 'past' ? 'Rides from the last 90 days show up here.' : 'Plan one and your club gets a notification.'}
              action={range !== 'past' ? <Button title="Plan a ride" icon="add" variant="lime" onPress={() => router.push('/ride/new')} /> : undefined}
            />
          )
        }
        ListFooterComponent={
          rides.error ? (
            <Txt color={c.danger} center style={{ marginTop: space.lg }}>
              Could not load rides. Pull to retry.
            </Txt>
          ) : null
        }
      />

      <Fab label="Plan a ride" onPress={() => router.push('/ride/new')} />

      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <Stack gap={space.lg}>
          <Segmented
            value={range === 'past' ? 'past' : 'upcoming'}
            onChange={(v) => {
              setRange(v);
              setDay(null);
            }}
            options={[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past 90 days' },
            ]}
          />
          <ToggleRow icon="globe-outline" label="Open rides from other clubs" description="Public rides anyone can join." value={includePublic} onChange={setIncludePublic} />
          <View style={{ gap: 10 }}>
            <Txt variant="label">Ride type</Txt>
            <Row wrap gap={8}>
              <Chip label="All types" active={!type} onPress={() => setType(null)} size="md" />
              {RIDE_TYPES.map((t) => (
                <Chip key={t.value} label={t.label} icon={t.icon as never} active={type === t.value} onPress={() => setType(t.value)} size="md" />
              ))}
            </Row>
          </View>
          <Button title="Show rides" onPress={() => setFiltersOpen(false)} />
        </Stack>
      </Sheet>
    </View>
  );
}
