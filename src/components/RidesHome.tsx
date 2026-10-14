import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { dayLabel, fmtTime } from '@/lib/format';
import type { RideWithRelations } from '@/lib/types';

import { RideStats } from './RideCard';
import { RouteThumb } from './RouteThumb';
import { font, radius, space, useTheme } from './theme';
import { AvatarStack, Row, Txt } from './ui';

function countdown(iso: string, nowMs: number) {
  const diff = new Date(iso).getTime() - nowMs;
  if (diff <= 0) return 'Rolling now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${String(mins % 60).padStart(2, '0')}m`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/** Highlight card for the next ride you're going to (sits in the dark header). */
export function NextRideCard({ ride }: { ride: RideWithRelations }) {
  const { c } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const going = ride.rsvps.filter((r) => r.status === 'going');

  return (
    <Pressable
      onPress={() => router.push(`/ride/${ride.id}`)}
      style={({ pressed }) => ({
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: radius.xl,
        padding: space.lg,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}>
      <Row align="flex-start" gap={space.md}>
        <View style={{ flex: 1, gap: 6 }}>
          <Row gap={6}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.lime }} />
            <Txt variant="label" color={c.lime}>
              Your next ride · {countdown(ride.starts_at, now)}
            </Txt>
          </Row>
          <Txt variant="title" color={c.onHero} numberOfLines={2}>
            {ride.title}
          </Txt>
          <Txt variant="small" color={c.onHeroMuted}>
            {dayLabel(ride.starts_at)} · {fmtTime(ride.starts_at)}
            {ride.start_name ? ` · ${ride.start_name}` : ''}
          </Txt>
        </View>
        {ride.route?.preview?.length ? (
          <RouteThumb line={ride.route.preview} size={78} color={c.lime} bg="rgba(255,255,255,0.06)" strokeWidth={2.6} />
        ) : null}
      </Row>
      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: space.md }} />
      <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
        <View style={{ flex: 1 }}>
          <RideStats ride={ride} light />
        </View>
        {going.length ? (
          <Row gap={6}>
            <AvatarStack people={going.map((r) => ({ id: r.user_id, name: r.profile.display_name, url: r.profile.avatar_url }))} max={3} size={24} ring={c.heroSoft} />
          </Row>
        ) : null}
      </Row>
    </Pressable>
  );
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const dayKey = (iso: string | Date) => startOfDay(new Date(iso)).toDateString();

function DayPill({
  k,
  top,
  main,
  dots,
  selected,
  onChange,
}: {
  k: string | null;
  top: string;
  main: string;
  dots: number;
  selected: string | null;
  onChange: (key: string | null) => void;
}) {
  const { c } = useTheme();
  const active = selected === k;
  return (
    <Pressable
      onPress={() => onChange(k)}
      style={({ pressed }) => ({
        width: 52,
        paddingVertical: 10,
        borderRadius: radius.lg,
        alignItems: 'center',
        gap: 3,
        backgroundColor: active ? c.inverse : c.card,
        transform: [{ scale: pressed ? 0.95 : 1 }],
      })}>
      <Text style={[font('600'), { fontSize: 11.5, color: active ? c.onInverse : c.muted, textTransform: 'uppercase' }]}>{top}</Text>
      <Text style={[font('800'), { fontSize: 18, color: active ? c.onInverse : c.ink }]}>{main}</Text>
      <View style={{ flexDirection: 'row', gap: 3, height: 5 }}>
        {Array.from({ length: Math.min(dots, 3) }).map((_, i) => (
          <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: active ? c.lime : c.brand }} />
        ))}
      </View>
    </Pressable>
  );
}

/** Two weeks of days; dots mark days with rides. `null` = all days. */
export function DayStrip({ rides, value, onChange }: { rides: RideWithRelations[]; value: string | null; onChange: (key: string | null) => void }) {
  const { c } = useTheme();
  const today = startOfDay(new Date());
  // Calendar-day steps (not 24h steps) so daylight-saving changes don't repeat or skip a day.
  const days = Array.from({ length: 14 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
  const counts = new Map<string, number>();
  rides.forEach((r) => counts.set(dayKey(r.starts_at), (counts.get(dayKey(r.starts_at)) ?? 0) + 1));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space.lg }}>
      <Pressable
        onPress={() => onChange(null)}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          borderRadius: radius.lg,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: value === null ? c.inverse : c.card,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}>
        <Ionicons name="calendar-outline" size={18} color={value === null ? c.lime : c.ink} />
        <Text style={[font('700'), { fontSize: 12, marginTop: 3, color: value === null ? c.onInverse : c.ink }]}>All</Text>
      </Pressable>
      {days.map((d) => (
        <DayPill
          selected={value}
          onChange={onChange}
          key={d.toDateString()}
          k={d.toDateString()}
          top={d.getTime() === today.getTime() ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' })}
          main={String(d.getDate())}
          dots={counts.get(d.toDateString()) ?? 0}
        />
      ))}
    </ScrollView>
  );
}
