import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmtDuration, fmtTime, rideTypeIcon, rideTypeLabel } from '@/lib/format';
import type { RideWithRelations } from '@/lib/types';

import { RouteThumb } from './RouteThumb';
import { RsvpControl } from './RsvpControl';
import { elevation, font, radius, space, useTheme } from './theme';
import { AvatarStack, Chip, ClubLogo, Row, Txt, type IconName } from './ui';

const num = (n: number | null | undefined, digits = 0) =>
  n == null ? null : Number(n).toLocaleString('en-GB', { maximumFractionDigits: digits });

/** Distance · speed · time · climbing as compact inline stats. */
export function RideStats({ ride, light }: { ride: RideWithRelations; light?: boolean }) {
  const { c } = useTheme();
  const items: { icon: IconName; value: string | null; unit: string }[] = [
    { icon: 'navigate-outline', value: num(ride.distance_km, 1), unit: 'km' },
    { icon: 'speedometer-outline', value: num(ride.avg_speed_kmh, 1), unit: 'km/h' },
    { icon: 'time-outline', value: fmtDuration(ride.duration_minutes), unit: '' },
    { icon: 'trending-up', value: ride.elevation_gain_m ? num(ride.elevation_gain_m) : null, unit: 'm' },
  ];
  const fg = light ? 'rgba(255,255,255,0.92)' : c.ink;
  const sub = light ? 'rgba(255,255,255,0.55)' : c.faint;
  return (
    <Row gap={14} wrap>
      {items
        .filter((i) => i.value)
        .map((i) => (
          <Row key={i.icon} gap={4}>
            <Ionicons name={i.icon} size={14} color={sub} />
            <Text style={[font('700'), { color: fg, fontSize: 13.5 }]}>
              {i.value}
              {i.unit ? <Text style={[font('500'), { color: sub, fontSize: 12 }]}> {i.unit}</Text> : null}
            </Text>
          </Row>
        ))}
    </Row>
  );
}

/** Only the tags that say something special about the ride. */
export function RideTags({ ride, withType }: { ride: RideWithRelations; withType?: boolean }) {
  const goingCount = ride.rsvps.filter((r) => r.status === 'going').length;
  const full = ride.max_participants != null && goingCount >= ride.max_participants;
  const tags = [
    withType ? <Chip key="type" icon={rideTypeIcon(ride.ride_type) as IconName} label={rideTypeLabel(ride.ride_type)} /> : null,
    ride.has_stopover ? <Chip key="cafe" icon="cafe" label="Coffee stop" tone="warn" /> : null,
    ride.visibility === 'public' ? <Chip key="pub" icon="globe-outline" label="Open to all" tone="brand" /> : null,
    ride.subgroups.length ? <Chip key="grp" icon="layers-outline" label={`${ride.subgroups.length} groups`} /> : null,
    full ? <Chip key="full" icon="lock-closed" label="Full" tone="danger" /> : ride.max_participants ? <Chip key="cap" icon="people-outline" label={`${goingCount}/${ride.max_participants}`} /> : null,
  ].filter(Boolean);
  if (!tags.length) return null;
  return (
    <Row wrap gap={6}>
      {tags}
    </Row>
  );
}

export function RideCard({ ride, showClub }: { ride: RideWithRelations; showClub?: boolean }) {
  const { c, isDark } = useTheme();
  const going = ride.rsvps.filter((r) => r.status === 'going');
  const comments = ride.comments?.[0]?.count ?? 0;
  const cancelled = ride.status === 'cancelled';
  const location = ride.start_name || ride.start_address;

  return (
    <Pressable
      onPress={() => router.push(`/ride/${ride.id}`)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.card, borderColor: c.border, borderWidth: isDark ? StyleSheet.hairlineWidth : 0 },
        elevation(c, 1),
        pressed && { transform: [{ scale: 0.985 }] },
      ]}>
      <View style={{ padding: space.lg, gap: space.md }}>
        <Row align="flex-start" gap={space.md}>
          <View style={{ flex: 1, gap: 6 }}>
            <Row gap={8}>
              <View style={[styles.time, { backgroundColor: cancelled ? c.subtle : `${ride.club.color}1A` }]}>
                <Ionicons name={rideTypeIcon(ride.ride_type) as IconName} size={13} color={cancelled ? c.muted : ride.club.color} />
                <Text style={[font('800'), { color: cancelled ? c.muted : ride.club.color, fontSize: 13 }]}>{fmtTime(ride.starts_at)}</Text>
              </View>
              {cancelled ? <Chip icon="close-circle" label="Cancelled" tone="danger" /> : null}
            </Row>
            <Txt variant="h2" numberOfLines={2} style={cancelled && { textDecorationLine: 'line-through', color: c.muted }}>
              {ride.title}
            </Txt>
            {location ? (
              <Row gap={5}>
                <Ionicons name="location-outline" size={14} color={c.faint} />
                <Txt variant="small" muted numberOfLines={1} style={{ flex: 1 }}>
                  {location}
                </Txt>
              </Row>
            ) : null}
            {showClub ? (
              <Row gap={6}>
                <ClubLogo name={ride.club.name} url={ride.club.logo_url} color={ride.club.color} size={18} />
                <Txt variant="small" style={{ fontWeight: '600' }} numberOfLines={1}>
                  {ride.club.name}
                </Txt>
              </Row>
            ) : null}
          </View>
          {ride.route?.preview?.length ? <RouteThumb line={ride.route.preview} size={74} color={cancelled ? c.faint : ride.club.color} /> : null}
        </Row>

        <RideStats ride={ride} />
        <RideTags ride={ride} />
        {cancelled && ride.cancel_reason ? (
          <Txt variant="small" color={c.danger}>
            {ride.cancel_reason}
          </Txt>
        ) : null}
      </View>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <Row gap={8} style={{ flex: 1 }}>
          {going.length ? (
            <>
              <AvatarStack people={going.map((r) => ({ id: r.user_id, name: r.profile.display_name, url: r.profile.avatar_url }))} max={4} size={26} />
              <Txt variant="small" style={{ fontWeight: '700' }}>
                {going.length} going
              </Txt>
            </>
          ) : (
            <Txt variant="small" muted>
              Be the first to join
            </Txt>
          )}
          {comments ? (
            <Row gap={3} style={{ marginLeft: 4 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={15} color={c.faint} />
              <Txt variant="small" muted style={{ fontWeight: '600' }}>
                {comments}
              </Txt>
            </Row>
          ) : null}
        </Row>
        <RsvpControl ride={ride} compact />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg + 2, overflow: 'visible' },
  time: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
});
