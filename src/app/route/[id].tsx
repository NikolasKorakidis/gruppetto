import { useQueryClient } from '@tanstack/react-query';
import { router, Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { RouteMap } from '@/components/RouteMap';
import { space, useTheme } from '@/components/theme';
import { Button, Card, confirmAsync, EmptyState, IconButton, Loading, Row, Screen, showMessage, Stack, Txt } from '@/components/ui';
import { gpxSignedUrl, useRoute, useToggleFavorite } from '@/hooks/data';
import { shareGpx } from '@/lib/files';
import { fmtDateLong, rideTypeLabel } from '@/lib/format';
import { friendlyError, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useClub } from '@/providers/ClubProvider';

export default function RouteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { userId } = useAuth();
  const { memberships } = useClub();
  const route = useRoute(id);
  const fav = useToggleFavorite();
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);

  if (route.isPending) return <Loading />;
  const r = route.data;
  if (!r) return <EmptyState icon="map-outline" title="Route not found" />;
  const role = memberships.find((m) => m.club_id === r.club_id && m.status === 'active')?.role;
  const isMember = !!role;
  const canEdit = r.owner_id === userId || role === 'owner' || role === 'admin';

  async function download() {
    if (!r?.gpx_path) return;
    setDownloading(true);
    try {
      const name = `${r.title.replace(/[^\w-]+/g, '_')}.gpx`;
      await shareGpx(await gpxSignedUrl(r.gpx_path, name), name);
    } catch (e) {
      showMessage('Download failed', friendlyError(e));
    } finally {
      setDownloading(false);
    }
  }

  async function remove() {
    if (!(await confirmAsync('Delete route?', 'Rides that use it keep their details but lose the map.', 'Delete', true))) return;
    const { error } = await supabase.from('routes').delete().eq('id', r!.id);
    if (error) return showMessage('Could not delete', friendlyError(error));
    if (r!.gpx_path) await supabase.storage.from('gpx').remove([r!.gpx_path]);
    qc.invalidateQueries({ queryKey: ['routes'] });
    router.back();
  }

  async function toggleVisibility() {
    const { error } = await supabase.from('routes').update({ visibility: r!.visibility === 'public' ? 'club' : 'public' }).eq('id', r!.id);
    if (error) return showMessage('Error', friendlyError(error));
    route.refetch();
  }

  return (
    <Screen>
      <RouterStack.Screen
        options={{
          title: '',
          headerRight: () => (
            <IconButton
              icon={r.favorite ? 'star' : 'star-outline'}
              color={r.favorite ? c.accent : c.ink}
              label={r.favorite ? 'Remove favourite' : 'Add favourite'}
              bg={c.subtle}
              size={36}
              onPress={() => fav.mutate({ routeId: r.id, favorite: !r.favorite })}
            />
          ),
        }}
      />
      <Stack gap={space.lg}>
        <RouteMap line={r.preview} height={300} interactive />
        <Stack gap={4}>
          <Txt variant="display">{r.title}</Txt>
          <Txt variant="small" muted>
            Added by {r.owner.display_name} · {fmtDateLong(r.created_at)}
            {r.usedCount ? ` · used for ${r.usedCount} ride${r.usedCount === 1 ? '' : 's'}` : ''}
          </Txt>
        </Stack>
        <Card>
          <Row style={{ justifyContent: 'space-around' }}>
            <Stat label="Distance" value={r.distance_km ? `${Number(r.distance_km)} km` : '—'} />
            <Stat label="Climbing" value={r.elevation_gain_m != null ? `${r.elevation_gain_m} m` : '—'} />
            <Stat label="Type" value={r.ride_type ? rideTypeLabel(r.ride_type) : '—'} />
          </Row>
        </Card>
        {r.description ? <Txt>{r.description}</Txt> : null}
        {isMember ? <Button title="Plan a ride on this route" icon="add-circle-outline" onPress={() => router.push({ pathname: '/ride/new', params: { routeId: r.id } })} /> : null}
        {r.gpx_path ? <Button title="Download / send to device" icon="download-outline" variant="secondary" onPress={download} loading={downloading} /> : null}
        {canEdit ? (
          <Row gap={8}>
            <Button title={r.visibility === 'public' ? 'Make club-only' : 'Make public'} icon="globe-outline" variant="ghost" small onPress={toggleVisibility} />
            <Button title="Delete" icon="trash-outline" variant="danger" small onPress={remove} />
          </Row>
        ) : null}
      </Stack>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={2} style={{ alignItems: 'center' }}>
      <Txt variant="h2">{value}</Txt>
      <Txt variant="caption">{label}</Txt>
    </Stack>
  );
}
