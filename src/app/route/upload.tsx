import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { RouteMap } from '@/components/RouteMap';
import { space } from '@/components/theme';
import { Banner, Button, Card, EmptyState, Input, PillPicker, Row, Screen, Stack, ToggleRow, Txt } from '@/components/ui';
import { pickGpxFile, type PickedText } from '@/lib/files';
import { RIDE_TYPES } from '@/lib/format';
import { GpxError, parseGpx, type ParsedGpx } from '@/lib/gpx';
import { saveRoute } from '@/lib/routes';
import { friendlyError } from '@/lib/supabase';
import type { RideType } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useClub } from '@/providers/ClubProvider';

export default function UploadRoute() {
  const { userId } = useAuth();
  const { club } = useClub();
  const qc = useQueryClient();
  const [file, setFile] = useState<PickedText | null>(null);
  const [parsed, setParsed] = useState<ParsedGpx | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<RideType>('road');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    try {
      const f = await pickGpxFile();
      if (!f) return;
      const p = parseGpx(f.text);
      setFile(f);
      setParsed(p);
      setTitle(p.name ?? f.name.replace(/\.gpx$/i, ''));
    } catch (e) {
      setError(e instanceof GpxError ? e.message : friendlyError(e));
    }
  }

  async function save() {
    if (!file || !parsed || !club) return;
    setBusy(true);
    setError(null);
    try {
      const id = await saveRoute({
        clubId: club.id,
        ownerId: userId!,
        file,
        parsed,
        title,
        description: description.trim() || null,
        rideType: type,
        visibility: isPublic ? 'public' : 'club',
      });
      qc.invalidateQueries({ queryKey: ['routes'] });
      router.replace(`/route/${id}`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack gap={space.lg}>
        {!parsed ? (
          <EmptyState
            icon="cloud-upload-outline"
            title="Add a GPX route"
            body="Export a .gpx from Komoot, Strava, RideWithGPS, Garmin Connect or Wahoo and pick it here."
            action={<Button title="Choose GPX file" icon="document-outline" onPress={pick} />}
          />
        ) : (
          <>
            <RouteMap line={parsed.preview} height={220} interactive />
            <Card>
              <Row style={{ justifyContent: 'space-around' }}>
                <Stat label="Distance" value={`${parsed.distanceKm} km`} />
                <Stat label="Climbing" value={parsed.elevationGainM != null ? `${parsed.elevationGainM} m` : '—'} />
                <Stat label="Points" value={String(parsed.points)} />
              </Row>
            </Card>
            <Input label="Name" value={title} onChangeText={setTitle} maxLength={120} />
            <Input label="Notes (optional)" value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="Surface, sketchy bits, best season…" />
            <PillPicker options={RIDE_TYPES.map((t) => ({ ...t, icon: t.icon as never }))} value={type} onChange={setType} />
            <ToggleRow icon="globe-outline" label="Public route" description="Visible to riders outside your club." value={isPublic} onChange={setIsPublic} />
            <Button title="Save to library" icon="save-outline" onPress={save} loading={busy} />
            <Button title="Choose another file" variant="ghost" onPress={pick} />
          </>
        )}
        {error ? <Banner tone="danger">{error}</Banner> : null}
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
