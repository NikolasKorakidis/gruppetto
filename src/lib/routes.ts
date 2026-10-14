import type { PickedText } from './files';
import type { ParsedGpx } from './gpx';
import { supabase } from './supabase';
import type { RideType, RideVisibility } from './types';

function uuid() {
  // RFC4122 v4 using Math.random is fine for file names.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Store the original GPX privately and create a route row with derived stats. */
export async function saveRoute(opts: {
  clubId: string;
  ownerId: string;
  file: PickedText;
  parsed: ParsedGpx;
  title: string;
  description?: string | null;
  rideType?: RideType | null;
  visibility?: RideVisibility;
}) {
  const path = `${opts.clubId}/${uuid()}.gpx`;
  const { error: upErr } = await supabase.storage
    .from('gpx')
    .upload(path, opts.file.text, { contentType: 'application/gpx+xml', upsert: false });
  if (upErr) throw upErr;

  const p = opts.parsed;
  const { data, error } = await supabase
    .from('routes')
    .insert({
      club_id: opts.clubId,
      owner_id: opts.ownerId,
      title: opts.title.trim() || p.name || opts.file.name.replace(/\.gpx$/i, ''),
      description: opts.description ?? null,
      ride_type: opts.rideType ?? null,
      visibility: opts.visibility ?? 'club',
      distance_km: p.distanceKm,
      elevation_gain_m: p.elevationGainM,
      elevation_loss_m: p.elevationLossM,
      start_lat: p.start[0],
      start_lng: p.start[1],
      bbox: p.bbox,
      preview: p.preview,
      gpx_path: path,
    })
    .select('id')
    .single();
  if (error) {
    await supabase.storage.from('gpx').remove([path]);
    throw error;
  }
  return data.id as string;
}
