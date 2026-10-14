import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

import { useRsvp } from '@/hooks/data';
import { friendlyError } from '@/lib/supabase';
import type { RideWithRelations, RsvpStatus } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

import { font, radius, useTheme } from './theme';
import { Button, Row, Sheet, showMessage, Stack, Txt, type IconName } from './ui';

export function isRideOpen(ride: RideWithRelations) {
  return ride.status === 'published' && new Date(ride.starts_at).getTime() > Date.now() - 12 * 3600e3;
}

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

/**
 * Going / Maybe / Can't.
 *  - `compact`: one button for ride cards (Join, or your current answer).
 *  - default: all options side by side (ride page).
 * Rides with pace groups ask which group you join.
 */
export function RsvpControl({ ride, compact, stretch }: { ride: RideWithRelations; compact?: boolean; stretch?: boolean }) {
  const { c } = useTheme();
  const { userId } = useAuth();
  const rsvp = useRsvp(ride.id);
  const [groupSheet, setGroupSheet] = useState(false);
  const mine = ride.rsvps.find((r) => r.user_id === userId);
  const open = isRideOpen(ride);
  const goingCount = ride.rsvps.filter((r) => r.status === 'going').length;
  const full = ride.max_participants != null && goingCount >= ride.max_participants && mine?.status !== 'going';

  const submit = (status: RsvpStatus | null, subgroupId?: string | null) => {
    tap();
    rsvp.mutate({ status, subgroupId }, { onError: (e) => showMessage('Could not update', friendlyError(e)) });
  };

  const choose = (status: RsvpStatus) => {
    if (mine?.status === status && !(status === 'going' && ride.subgroups.length)) return submit(null);
    if (status === 'going' && ride.subgroups.length) return setGroupSheet(true);
    submit(status);
  };

  const groupName = mine?.subgroup_id ? ride.subgroups.find((g) => g.id === mine.subgroup_id)?.name : null;
  const options: { status: RsvpStatus; label: string; icon: IconName; color: string }[] = [
    {
      status: 'going',
      // Full-width bar has less room per button: the group name is shown above it instead.
      label: mine?.status === 'going' ? (groupName && !stretch ? `Going · ${groupName}` : 'Going') : full ? 'Full' : 'Join',
      icon: 'checkmark',
      color: c.going,
    },
    ...(ride.allow_maybe ? [{ status: 'maybe' as const, label: 'Maybe', icon: 'help' as const, color: c.maybe }] : []),
    { status: 'not_going', label: "Can't", icon: 'close', color: c.notGoing },
  ];

  if (!open) {
    return (
      <Txt variant="small" muted>
        {ride.status === 'cancelled' ? 'Cancelled' : 'Sign-up closed'}
        {mine && !compact ? ` · you were ${mine.status === 'going' ? 'going' : mine.status === 'maybe' ? 'a maybe' : 'out'}` : ''}
      </Txt>
    );
  }

  const groupSheetEl = (
    <Sheet visible={groupSheet} onClose={() => setGroupSheet(false)} title="Pick your group">
      <Stack gap={10}>
        {ride.subgroups.map((g) => {
          const count = ride.rsvps.filter((r) => r.status === 'going' && r.subgroup_id === g.id).length;
          const groupFull = g.max_participants != null && count >= g.max_participants && mine?.subgroup_id !== g.id;
          const selected = mine?.status === 'going' && mine.subgroup_id === g.id;
          return (
            <Pressable
              key={g.id}
              disabled={groupFull}
              onPress={() => {
                setGroupSheet(false);
                submit('going', g.id);
              }}
              style={({ pressed }) => ({
                padding: 16,
                borderRadius: radius.lg,
                borderWidth: 2,
                borderColor: selected ? c.brand : c.border,
                backgroundColor: selected ? c.brandSoft : c.card,
                opacity: groupFull ? 0.45 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="h2">{g.name}</Txt>
                  {g.description ? <Txt variant="small" muted>{g.description}</Txt> : null}
                </View>
                <Txt variant="small" style={{ fontWeight: '700' }}>
                  {groupFull ? 'Full' : `${count}${g.max_participants ? `/${g.max_participants}` : ''} riding`}
                </Txt>
              </Row>
            </Pressable>
          );
        })}
        {mine?.status === 'going' ? (
          <Button
            title="Cancel my sign-up"
            variant="ghost"
            onPress={() => {
              setGroupSheet(false);
              submit(null);
            }}
          />
        ) : null}
      </Stack>
    </Sheet>
  );

  if (compact) {
    const current = options.find((o) => o.status === mine?.status);
    if (!current) {
      return (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={rsvp.isPending || full}
            onPress={() => choose('going')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: full ? c.subtle : c.lime,
              paddingHorizontal: 16,
              height: 36,
              borderRadius: radius.pill,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}>
            {rsvp.isPending ? (
              <ActivityIndicator size="small" color={c.onLime} />
            ) : (
              <Ionicons name={full ? 'lock-closed' : 'add'} size={16} color={full ? c.muted : c.onLime} />
            )}
            <Text style={[font('800'), { color: full ? c.muted : c.onLime, fontSize: 13.5 }]}>{full ? 'Full' : 'Join'}</Text>
          </Pressable>
          {groupSheetEl}
        </>
      );
    }
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/ride/${ride.id}`)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: `${current.color}1F`,
          paddingHorizontal: 13,
          height: 36,
          borderRadius: radius.pill,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}>
        <Ionicons name={current.icon} size={15} color={current.color} />
        <Text style={[font('700'), { color: current.color, fontSize: 13.5 }]}>{current.status === 'not_going' ? 'Not going' : current.label}</Text>
      </Pressable>
    );
  }

  return (
    <>
      <Row gap={8}>
        {options.map((o) => {
          const active = mine?.status === o.status;
          const highlight = o.status === 'going' && !mine && !full;
          const disabled = rsvp.isPending || (o.status === 'going' && full);
          return (
            <Pressable
              key={o.status}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => choose(o.status)}
              style={({ pressed }) => [
                {
                  height: 50,
                  paddingHorizontal: stretch ? 10 : 16,
                  borderRadius: radius.pill,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: stretch ? 4 : 6,
                  backgroundColor: active ? o.color : highlight ? c.lime : c.subtle,
                  opacity: disabled && !active ? 0.45 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
                stretch && { flex: o.status === 'going' ? 1.3 : 1 },
              ]}>
              {rsvp.isPending && rsvp.variables?.status === o.status ? (
                <ActivityIndicator size="small" color={active ? '#fff' : c.ink} />
              ) : (
                <Ionicons name={o.icon} size={17} color={active ? '#fff' : highlight ? c.onLime : o.color} />
              )}
              <Text numberOfLines={1} style={[font('700'), { fontSize: 14.5, color: active ? '#fff' : highlight ? c.onLime : c.ink }]}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </Row>
      {groupSheetEl}
    </>
  );
}
