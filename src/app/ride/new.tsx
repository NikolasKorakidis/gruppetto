import { useQueryClient } from '@tanstack/react-query';
import { router, Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { RouteMap } from '@/components/RouteMap';
import { radius, space, useTheme } from '@/components/theme';
import {
  Avatar,
  Banner,
  Button,
  Card,
  Chip,
  ClubLogo,
  Icon,
  IconButton,
  Input,
  Loading,
  PillPicker,
  Row,
  Screen,
  SectionHeader,
  Sheet,
  Stack,
  ToggleRow,
  Txt,
} from '@/components/ui';
import { RIDE_SELECT, useMembers, useRoutes, useSavedLocations } from '@/hooks/data';
import { pickGpxFile, type PickedText } from '@/lib/files';
import { estimateMinutes, fmtDuration, RIDE_TYPES } from '@/lib/format';
import { geocode } from '@/lib/geocode';
import { GpxError, parseGpx, type ParsedGpx } from '@/lib/gpx';
import { saveRoute } from '@/lib/routes';
import { friendlyError, supabase } from '@/lib/supabase';
import type { RideType, RideWithRelations, RouteRow } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useClub } from '@/providers/ClubProvider';

type GroupDraft = { key: string; name: string; description: string; max: string };

const PRESET_GROUPS: GroupDraft[] = [
  { key: 'fast', name: 'Fast', description: '29+ km/h', max: '' },
  { key: 'steady', name: 'Steady', description: '26–29 km/h', max: '' },
  { key: 'social', name: 'Social', description: 'up to 26 km/h', max: '' },
];

type AttachedRoute =
  | { kind: 'new'; file: PickedText; parsed: ParsedGpx }
  | { kind: 'existing'; route: Pick<RouteRow, 'id' | 'title' | 'preview' | 'distance_km' | 'elevation_gain_m' | 'start_lat' | 'start_lng'> };

