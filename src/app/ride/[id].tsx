import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RideTags } from '@/components/RideCard';
import { RideInsights } from '@/components/RideInsights';
import { RouteMap } from '@/components/RouteMap';
import { RsvpControl } from '@/components/RsvpControl';
import { elevation, font, MAX_WIDTH, radius, space, useTheme } from '@/components/theme';
import {
  Avatar,
  AvatarStack,
  Banner,
  Button,
  Card,
  ClubLogo,
  confirmAsync,
  EmptyState,
  Icon,
  IconButton,
  IconTile,
  Input,
  Loading,
  Row,
  Segmented,
  Sheet,
  showMessage,
  Stack,
  Txt,
  type IconName,
} from '@/components/ui';
import { gpxSignedUrl, useComments, useDeleteComment, usePostComment, useRide } from '@/hooks/data';
import { shareGpx } from '@/lib/files';
import { fmtDateLong, fmtDuration, fmtRelative, fmtTime, rideTypeIcon, rideTypeLabel } from '@/lib/format';
import { appLink } from '@/lib/links';
import { friendlyError, supabase } from '@/lib/supabase';
import type { RideWithRelations, Rsvp } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useClub } from '@/providers/ClubProvider';

type Tab = 'details' | 'riders' | 'chat';
const HERO = 300;

