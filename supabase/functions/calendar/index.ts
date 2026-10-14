// Personal iCalendar feed: GET /functions/v1/calendar?token=<secret>
// Subscribe from Apple Calendar / Google Calendar / Outlook with webcal://...
// The token is the user's secret from public.calendar_tokens (rotatable in the app).
import { adminClient } from '../_shared/admin.ts';

type Ride = {
  id: string;
  title: string;
  description: string | null;
  ride_type: string;
  starts_at: string;
  duration_minutes: number | null;
  distance_km: number | null;
  avg_speed_kmh: number | null;
  elevation_gain_m: number | null;
  start_name: string | null;
  start_address: string | null;
  start_lat: number | null;
  start_lng: number | null;
  has_stopover: boolean;
  visibility: string;
  status: string;
  updated_at: string;
  club: { name: string } | null;
};

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Fold content lines to 75 octets as required by RFC 5545. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response('Not found', { status: 404 });

  const db = adminClient();
  const { data: tok } = await db.from('calendar_tokens').select('user_id').eq('token', token).maybeSingle();
  if (!tok) return new Response('Not found', { status: 404 });

  const [{ data: memberships }, { data: rsvps }] = await Promise.all([
    db.from('club_members').select('club_id').eq('user_id', tok.user_id).eq('status', 'active'),
    db.from('ride_rsvps').select('ride_id, status').eq('user_id', tok.user_id),
  ]);
  const clubIds = (memberships ?? []).map((m) => m.club_id);
  const rsvpByRide = new Map((rsvps ?? []).map((r) => [r.ride_id, r.status as string]));
  const joinedPublic = (rsvps ?? []).filter((r) => r.status !== 'not_going').map((r) => r.ride_id);

  const from = new Date(Date.now() - 30 * 864e5).toISOString();
  const to = new Date(Date.now() + 180 * 864e5).toISOString();
  const filters = [
    clubIds.length ? `club_id.in.(${clubIds.join(',')})` : null,
    joinedPublic.length ? `id.in.(${joinedPublic.join(',')})` : null,
  ].filter(Boolean);

  let rides: Ride[] = [];
  if (filters.length) {
    const { data } = await db
      .from('rides')
      .select(
        'id,title,description,ride_type,starts_at,duration_minutes,distance_km,avg_speed_kmh,elevation_gain_m,start_name,start_address,start_lat,start_lng,has_stopover,visibility,status,updated_at,club:clubs(name)',
      )
      .or(filters.join(','))
      .neq('status', 'draft')
      .gte('starts_at', from)
      .lte('starts_at', to)
      .order('starts_at');
    rides = (data ?? []) as unknown as Ride[];
  }

  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  const now = stamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gruppetto//Rides//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Gruppetto rides',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const r of rides) {
    const start = new Date(r.starts_at);
    const end = new Date(start.getTime() + (r.duration_minutes ?? 120) * 60_000);
    const rsvp = rsvpByRide.get(r.id);
    const mark = rsvp === 'going' ? '✓ ' : rsvp === 'maybe' ? '? ' : rsvp === 'not_going' ? '✗ ' : '';
    const facts = [
      r.club?.name,
      r.ride_type,
      r.distance_km ? `${Number(r.distance_km)} km` : null,
      r.avg_speed_kmh ? `${Number(r.avg_speed_kmh)} km/h` : null,
      r.elevation_gain_m ? `${r.elevation_gain_m} m↑` : null,
      r.has_stopover ? 'coffee stop' : null,
      r.visibility === 'public' ? 'public ride' : null,
    ].filter(Boolean);
    const description = [facts.join(' · '), r.description ?? '', appUrl ? `${appUrl}/ride/${r.id}` : '']
      .filter(Boolean)
      .join('\n\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@gruppetto`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SEQUENCE:${Math.floor(new Date(r.updated_at).getTime() / 60_000)}`,
      `STATUS:${r.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      `SUMMARY:${esc(mark + (r.status === 'cancelled' ? '[Cancelled] ' : '') + r.title)}`,
      `DESCRIPTION:${esc(description)}`,
    );
    const location = [r.start_name, r.start_address].filter(Boolean).join(', ');
    if (location) lines.push(`LOCATION:${esc(location)}`);
    if (r.start_lat != null && r.start_lng != null) lines.push(`GEO:${r.start_lat};${r.start_lng}`);
    if (appUrl) lines.push(`URL:${appUrl}/ride/${r.id}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
    },
  });
});