function nextRoundHour() {
  const d = new Date(Date.now() + 24 * 3600e3);
  d.setHours(9, 0, 0, 0);
  return d;
}

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default function RideForm() {
  const params = useLocalSearchParams<{ id?: string; copy?: string; routeId?: string }>();
  const editId = params.id;
  const sourceId = params.id ?? params.copy;
  const { c } = useTheme();
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { club, activeMemberships } = useClub();

  const [clubId, setClubId] = useState(club?.id ?? '');
  const [loaded, setLoaded] = useState(!sourceId);
  const [type, setType] = useState<RideType>('road');
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(nextRoundHour);
  const [description, setDescription] = useState('');
  const [distance, setDistance] = useState('');
  const [speed, setSpeed] = useState('');
  const [elevation, setElevation] = useState('');
  const [startName, setStartName] = useState('');
  const [startAddress, setStartAddress] = useState('');
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saveLocation, setSaveLocation] = useState(false);
  const [stopover, setStopover] = useState(false);
  const [stopoverNote, setStopoverNote] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [asClub, setAsClub] = useState(false);
  const [allowMaybe, setAllowMaybe] = useState(true);
  const [maxRiders, setMaxRiders] = useState('');
  const [joinMyself, setJoinMyself] = useState(true);
  const [useGroups, setUseGroups] = useState(false);
  const [groups, setGroups] = useState<GroupDraft[]>(PRESET_GROUPS);
  const [groupsLocked, setGroupsLocked] = useState(false);
  const [leaders, setLeaders] = useState<string[]>([]);
  const [route, setRoute] = useState<AttachedRoute | null>(null);
  const [librarySheet, setLibrarySheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = activeMemberships.find((m) => m.club_id === clubId)?.role;
  const isClubLead = role === 'owner' || role === 'admin' || role === 'leader';
  const members = useMembers(clubId || null);
  const locations = useSavedLocations(clubId || null);
  const library = useRoutes(clubId || null);
  const eligibleLeaders = (members.data ?? []).filter((m) => m.status === 'active' && m.role !== 'member');

  // Load an existing ride (edit) or a source ride (copy).
  useEffect(() => {
    if (!sourceId) return;
    (async () => {
      const { data, error } = await supabase
        .from('rides')
        .select(RIDE_SELECT)
        .eq('id', sourceId)
        .single();
      if (error || !data) {
        setError(friendlyError(error));
        setLoaded(true);
        return;
      }
      const r = data as unknown as RideWithRelations;
      setClubId(r.club_id);
      setType(r.ride_type);
      setTitle(r.title);
      if (editId) setStartsAt(new Date(r.starts_at));
      else {
        // Copy: same weekday & time, next week.
        const d = new Date(r.starts_at);
        while (d.getTime() < Date.now()) d.setDate(d.getDate() + 7);
        setStartsAt(d);
      }
      setDescription(r.description ?? '');
      setDistance(r.distance_km ? String(Number(r.distance_km)) : '');
      setSpeed(r.avg_speed_kmh ? String(Number(r.avg_speed_kmh)) : '');
      setElevation(r.elevation_gain_m ? String(r.elevation_gain_m) : '');
      setStartName(r.start_name ?? '');
      setStartAddress(r.start_address ?? '');
      setStartCoords(r.start_lat != null && r.start_lng != null ? { lat: r.start_lat, lng: r.start_lng } : null);
      setStopover(r.has_stopover);
      setStopoverNote(r.stopover_note ?? '');
      setIsPublic(r.visibility === 'public');
      setAsClub(r.published_as_club);
      setAllowMaybe(r.allow_maybe);
      setMaxRiders(r.max_participants ? String(r.max_participants) : '');
      setLeaders(r.leaders.map((l) => l.user_id));
      if (r.subgroups.length) {
        setUseGroups(true);
        setGroups(r.subgroups.map((g) => ({ key: g.id, name: g.name, description: g.description ?? '', max: g.max_participants ? String(g.max_participants) : '' })));
      }
      if (editId) setGroupsLocked(r.rsvps.some((x) => x.status !== 'not_going'));
      const rr = (data as unknown as { route: RouteRow | null }).route;
      if (rr) setRoute({ kind: 'existing', route: rr });
      setLoaded(true);
    })();
  }, [sourceId, editId]);

  // Pre-attach a route from the library (/ride/new?routeId=…).
  useEffect(() => {
    if (!params.routeId || sourceId) return;
    supabase
      .from('routes')
      .select('id,title,preview,distance_km,elevation_gain_m,start_lat,start_lng,club_id,ride_type')
      .eq('id', params.routeId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        attachExisting(data as RouteRow);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.routeId, sourceId]);

  function attachExisting(r: Pick<RouteRow, 'id' | 'title' | 'preview' | 'distance_km' | 'elevation_gain_m' | 'start_lat' | 'start_lng' | 'ride_type'>) {
    setRoute({ kind: 'existing', route: r });
    if (!title) setTitle(r.title);
    if (r.distance_km) setDistance(String(Number(r.distance_km)));
    if (r.elevation_gain_m) setElevation(String(r.elevation_gain_m));
    if (r.ride_type) setType(r.ride_type);
  }

  async function attachGpx() {
    setError(null);
    try {
      const file = await pickGpxFile();
      if (!file) return;
      const parsed = parseGpx(file.text);
      setRoute({ kind: 'new', file, parsed });
      if (!title && parsed.name) setTitle(parsed.name);
      setDistance(String(Math.round(parsed.distanceKm * 10) / 10));
      if (parsed.elevationGainM != null) setElevation(String(parsed.elevationGainM));
    } catch (e) {
      setError(e instanceof GpxError ? e.message : friendlyError(e));
    }
  }

  const distanceKm = num(distance);
  const speedKmh = num(speed);
  const duration = distanceKm && speedKmh ? estimateMinutes(distanceKm, speedKmh) : null;
  const routePreview = route?.kind === 'new' ? route.parsed.preview : (route?.route.preview ?? null);

  async function save() {
    setError(null);
    if (!clubId) return setError('Choose a club.');
    if (title.trim().length < 2) return setError('Give the ride a title.');
    if (startsAt.getTime() < Date.now() - 5 * 60e3 && !editId) return setError('The start time is in the past.');
    if (useGroups && !groupsLocked && groups.some((g) => !g.name.trim())) return setError('Every group needs a name.');
    setBusy(true);
    try {
      let routeId: string | null = route?.kind === 'existing' ? route.route.id : null;
      let start = startCoords;
      if (route?.kind === 'new') {
        routeId = await saveRoute({ clubId, ownerId: userId!, file: route.file, parsed: route.parsed, title, rideType: type });
      }
      const routeStart =
        route?.kind === 'new'
          ? { lat: route.parsed.start[0], lng: route.parsed.start[1] }
          : route?.route.start_lat != null && route.route.start_lng != null
            ? { lat: route.route.start_lat, lng: route.route.start_lng }
            : null;
      if (!start && (startAddress || startName)) start = await geocode([startName, startAddress].filter(Boolean).join(', '));
      start ??= routeStart;

      const payload = {
        club_id: clubId,
        title: title.trim(),
        description: description.trim() || null,
        ride_type: type,
        starts_at: startsAt.toISOString(),
        distance_km: distanceKm,
        avg_speed_kmh: speedKmh,
        duration_minutes: duration,
        elevation_gain_m: num(elevation) ? Math.round(num(elevation)!) : null,
        start_name: startName.trim() || null,
        start_address: startAddress.trim() || null,
        start_lat: start?.lat ?? null,
        start_lng: start?.lng ?? null,
        has_stopover: stopover,
        stopover_note: stopover ? stopoverNote.trim() || null : null,
        visibility: isPublic ? 'public' : 'club',
        published_as_club: asClub,
        allow_maybe: allowMaybe,
        max_participants: num(maxRiders) ? Math.round(num(maxRiders)!) : null,
        route_id: routeId,
      };

      let rideId = editId;
      if (editId) {
        const { error } = await supabase.from('rides').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('rides').insert({ ...payload, creator_id: userId }).select('id').single();
        if (error) throw error;
        rideId = data.id;
      }

      // Leaders: replace the set.
      if (editId) await supabase.from('ride_leaders').delete().eq('ride_id', rideId!);
      if (leaders.length) {
        const { error } = await supabase.from('ride_leaders').insert(leaders.map((u) => ({ ride_id: rideId, user_id: u })));
        if (error) throw error;
      }

      // Groups: only while nobody has signed up.
      if (!groupsLocked) {
        if (editId) await supabase.from('ride_subgroups').delete().eq('ride_id', rideId!);
        if (useGroups && groups.length) {
          const { error } = await supabase.from('ride_subgroups').insert(
            groups.map((g, i) => ({
              ride_id: rideId,
              name: g.name.trim(),
              description: g.description.trim() || null,
              sort_order: i,
              max_participants: num(g.max) ? Math.round(num(g.max)!) : null,
            })),
          );
          if (error) throw error;
        }
      }

      if (saveLocation && startName.trim()) {
        await supabase.from('saved_locations').insert({
          club_id: clubId,
          name: startName.trim(),
          address: startAddress.trim() || null,
          lat: start?.lat ?? null,
          lng: start?.lng ?? null,
        });
      }

      if (!editId && joinMyself) {
        await supabase.from('ride_rsvps').upsert({ ride_id: rideId, user_id: userId, status: 'going' });
      }

      qc.invalidateQueries({ queryKey: ['rides'] });
      qc.invalidateQueries({ queryKey: ['ride', rideId] });
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['locations'] });
      qc.invalidateQueries({ queryKey: ['my-rides'] });
      if (editId) router.back();
      else router.replace(`/ride/${rideId}`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <Loading />;

  return (
    <Screen>
      <RouterStack.Screen options={{ title: editId ? 'Edit ride' : 'Plan a ride' }} />
      <Stack gap={space.lg}>
        {activeMemberships.length > 1 && !editId ? (
          <View style={{ gap: 8 }}>
            <Txt variant="label">Club</Txt>
            <Row wrap gap={8}>
              {activeMemberships.map((m) => (
                <Pressable key={m.club_id} onPress={() => setClubId(m.club_id)}>
                  <Row
                    gap={8}
                    style={{
                      paddingVertical: 6,
                      paddingLeft: 6,
                      paddingRight: 12,
                      borderRadius: radius.pill,
                      backgroundColor: clubId === m.club_id ? c.inverse : c.card,
                      borderWidth: 1,
                      borderColor: clubId === m.club_id ? c.inverse : c.border,
                    }}>
                    <ClubLogo name={m.club.name} url={m.club.logo_url} color={m.club.color} size={24} />
                    <Txt variant="small" color={clubId === m.club_id ? c.onInverse : c.ink} style={{ fontWeight: '700' }}>
                      {m.club.name}
                    </Txt>
                  </Row>
                </Pressable>
              ))}
            </Row>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Txt variant="label">Type</Txt>
          <PillPicker options={RIDE_TYPES.map((t) => ({ ...t, icon: t.icon as never }))} value={type} onChange={setType} />
        </View>

        {/* Route */}
        <Card>
          {route ? (
            <Stack gap={space.md}>
              {routePreview?.length ? <RouteMap line={routePreview} height={150} /> : null}
              <Row gap={10}>
                <Icon name="map" size={20} color={c.brand} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" numberOfLines={1}>
                    {route.kind === 'new' ? route.parsed.name || route.file.name : route.route.title}
                  </Txt>
                  <Txt variant="small" muted>
                    {route.kind === 'new'
                      ? `${route.parsed.distanceKm} km${route.parsed.elevationGainM != null ? ` · ${route.parsed.elevationGainM} m ↑` : ''} · new upload`
                      : `${route.route.distance_km ? `${Number(route.route.distance_km)} km` : ''} from library`}
                  </Txt>
                </View>
                <IconButton icon="close" label="Remove route" bg={c.subtle} size={34} onPress={() => setRoute(null)} />
              </Row>
            </Stack>
          ) : (
            <Stack gap={space.md}>
              <Row gap={10}>
                <Icon name="map-outline" size={20} color={c.muted} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3">Route (optional)</Txt>
                  <Txt variant="small" muted>
                    Attach a GPX to fill in distance and climbing automatically.
                  </Txt>
                </View>
              </Row>
              <Row gap={8}>
                <Button title="Upload GPX" icon="cloud-upload-outline" variant="secondary" small onPress={attachGpx} style={{ flex: 1 }} />
                <Button title="From library" icon="albums-outline" variant="secondary" small onPress={() => setLibrarySheet(true)} style={{ flex: 1 }} />
              </Row>
            </Stack>
          )}
        </Card>

        <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Thursday evening loop" maxLength={120} />
        <DateTimeField label="Date & start time" value={startsAt} onChange={setStartsAt} />
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder={'Meeting point details, route highlights, what to bring…\ne.g. Lights required after sunset. We regroup at every junction.'}
          maxLength={5000}
        />

        <SectionHeader title="Distance & pace" />
        <Row gap={space.sm} align="flex-start">
          <View style={{ flex: 1 }}>
            <Input label="Distance (km)" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" placeholder="40" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Avg speed (km/h)" value={speed} onChangeText={setSpeed} keyboardType="decimal-pad" placeholder="25" />
          </View>
        </Row>
        <Row gap={space.sm} align="flex-start">
          <View style={{ flex: 1 }}>
            <Input label="Climbing (m)" value={elevation} onChangeText={setElevation} keyboardType="number-pad" placeholder="optional" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt variant="small" style={{ fontWeight: '600' }}>
              Estimated duration
            </Txt>
            <View style={{ backgroundColor: c.subtle, borderRadius: radius.md, padding: 13 }}>
              <Txt style={{ fontWeight: '700' }}>{fmtDuration(duration) ?? '—'}</Txt>
            </View>
          </View>
        </Row>

        <SectionHeader title="Start" />
        {locations.data?.length ? (
          <Row wrap gap={8}>
            {locations.data.map((l) => (
              <Chip
                key={l.id}
                icon="location"
                label={l.name}
                active={startName === l.name}
                onPress={() => {
                  setStartName(l.name);
                  setStartAddress(l.address ?? '');
                  setStartCoords(l.lat != null && l.lng != null ? { lat: l.lat, lng: l.lng } : null);
                  setSaveLocation(false);
                }}
              />
            ))}
          </Row>
        ) : null}
        <Input
          label="Meeting point"
          icon="flag-outline"
          value={startName}
          onChangeText={(v) => {
            setStartName(v);
            setStartCoords(null);
          }}
          placeholder="e.g. Station square"
          maxLength={120}
        />
        <Input
          label="Address / place"
          icon="location-outline"
          value={startAddress}
          onChangeText={(v) => {
            setStartAddress(v);
            setStartCoords(null);
          }}
          placeholder="Street, town"
          maxLength={200}
          hint="Used for directions and the weather forecast."
        />
        {startName && !locations.data?.some((l) => l.name === startName) ? (
          <ToggleRow icon="bookmark-outline" label="Save as a club start location" value={saveLocation} onChange={setSaveLocation} />
        ) : null}

        <SectionHeader title="Along the way" />
        <ToggleRow icon="cafe-outline" label="Coffee stop" description="Let riders know to bring a card." value={stopover} onChange={setStopover} />
        {stopover ? <Input value={stopoverNote} onChangeText={setStopoverNote} placeholder="Where? e.g. Bakery De Zwaan at km 32" maxLength={200} /> : null}

        <SectionHeader title="Groups" />
        {groupsLocked ? (
          <Banner icon="lock-closed">Groups can’t be changed after people have signed up.</Banner>
        ) : (
          <ToggleRow
            icon="layers-outline"
            label="Split into pace groups"
            description="One ride, several groups. Riders pick theirs when signing up."
            value={useGroups}
            onChange={setUseGroups}
          />
        )}
        {useGroups ? (
          <Stack gap={8}>
            {groups.map((g, i) => (
              <Row key={g.key} gap={8} align="flex-start">
                <View style={{ width: 70 }}>
                  <Input
                    value={g.name}
                    editable={!groupsLocked}
                    onChangeText={(v) => setGroups(groups.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                    placeholder="Name"
                    maxLength={40}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    value={g.description}
                    editable={!groupsLocked}
                    onChangeText={(v) => setGroups(groups.map((x, j) => (j === i ? { ...x, description: v } : x)))}
                    placeholder="e.g. 26–29 km/h"
                    maxLength={120}
                  />
                </View>
                <View style={{ width: 64 }}>
                  <Input
                    value={g.max}
                    editable={!groupsLocked}
                    onChangeText={(v) => setGroups(groups.map((x, j) => (j === i ? { ...x, max: v } : x)))}
                    placeholder="max"
                    keyboardType="number-pad"
                  />
                </View>
                {!groupsLocked ? (
                  <View style={{ paddingTop: 6 }}>
                    <IconButton icon="trash-outline" label="Remove group" bg={c.subtle} size={36} onPress={() => setGroups(groups.filter((_, j) => j !== i))} />
                  </View>
                ) : null}
              </Row>
            ))}
            {!groupsLocked ? (
              <Button
                title="Add group"
                icon="add"
                variant="ghost"
                small
                onPress={() => setGroups([...groups, { key: String(Date.now()), name: `Group ${groups.length + 1}`, description: '', max: '' }])}
              />
            ) : null}
          </Stack>
        ) : null}

        <SectionHeader title="Ride leaders" />
        {eligibleLeaders.length ? (
          <Row wrap gap={8}>
            {eligibleLeaders.map((m) => {
              const on = leaders.includes(m.user_id);
              return (
                <Pressable key={m.user_id} onPress={() => setLeaders(on ? leaders.filter((x) => x !== m.user_id) : [...leaders, m.user_id])}>
                  <Row
                    gap={6}
                    style={{
                      paddingVertical: 5,
                      paddingLeft: 5,
                      paddingRight: 12,
                      borderRadius: radius.pill,
                      backgroundColor: on ? c.inverse : c.card,
                      borderWidth: 1,
                      borderColor: on ? c.inverse : c.border,
                    }}>
                    <Avatar name={m.profile.display_name} url={m.profile.avatar_url} size={24} />
                    <Txt variant="small" color={on ? c.onInverse : c.ink} style={{ fontWeight: '600' }}>
                      {m.profile.display_name}
                    </Txt>
                  </Row>
                </Pressable>
              );
            })}
          </Row>
        ) : (
          <Txt variant="small" muted>
            Club admins can make members ride leaders in Club → Manage.
          </Txt>
        )}

        <SectionHeader title="Sign-up" />
        <Input label="Max riders (optional)" value={maxRiders} onChangeText={setMaxRiders} keyboardType="number-pad" placeholder="No limit" />
        <ToggleRow icon="help-circle-outline" label="Allow “maybe”" value={allowMaybe} onChange={setAllowMaybe} />
        {!editId ? <ToggleRow icon="checkmark-circle-outline" label="I’m riding too" description="Sign yourself up straight away." value={joinMyself} onChange={setJoinMyself} /> : null}

        <SectionHeader title="Visibility" />
        <ToggleRow
          icon="globe-outline"
          label="Public ride"
          description="Riders from other clubs can see and join. Start location becomes visible to them."
          value={isPublic}
          onChange={setIsPublic}
        />
        {isClubLead ? (
          <ToggleRow icon="shield-outline" label="Publish as the club" description="Show the club as organiser instead of your name." value={asClub} onChange={setAsClub} />
        ) : null}

        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button title={editId ? 'Save changes' : 'Publish ride'} icon={editId ? 'save-outline' : 'paper-plane-outline'} onPress={save} loading={busy} />
        {!editId ? (
          <Txt variant="caption" center>
            Club members get a notification when you publish.
          </Txt>
        ) : null}
      </Stack>

      <Sheet visible={librarySheet} onClose={() => setLibrarySheet(false)} title="Club routes">
        {library.isPending ? (
          <Loading />
        ) : library.data?.length ? (
          <Stack gap={8}>
            {[...library.data].sort((a, b) => Number(b.favorite) - Number(a.favorite)).map((r) => (
              <Pressable
                key={r.id}
                onPress={() => {
                  attachExisting(r);
                  setLibrarySheet(false);
                }}
                style={{ padding: 12, borderRadius: radius.md, backgroundColor: c.subtle }}>
                <Row gap={10}>
                  <Icon name={r.favorite ? 'star' : 'map-outline'} size={18} color={r.favorite ? c.accent : c.muted} />
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: '700' }} numberOfLines={1}>
                      {r.title}
                    </Txt>
                    <Txt variant="small" muted>
                      {[r.distance_km ? `${Number(r.distance_km)} km` : null, r.elevation_gain_m ? `${r.elevation_gain_m} m ↑` : null].filter(Boolean).join(' · ')}
                    </Txt>
                  </View>
                </Row>
              </Pressable>
            ))}
          </Stack>
        ) : (
          <Txt muted>No routes in the library yet. Upload a GPX instead.</Txt>
        )}
      </Sheet>
    </Screen>
  );
}