export default function RideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { memberships } = useClub();
  const ride = useRide(id);
  const [tab, setTab] = useState<Tab>('details');
  const [menuOpen, setMenuOpen] = useState(false);

  const headerButtons = {
    headerTransparent: true,
    title: '',
    headerLeft: () => (
      <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} bg={c.card} size={40} />
    ),
    headerRight: () => <IconButton icon="ellipsis-horizontal" label="Ride options" onPress={() => setMenuOpen(true)} bg={c.card} size={40} />,
  };

  if (ride.isPending) return <Loading />;
  const r = ride.data;
  if (!r) {
    return (
      <>
        <RouterStack.Screen options={{ title: '' }} />
        <EmptyState icon="alert-circle-outline" title="Ride not found" body="It may have been deleted, or you don't have access." />
      </>
    );
  }

  const role = memberships.find((m) => m.club_id === r.club_id && m.status === 'active')?.role;
  const canManage = r.creator_id === userId || role === 'owner' || role === 'admin' || r.leaders.some((l) => l.user_id === userId);
  const canDelete = r.creator_id === userId || role === 'owner' || role === 'admin';
  const commentCount = r.comments?.[0]?.count ?? 0;
  const going = r.rsvps.filter((x) => x.status === 'going');
  const maybe = r.rsvps.filter((x) => x.status === 'maybe').length;
  const mine = r.rsvps.find((x) => x.user_id === userId && x.status === 'going');
  const myGroup = mine?.subgroup_id ? r.subgroups.find((g) => g.id === mine.subgroup_id)?.name : null;
  const lat = r.start_lat ?? r.route?.start_lat;
  const lng = r.start_lng ?? r.route?.start_lng;
  const end = r.duration_minutes ? new Date(new Date(r.starts_at).getTime() + r.duration_minutes * 60e3).toISOString() : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <RouterStack.Screen options={headerButtons} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={ride.isRefetching} onRefresh={() => ride.refetch()} tintColor={c.brand} />}
        contentContainerStyle={{ paddingBottom: 170 }}
        keyboardShouldPersistTaps="handled">
        {/* Hero */}
        {r.route?.preview?.length || (lat != null && lng != null) ? (
          <RouteMap
            line={r.route?.preview ?? null}
            start={!r.route?.preview?.length && lat != null && lng != null ? [lat, lng] : null}
            height={HERO + insets.top}
            color={r.club.color}
            padding={{ top: insets.top + 64, bottom: 52, left: 28, right: 28 }}
            style={{ borderRadius: 0 }}
          />
        ) : (
          <View style={{ height: HERO * 0.7 + insets.top, backgroundColor: c.hero, alignItems: 'center', justifyContent: 'center' }}>
            <LinearGradient colors={[`${r.club.color}CC`, 'transparent']} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
            <Ionicons name={rideTypeIcon(r.ride_type) as IconName} size={64} color={c.lime} />
          </View>
        )}

        {/* Sheet */}
        <View style={{ marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: c.bg }}>
          <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg, paddingTop: space.xl, gap: space.lg }}>
            {r.status === 'cancelled' ? (
              <Banner tone="danger" icon="close-circle">
                {`This ride is cancelled${r.cancel_reason ? `: ${r.cancel_reason}` : '.'}`}
              </Banner>
            ) : null}

            <Stack gap={10}>
              <Row gap={8}>
                <ClubLogo name={r.club.name} url={r.club.logo_url} color={r.club.color} size={24} />
                <Txt variant="small" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {r.club.name}
                  <Txt variant="small" muted>
                    {r.published_as_club ? '' : `  ·  by ${r.creator.display_name}`}
                  </Txt>
                </Txt>
              </Row>
              <Txt variant="display">{r.title}</Txt>
            </Stack>

            <Stack gap={12}>
              <Row gap={12}>
                <IconTile icon="calendar" color={c.brand} bg={c.brandSoft} />
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: '700' }}>{fmtDateLong(r.starts_at)}</Txt>
                  <Txt variant="small" muted>
                    {fmtTime(r.starts_at)}
                    {end ? ` – about ${fmtTime(end)}` : ''}
                  </Txt>
                </View>
              </Row>
              {r.start_name || r.start_address ? (
                <Pressable disabled={lat == null} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`)}>
                  <Row gap={12}>
                    <IconTile icon="location" color={c.accent} bg={c.accentSoft} />
                    <View style={{ flex: 1 }}>
                      <Txt style={{ fontWeight: '700' }} numberOfLines={1}>
                        {r.start_name || r.start_address}
                      </Txt>
                      <Txt variant="small" muted numberOfLines={1}>
                        {r.start_name && r.start_address ? r.start_address : 'Meeting point'}
                      </Txt>
                    </View>
                    {lat != null ? (
                      <Row gap={4}>
                        <Txt variant="small" color={c.brand} style={{ fontWeight: '700' }}>
                          Directions
                        </Txt>
                        <Icon name="arrow-forward" size={14} color={c.brand} />
                      </Row>
                    ) : null}
                  </Row>
                </Pressable>
              ) : null}
            </Stack>

            <StatGrid ride={r} />
            <RideTags ride={r} withType />

            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'details', label: 'Details' },
                { value: 'riders', label: `Riders · ${going.length}` },
                { value: 'chat', label: `Chat · ${commentCount}` },
              ]}
            />

            {tab === 'details' ? <DetailsTab ride={r} /> : tab === 'riders' ? <RidersTab ride={r} /> : <ChatTab ride={r} canModerate={canManage} />}
          </View>
        </View>
      </ScrollView>

      {/* Sticky sign-up bar */}
      <View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: c.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.md,
            paddingHorizontal: space.lg,
          },
          elevation(c, 3),
        ]}>
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 10 }}>
          <Row gap={8}>
            {going.length ? (
              <AvatarStack people={going.map((x) => ({ id: x.user_id, name: x.profile.display_name, url: x.profile.avatar_url }))} max={5} size={24} />
            ) : null}
            <Txt variant="small" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
              {myGroup ? <Txt variant="small" color={c.brand} style={{ fontWeight: '800' }}>{`You’re in ${myGroup}  ·  `}</Txt> : null}
              {going.length ? `${going.length} going` : 'No one yet — be the first'}
              {maybe ? <Txt variant="small" muted>{`  ·  ${maybe} maybe`}</Txt> : null}
              {r.max_participants ? <Txt variant="small" muted>{`  ·  max ${r.max_participants}`}</Txt> : null}
            </Txt>
          </Row>
          <RsvpControl ride={r} stretch />
        </View>
      </View>

      <RideMenu ride={r} open={menuOpen} onClose={() => setMenuOpen(false)} canManage={canManage} canDelete={canDelete} />
    </View>
  );
}

// ---------------------------------------------------------------------------
function StatGrid({ ride: r }: { ride: RideWithRelations }) {
  const { c, isDark } = useTheme();
  const stats = [
    { label: 'Distance', value: r.distance_km ? Number(r.distance_km).toLocaleString('en-GB', { maximumFractionDigits: 1 }) : '—', unit: 'km', icon: 'navigate' as IconName },
    { label: 'Avg speed', value: r.avg_speed_kmh ? String(Number(r.avg_speed_kmh)) : '—', unit: 'km/h', icon: 'speedometer' as IconName },
    { label: 'Riding time', value: fmtDuration(r.duration_minutes) ?? '—', unit: '', icon: 'time' as IconName },
    { label: 'Climbing', value: r.elevation_gain_m ? String(r.elevation_gain_m) : '—', unit: 'm', icon: 'trending-up' as IconName },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {stats.map((s) => (
        <View
          key={s.label}
          style={[
            {
              flexBasis: '47%',
              flexGrow: 1,
              backgroundColor: c.card,
              borderRadius: radius.lg,
              padding: space.md + 2,
              gap: 6,
              borderWidth: isDark ? 1 : 0,
              borderColor: c.border,
            },
            elevation(c, 1),
          ]}>
          <Row gap={6}>
            <Ionicons name={s.icon} size={14} color={c.faint} />
            <Txt variant="caption">{s.label}</Txt>
          </Row>
          <Text style={[font('800'), { fontSize: 24, letterSpacing: -0.6, color: c.ink }]}>
            {s.value}
            {s.unit && s.value !== '—' ? <Text style={[font('600'), { fontSize: 13, color: c.muted }]}> {s.unit}</Text> : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
function DetailsTab({ ride: r }: { ride: RideWithRelations }) {
  const { c } = useTheme();
  const [downloading, setDownloading] = useState(false);

  async function downloadGpx() {
    if (!r.route?.gpx_path) return;
    setDownloading(true);
    try {
      const name = `${r.route.title.replace(/[^\w-]+/g, '_')}.gpx`;
      await shareGpx(await gpxSignedUrl(r.route.gpx_path, name), name);
    } catch (e) {
      showMessage('Download failed', friendlyError(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Stack gap={space.md}>
      {r.description ? (
        <Card>
          <Txt variant="label" style={{ marginBottom: 8 }}>
            About this ride
          </Txt>
          <Txt style={{ lineHeight: 23 }}>{r.description}</Txt>
        </Card>
      ) : null}

      {r.has_stopover ? (
        <Card>
          <Row gap={12}>
            <IconTile icon="cafe" color={c.warn} bg={c.warnSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Coffee stop</Txt>
              <Txt variant="small" muted>
                {r.stopover_note || 'There’s a stop along the way — bring a card.'}
              </Txt>
            </View>
          </Row>
        </Card>
      ) : null}

      {r.route ? (
        <Card>
          <Row gap={12}>
            <IconTile icon="map" color={c.brand} bg={c.brandSoft} />
            <Pressable style={{ flex: 1 }} onPress={() => router.push(`/route/${r.route!.id}`)}>
              <Txt variant="h3" numberOfLines={1}>
                {r.route.title}
              </Txt>
              <Txt variant="small" muted>
                {[r.route.distance_km ? `${Number(r.route.distance_km)} km` : null, r.route.elevation_gain_m ? `${r.route.elevation_gain_m} m climbing` : null]
                  .filter(Boolean)
                  .join(' · ') || 'View route'}
              </Txt>
            </Pressable>
            {r.route.gpx_path ? <Button title="GPX" icon="download-outline" small variant="secondary" onPress={downloadGpx} loading={downloading} /> : null}
          </Row>
        </Card>
      ) : null}

      {r.leaders.length ? (
        <Card>
          <Txt variant="label" style={{ marginBottom: 12 }}>
            Ride leaders
          </Txt>
          <Stack gap={12}>
            {r.leaders.map((l) => (
              <Row key={l.user_id} gap={12}>
                <Avatar name={l.profile.display_name} url={l.profile.avatar_url} size={38} />
                <Txt style={{ fontWeight: '700', flex: 1 }}>{l.profile.display_name}</Txt>
                <View style={{ backgroundColor: c.brandSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
                  <Txt variant="caption" color={c.brand} style={{ fontWeight: '700' }}>
                    Leader
                  </Txt>
                </View>
              </Row>
            ))}
          </Stack>
        </Card>
      ) : null}

      {r.subgroups.length ? (
        <Card>
          <Txt variant="label" style={{ marginBottom: 12 }}>
            Pace groups
          </Txt>
          <Stack gap={10}>
            {r.subgroups.map((g) => {
              const n = r.rsvps.filter((x) => x.status === 'going' && x.subgroup_id === g.id).length;
              const pct = g.max_participants ? Math.min(1, n / g.max_participants) : null;
              return (
                <View key={g.id} style={{ gap: 6 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt style={{ fontWeight: '700' }}>
                      {g.name}
                      {g.description ? <Txt variant="small" muted>{`  ${g.description}`}</Txt> : null}
                    </Txt>
                    <Txt variant="small" style={{ fontWeight: '700' }}>
                      {n}
                      {g.max_participants ? `/${g.max_participants}` : ''}
                    </Txt>
                  </Row>
                  {pct !== null ? (
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: c.subtle, overflow: 'hidden' }}>
                      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: pct >= 1 ? c.danger : c.brand, borderRadius: 3 }} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Stack>
        </Card>
      ) : null}

      <RideInsights ride={r} />

      <Txt variant="caption" center style={{ marginTop: space.sm }}>
        {rideTypeLabel(r.ride_type)} ride · {r.visibility === 'public' ? 'open to riders from any club' : 'club members only'}
      </Txt>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
function RiderRow({ rsvp, badge }: { rsvp: Rsvp; badge?: string }) {
  const { c } = useTheme();
  return (
    <Row gap={12} style={{ paddingVertical: 7 }}>
      <Avatar name={rsvp.profile.display_name} url={rsvp.profile.avatar_url} size={38} />
      <Txt style={{ flex: 1, fontWeight: '600' }}>{rsvp.profile.display_name}</Txt>
      {badge ? (
        <View style={{ backgroundColor: c.subtle, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
          <Txt variant="caption" style={{ fontWeight: '700' }}>
            {badge}
          </Txt>
        </View>
      ) : null}
    </Row>
  );
}

function RidersTab({ ride: r }: { ride: RideWithRelations }) {
  const going = r.rsvps.filter((x) => x.status === 'going');
  const maybe = r.rsvps.filter((x) => x.status === 'maybe');
  const out = r.rsvps.filter((x) => x.status === 'not_going');
  const leaderIds = new Set(r.leaders.map((l) => l.user_id));

  if (!r.rsvps.length) {
    return <EmptyState icon="people-outline" title="No riders yet" body="Be the first to sign up — others follow." />;
  }

  const groups = r.subgroups.length
    ? [
        ...r.subgroups.map((g) => ({ title: g.name, list: going.filter((x) => x.subgroup_id === g.id) })),
        { title: 'No group picked', list: going.filter((x) => !x.subgroup_id) },
      ].filter((g) => g.list.length)
    : [{ title: 'Going', list: going }];

  const section = (title: string, list: Rsvp[], badges = false) =>
    list.length ? (
      <Card key={title}>
        <Txt variant="label" style={{ marginBottom: 6 }}>
          {title} · {list.length}
        </Txt>
        {list.map((x) => (
          <RiderRow
            key={x.user_id}
            rsvp={x}
            badge={badges ? (leaderIds.has(x.user_id) ? 'Leader' : x.user_id === r.creator_id ? 'Organiser' : undefined) : undefined}
          />
        ))}
      </Card>
    ) : null;

  return (
    <Stack gap={space.md}>
      {groups.map((g) => section(g.title, g.list, true))}
      {section('Maybe', maybe)}
      {section('Can’t make it', out)}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
function ChatTab({ ride: r, canModerate }: { ride: RideWithRelations; canModerate: boolean }) {
  const { c } = useTheme();
  const { userId } = useAuth();
  const comments = useComments(r.id);
  const post = usePostComment(r.id);
  const del = useDeleteComment(r.id);
  const [body, setBody] = useState('');

  const send = () => {
    if (!body.trim()) return;
    post.mutate(body, {
      onSuccess: () => setBody(''),
      onError: (e) => showMessage('Not sent', friendlyError(e)),
    });
  };

  const remove = async (id: string) => {
    if (await confirmAsync('Delete message?', 'This cannot be undone.', 'Delete', true)) del.mutate(id);
  };

  return (
    <Stack gap={space.md}>
      {comments.isPending ? (
        <Loading />
      ) : comments.data?.length ? (
        comments.data.map((m) => {
          const mine = m.author_id === userId;
          return (
            <Pressable key={m.id} onLongPress={() => (mine || canModerate) && remove(m.id)} delayLongPress={400}>
              <Row gap={10} align="flex-end" style={mine ? { flexDirection: 'row-reverse' } : undefined}>
                {!mine ? <Avatar name={m.author.display_name} url={m.author.avatar_url} size={30} /> : null}
                <View
                  style={{
                    maxWidth: '80%',
                    backgroundColor: mine ? c.inverse : c.card,
                    borderRadius: 20,
                    borderBottomLeftRadius: mine ? 20 : 6,
                    borderBottomRightRadius: mine ? 6 : 20,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    gap: 3,
                  }}>
                  {!mine ? (
                    <Txt variant="caption" style={{ fontWeight: '700' }} color={c.brand}>
                      {m.author.display_name}
                    </Txt>
                  ) : null}
                  <Txt color={mine ? c.onInverse : c.ink}>{m.body}</Txt>
                  <Txt variant="caption" color={mine ? 'rgba(255,255,255,0.55)' : c.faint} style={{ alignSelf: 'flex-end' }}>
                    {fmtRelative(m.created_at)}
                  </Txt>
                </View>
              </Row>
            </Pressable>
          );
        })
      ) : (
        <EmptyState icon="chatbubbles-outline" title="No messages yet" body="Ask about the route, the pace, or who brings the spare tubes." />
      )}
      {comments.data?.length ? (
        <Txt variant="caption" center>
          {Platform.OS === 'web' ? 'Long-press' : 'Press and hold'} your message to delete it
        </Txt>
      ) : null}
      <Row gap={8} align="flex-end">
        <View style={{ flex: 1 }}>
          <Input value={body} onChangeText={setBody} placeholder="Message the group…" multiline style={{ minHeight: 50 }} maxLength={2000} />
        </View>
        <IconButton icon="arrow-up" label="Send message" onPress={send} bg={body.trim() ? c.lime : c.subtle} color={body.trim() ? c.onLime : c.faint} size={50} />
      </Row>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
function MenuItem({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Row gap={14} style={{ paddingVertical: 12 }}>
        <IconTile icon={icon} size={38} color={danger ? c.danger : c.ink} bg={danger ? c.dangerSoft : c.subtle} />
        <Txt style={{ fontWeight: '700' }} color={danger ? c.danger : undefined}>
          {label}
        </Txt>
      </Row>
    </Pressable>
  );
}

function RideMenu({
  ride: r,
  open,
  onClose,
  canManage,
  canDelete,
}: {
  ride: RideWithRelations;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const [cancelMode, setCancelMode] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ride', r.id] });
    qc.invalidateQueries({ queryKey: ['rides'] });
  };

  const setStatus = async (status: 'cancelled' | 'published') => {
    setBusy(true);
    const { error } = await supabase
      .from('rides')
      .update({ status, cancel_reason: status === 'cancelled' ? reason.trim() || null : null })
      .eq('id', r.id);
    setBusy(false);
    if (error) return showMessage('Could not update', friendlyError(error));
    setCancelMode(false);
    setReason('');
    onClose();
    refresh();
  };

  const remove = async () => {
    if (!(await confirmAsync('Delete this ride?', 'Sign-ups and chat are removed too. Cancelling keeps the history.', 'Delete', true))) return;
    const { error } = await supabase.from('rides').delete().eq('id', r.id);
    if (error) return showMessage('Could not delete', friendlyError(error));
    onClose();
    qc.invalidateQueries({ queryKey: ['rides'] });
    router.back();
  };

  const share = async () => {
    const url = appLink(`/ride/${r.id}`);
    const message = `${r.title} — ${fmtDateLong(r.starts_at)} ${fmtTime(r.starts_at)}\n${url}`;
    onClose();
    try {
      if (Platform.OS === 'web' && !navigator.share) {
        await Clipboard.setStringAsync(message);
        showMessage('Link copied');
      } else {
        await Share.share({ message, url });
      }
    } catch {}
  };

  return (
    <Sheet
      visible={open}
      onClose={() => {
        setCancelMode(false);
        onClose();
      }}
      title={cancelMode ? 'Cancel ride' : 'Ride options'}>
      {cancelMode ? (
        <Stack gap={space.md}>
          <Txt muted>Riders who signed up get a notification. You can bring the ride back later.</Txt>
          <Input label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. Strong winds forecast" maxLength={300} />
          <Button title="Cancel ride" variant="danger" icon="close-circle" onPress={() => setStatus('cancelled')} loading={busy} />
          <Button title="Keep ride" variant="ghost" onPress={() => setCancelMode(false)} />
        </Stack>
      ) : (
        <View>
          <MenuItem icon="share-outline" label="Share ride" onPress={share} />
          <MenuItem
            icon="copy-outline"
            label="Plan again next week"
            onPress={() => {
              onClose();
              router.push({ pathname: '/ride/new', params: { copy: r.id } });
            }}
          />
          {canManage ? (
            <>
              <MenuItem
                icon="create-outline"
                label="Edit ride"
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/ride/new', params: { id: r.id } });
                }}
              />
              {r.status === 'cancelled' ? (
                <MenuItem icon="refresh-circle-outline" label="Bring ride back" onPress={() => setStatus('published')} />
              ) : (
                <MenuItem icon="close-circle-outline" label="Cancel ride" onPress={() => setCancelMode(true)} />
              )}
            </>
          ) : null}
          {canDelete ? <MenuItem icon="trash-outline" label="Delete ride" danger onPress={remove} /> : null}
        </View>
      )}
    </Sheet>
  );
}
