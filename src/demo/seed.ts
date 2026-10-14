// Fictional sample data for demo mode. Every name, club and route here is made up.
import type { NotifyPrefs } from '@/lib/types';

export const DEMO_USER_ID = 'd0000000-0000-4000-8000-000000000001';
export const DEMO_EMAIL = 'jordan@demo.gruppetto.app';
export const DEMO_PASSWORD = 'Demo1234';
export const CLUB_MAIN = 'c0000000-0000-4000-8000-000000000001';
export const CLUB_GRAVEL = 'c0000000-0000-4000-8000-000000000002';
export const CLUB_PUBLIC = 'c0000000-0000-4000-8000-000000000003';
/** Invite code shown on the sign-up screen in demo mode. */
export const DEMO_INVITE = 'RIDE2026';

type Row = Record<string, any>;
export type DemoDb = {
  seededAt: string;
  users: { id: string; email: string; password: string; confirmed: boolean }[];
  profiles: Row[];
  profile_private: Row[];
  clubs: Row[];
  club_members: Row[];
  saved_locations: Row[];
  routes: Row[];
  route_favorites: Row[];
  rides: Row[];
  ride_leaders: Row[];
  ride_subgroups: Row[];
  ride_rsvps: Row[];
  ride_comments: Row[];
  news_posts: Row[];
  notifications: Row[];
  push_tokens: Row[];
  calendar_tokens: Row[];
};

const PREFS: NotifyPrefs = { ride_new: true, ride_changed: true, comment: true, news: true };

// Deterministic pseudo-random numbers so the demo looks the same every time.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** A believable closed loop: an ellipse with smooth wobbles. Returns [lat, lng][]. */
function loop(center: [number, number], radiusKm: number, seed: number, stretch = 1.4, points = 180): [number, number][] {
  const r = rng(seed);
  const harmonics = Array.from({ length: 4 }, (_, i) => ({ k: i + 2, a: (r() - 0.5) * 0.28, p: r() * Math.PI * 2 }));
  const kmLat = 1 / 110.6;
  const kmLng = 1 / (111.3 * Math.cos((center[0] * Math.PI) / 180));
  const rot = r() * Math.PI;
  const out: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * Math.PI * 2;
    const wobble = 1 + harmonics.reduce((sum, h) => sum + h.a * Math.sin(h.k * t + h.p), 0) + (r() - 0.5) * 0.015;
    const x = Math.cos(t) * radiusKm * stretch * wobble;
    const y = Math.sin(t) * radiusKm * wobble;
    const xr = x * Math.cos(rot) - y * Math.sin(rot);
    const yr = x * Math.sin(rot) + y * Math.cos(rot);
    out.push([+(center[0] + yr * kmLat).toFixed(5), +(center[1] + xr * kmLng).toFixed(5)]);
  }
  return out;
}

/** Out-and-back along a gentle curve. */
function outAndBack(start: [number, number], bearingDeg: number, km: number, seed: number): [number, number][] {
  const r = rng(seed);
  const kmLat = 1 / 110.6;
  const kmLng = 1 / (111.3 * Math.cos((start[0] * Math.PI) / 180));
  const out: [number, number][] = [];
  let lat = start[0];
  let lng = start[1];
  let b = (bearingDeg * Math.PI) / 180;
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    out.push([+lat.toFixed(5), +lng.toFixed(5)]);
    b += (r() - 0.5) * 0.25;
    lat += Math.cos(b) * (km / steps) * kmLat;
    lng += Math.sin(b) * (km / steps) * kmLng;
  }
  const back = [...out].reverse().map(([a, c]) => [+(a + 0.0006).toFixed(5), +(c + 0.0006).toFixed(5)] as [number, number]);
  return [...out, ...back];
}

function at(dayOffset: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
const ago = (hours: number) => new Date(Date.now() - hours * 3600e3).toISOString();

export function createSeed(): DemoDb {
  const people: [string, string, string][] = [
    [DEMO_USER_ID, 'Jordan Vos', 'Utrecht'],
    ['p01', 'Noor Hendriks', 'Utrecht'],
    ['p02', 'Daan Mulder', 'Bunnik'],
    ['p03', 'Femke de Graaf', 'Utrecht'],
    ['p04', 'Thijs Kramer', 'Zeist'],
    ['p05', 'Lisa Vermeulen', 'Houten'],
    ['p06', 'Jasper Bosman', 'Utrecht'],
    ['p07', 'Ilse van Dijk', 'De Bilt'],
    ['p08', 'Bram Peters', 'Utrecht'],
    ['p09', 'Sophie Willems', 'Maarssen'],
    ['p10', 'Ruben Koster', 'Utrecht'],
    ['p11', 'Mila Jacobs', 'Haarlem'],
    ['p12', 'Sem Dekker', 'Zandvoort'],
  ];
  const profiles = people.map(([id, display_name, city]) => ({
    id,
    display_name,
    avatar_url: null,
    bio: null,
    city,
    notify_prefs: PREFS,
    onboarded: true,
    created_at: ago(24 * 200),
  }));

  const clubs = [
    {
      id: CLUB_MAIN,
      name: 'Northside Cycling Club',
      description: 'Road and gravel rides from Utrecht, all year round. Weekday evenings, weekend long rides, and plenty of coffee.',
      city: 'Utrecht',
      logo_url: null,
      color: '#0E7C66',
      invite_code: DEMO_INVITE,
      requires_approval: false,
      is_discoverable: true,
      timezone: 'Europe/Amsterdam',
      created_by: DEMO_USER_ID,
    },
    {
      id: CLUB_GRAVEL,
      name: 'Lowlands Gravel Collective',
      description: 'Small crew, big tyres. Forest tracks and dykes around the Heuvelrug.',
      city: 'Zeist',
      logo_url: null,
      color: '#7C3AED',
      invite_code: 'GRVL8KXQ',
      requires_approval: true,
      is_discoverable: false,
      timezone: 'Europe/Amsterdam',
      created_by: 'p04',
    },
    {
      id: CLUB_PUBLIC,
      name: 'Dune Riders',
      description: 'Coastal road rides with wind in every direction.',
      city: 'Haarlem',
      logo_url: null,
      color: '#1F6FEB',
      invite_code: 'DUNE4PLX',
      requires_approval: true,
      is_discoverable: true,
      timezone: 'Europe/Amsterdam',
      created_by: 'p11',
    },
  ].map((c) => ({ ...c, created_at: ago(24 * 400), updated_at: ago(24 * 10) }));

  const m = (club_id: string, user_id: string, role = 'member', status = 'active', days = 100) => ({
    club_id,
    user_id,
    role,
    status,
    requested_at: ago(24 * days),
    approved_at: status === 'active' ? ago(24 * days) : null,
    approved_by: null,
  });
  const club_members = [
    m(CLUB_MAIN, DEMO_USER_ID, 'owner', 'active', 300),
    m(CLUB_MAIN, 'p01', 'leader', 'active', 280),
    m(CLUB_MAIN, 'p02', 'admin', 'active', 260),
    m(CLUB_MAIN, 'p03'),
    m(CLUB_MAIN, 'p05'),
    m(CLUB_MAIN, 'p06', 'leader'),
    m(CLUB_MAIN, 'p07'),
    m(CLUB_MAIN, 'p08'),
    m(CLUB_MAIN, 'p10'),
    m(CLUB_MAIN, 'p09', 'member', 'pending', 1),
    m(CLUB_GRAVEL, 'p04', 'owner', 'active', 200),
    m(CLUB_GRAVEL, DEMO_USER_ID, 'member', 'active', 90),
    m(CLUB_GRAVEL, 'p03'),
    m(CLUB_GRAVEL, 'p08'),
    m(CLUB_PUBLIC, 'p11', 'owner', 'active', 300),
    m(CLUB_PUBLIC, 'p12'),
  ];

  const routeDefs = [
    { id: 'rt01', club: CLUB_MAIN, title: 'Kromme Rijn river loop', type: 'road', line: loop([52.055, 5.2], 7.5, 11), km: 56.4, up: 85, desc: 'Flat and fast along the river. Perfect for a steady evening ride.' },
    { id: 'rt02', club: CLUB_MAIN, title: 'Heuvelrug climbs', type: 'road', line: loop([52.06, 5.33], 12, 23), km: 92.8, up: 640, desc: 'All the little climbs of the Utrechtse Heuvelrug in one go.' },
    { id: 'rt03', club: CLUB_MAIN, title: 'Amelisweerd gravel', type: 'gravel', line: loop([52.072, 5.18], 5.2, 37, 1.2), km: 41.7, up: 120, desc: 'Forest paths, a bit of sand near the estate, otherwise hardpack.' },
    { id: 'rt04', club: CLUB_MAIN, title: 'Lek dyke out & back', type: 'road', line: outAndBack([52.02, 5.16], 170, 32, 41), km: 64.0, up: 40, desc: 'Into the wind on the way out, tailwind home (usually).' },
    { id: 'rt05', club: CLUB_GRAVEL, title: 'Zeist forest tracks', type: 'gravel', line: loop([52.09, 5.27], 6, 53, 1.1), km: 38.2, up: 210, desc: 'Roots and pine needles. Wider tyres recommended.' },
    { id: 'rt06', club: CLUB_PUBLIC, title: 'Coastal dunes 90', type: 'road', line: loop([52.39, 4.57], 11, 67, 1.8), km: 89.5, up: 260, desc: 'Through the dunes to the sea and back via the bulb fields.', visibility: 'public' },
  ];
  const routes = routeDefs.map((r) => ({
    id: r.id,
    club_id: r.club,
    owner_id: r.club === CLUB_MAIN ? DEMO_USER_ID : r.club === CLUB_GRAVEL ? 'p04' : 'p11',
    title: r.title,
    description: r.desc,
    ride_type: r.type,
    visibility: r.visibility ?? 'club',
    distance_km: r.km,
    elevation_gain_m: r.up,
    elevation_loss_m: r.up,
    start_lat: r.line[0][0],
    start_lng: r.line[0][1],
    bbox: null,
    preview: r.line,
    gpx_path: `${r.club}/${r.id}.gpx`,
    created_at: ago(24 * (30 + Number(r.id.slice(-2)) * 5)),
    updated_at: ago(24 * 10),
  }));

  const base = {
    published_as_club: false,
    description: null,
    elevation_gain_m: null,
    start_address: null,
    has_stopover: false,
    stopover_note: null,
    visibility: 'club',
    status: 'published',
    route_id: null,
    max_participants: null,
    allow_maybe: true,
    cancel_reason: null,
    created_at: ago(72),
    updated_at: ago(72),
  };
  const route = (id: string) => routes.find((r) => r.id === id)!;
  const rides = [
    {
      ...base, id: 'rd01', club_id: CLUB_MAIN, creator_id: 'p01', title: 'After-work gravel loop', ride_type: 'gravel',
      starts_at: at(0, 18, 45), distance_km: 41.7, avg_speed_kmh: 21, duration_minutes: 119, elevation_gain_m: 120,
      start_name: 'Café Oase, Amelisweerd', start_lat: route('rt03').start_lat, start_lng: route('rt03').start_lng, route_id: 'rt03',
      description: 'Two groups, same loop. Lights on from the start — it is dark by the time we are back. Regroup at every junction.',
    },
    {
      ...base, id: 'rd02', club_id: CLUB_MAIN, creator_id: DEMO_USER_ID, title: 'Sunrise coffee spin', ride_type: 'road',
      starts_at: at(1, 7, 0), distance_km: 56.4, avg_speed_kmh: 28, duration_minutes: 121, elevation_gain_m: 85,
      start_name: 'Neude square', start_address: 'Neude, Utrecht', start_lat: 52.0929, start_lng: 5.1185, route_id: 'rt01',
      has_stopover: true, stopover_note: 'Café De Molen in Wijk bij Duurstede, km 30',
      description: 'Early start, back before 9 so everyone makes it to work. Steady pace, no attacks before coffee.',
    },
    {
      ...base, id: 'rd03', club_id: CLUB_MAIN, creator_id: 'p06', title: 'Threshold intervals', ride_type: 'training',
      starts_at: at(2, 19, 0), distance_km: 35, avg_speed_kmh: 31, duration_minutes: 68, start_name: 'Galgenwaard stadium',
      start_lat: 52.0786, start_lng: 5.1458, max_participants: 8, allow_maybe: false,
      description: '4 × 8 minutes at threshold on the dyke road. Bring a light and a rear light — we finish after sunset.',
    },
    {
      ...base, id: 'rd04', club_id: CLUB_PUBLIC, creator_id: 'p11', title: 'Coastal dunes 90', ride_type: 'road', visibility: 'public',
      starts_at: at(3, 9, 30), distance_km: 89.5, avg_speed_kmh: 29, duration_minutes: 185, elevation_gain_m: 260,
      start_name: 'Haarlem station, north side', start_lat: route('rt06').start_lat, start_lng: route('rt06').start_lng, route_id: 'rt06',
      has_stopover: true, stopover_note: 'Beach pavilion at Zandvoort', published_as_club: true,
      description: 'Open to riders from every club. Bring a windproof — the coast is always a few degrees colder.',
    },
    {
      ...base, id: 'rd05', club_id: CLUB_MAIN, creator_id: 'p02', title: 'Long ride: Heuvelrug climbs', ride_type: 'road',
      starts_at: at(4, 9, 0), distance_km: 92.8, avg_speed_kmh: 27, duration_minutes: 206, elevation_gain_m: 640,
      start_name: 'Neude square', start_address: 'Neude, Utrecht', start_lat: 52.0929, start_lng: 5.1185, route_id: 'rt02',
      has_stopover: true, stopover_note: 'Bakery in Doorn, around km 50', published_as_club: true,
      description: 'Three pace groups on the same route. Pick your group when you sign up — each one has its own leader.',
    },
    {
      ...base, id: 'rd06', club_id: CLUB_MAIN, creator_id: 'p01', title: 'Night MTB', ride_type: 'mtb', status: 'cancelled',
      cancel_reason: 'Trails closed after the storm — new date soon.', starts_at: at(6, 20, 0), distance_km: 25, avg_speed_kmh: 14,
      duration_minutes: 107, start_name: 'Trail car park, Austerlitz', start_lat: 52.08, start_lng: 5.32,
    },
    {
      ...base, id: 'rd07', club_id: CLUB_MAIN, creator_id: 'p03', title: 'First gravel ride? Start here', ride_type: 'gravel',
      starts_at: at(8, 14, 0), distance_km: 30, avg_speed_kmh: 18, duration_minutes: 100, start_name: 'Café Oase, Amelisweerd',
      start_lat: route('rt03').start_lat, start_lng: route('rt03').start_lng,
      description: 'Relaxed pace with stops to explain the basics: tyre pressure, picking lines, riding in a group on narrow paths.',
    },
    {
      ...base, id: 'rd08', club_id: CLUB_GRAVEL, creator_id: 'p04', title: 'Forest tracks & pancakes', ride_type: 'gravel',
      starts_at: at(5, 10, 0), distance_km: 38.2, avg_speed_kmh: 19, duration_minutes: 121, elevation_gain_m: 210,
      start_name: 'Zeist station', start_lat: route('rt05').start_lat, start_lng: route('rt05').start_lng, route_id: 'rt05',
      has_stopover: true, stopover_note: 'Pancake house halfway',
    },
    {
      ...base, id: 'rd09', club_id: CLUB_MAIN, creator_id: 'p02', title: 'Lek dyke headwind special', ride_type: 'road',
      starts_at: at(-3, 18, 30), distance_km: 64, avg_speed_kmh: 26, duration_minutes: 148, elevation_gain_m: 40,
      start_name: 'Neude square', start_lat: 52.0929, start_lng: 5.1185, route_id: 'rt04',
    },
  ];

  const ride_subgroups = [
    { id: 'sg01', ride_id: 'rd01', name: 'Sporty', description: 'around 24 km/h', sort_order: 0, max_participants: null },
    { id: 'sg02', ride_id: 'rd01', name: 'Easy', description: 'chat pace, around 19 km/h', sort_order: 1, max_participants: 10 },
    { id: 'sg03', ride_id: 'rd05', name: 'Fast', description: '29+ km/h', sort_order: 0, max_participants: 12 },
    { id: 'sg04', ride_id: 'rd05', name: 'Steady', description: '26–29 km/h', sort_order: 1, max_participants: 12 },
    { id: 'sg05', ride_id: 'rd05', name: 'Social', description: 'up to 26 km/h', sort_order: 2, max_participants: 12 },
  ];

  const ride_leaders = [
    { ride_id: 'rd01', user_id: 'p01', created_at: ago(72) },
    { ride_id: 'rd03', user_id: 'p06', created_at: ago(72) },
    { ride_id: 'rd05', user_id: 'p01', created_at: ago(72) },
    { ride_id: 'rd05', user_id: 'p06', created_at: ago(72) },
  ];

  const r = (ride_id: string, user_id: string, status: string, subgroup_id: string | null = null) => ({
    ride_id,
    user_id,
    status,
    subgroup_id,
    created_at: ago(30),
    updated_at: ago(30),
  });
  const ride_rsvps = [
    r('rd01', 'p01', 'going', 'sg01'), r('rd01', 'p03', 'going', 'sg02'), r('rd01', 'p05', 'going', 'sg02'),
    r('rd01', 'p07', 'going', 'sg01'), r('rd01', 'p08', 'maybe'), r('rd01', 'p10', 'not_going'),
    r('rd02', DEMO_USER_ID, 'going'), r('rd02', 'p02', 'going'), r('rd02', 'p06', 'going'), r('rd02', 'p03', 'maybe'),
    r('rd03', 'p06', 'going'), r('rd03', 'p02', 'going'), r('rd03', 'p07', 'going'), r('rd03', 'p08', 'going'),
    r('rd03', 'p10', 'going'), r('rd03', 'p05', 'going'), r('rd03', 'p01', 'going'),
    r('rd04', 'p11', 'going'), r('rd04', 'p12', 'going'), r('rd04', 'p02', 'going'),
    r('rd05', 'p01', 'going', 'sg03'), r('rd05', 'p02', 'going', 'sg03'), r('rd05', 'p06', 'going', 'sg04'),
    r('rd05', 'p07', 'going', 'sg04'), r('rd05', 'p05', 'going', 'sg05'), r('rd05', 'p03', 'going', 'sg05'),
    r('rd05', 'p08', 'maybe'),
    r('rd07', 'p03', 'going'), r('rd07', 'p10', 'going'),
    r('rd08', 'p04', 'going'), r('rd08', 'p08', 'going'),
    r('rd09', DEMO_USER_ID, 'going'), r('rd09', 'p02', 'going'), r('rd09', 'p05', 'going'),
  ];

  const c = (id: string, ride_id: string, author_id: string, body: string, hours: number) => ({
    id,
    ride_id,
    author_id,
    body,
    created_at: ago(hours),
    edited_at: null,
  });
  const ride_comments = [
    c('cm01', 'rd01', 'p05', 'Is the sandy bit near the estate rideable after all the rain?', 5),
    c('cm02', 'rd01', 'p01', 'Checked it on Sunday — firm enough. Maybe 35 psi if you have 40 mm tyres.', 4),
    c('cm03', 'rd01', 'p03', 'Great, I’ll join the easy group 🙌', 2),
    c('cm04', 'rd02', 'p02', 'Who has a spare tube in 28 mm? Mine went missing.', 10),
    c('cm05', 'rd05', 'p06', 'Steady group: we regroup at the top of every climb.', 20),
    c('cm06', 'rd04', 'p11', 'Wind forecast looks friendly for once. See you at the station!', 8),
  ];

  const news_posts = [
    {
      id: 'nw01', club_id: CLUB_MAIN, author_id: DEMO_USER_ID, pinned: true, created_at: ago(26), updated_at: ago(26),
      title: 'Winter schedule starts next week',
      body: 'From next week the weekend long ride starts at 10:00 instead of 09:00. Weekday evening rides continue as long as the roads stay dry.\n\nPlease use proper lights front and rear — a flashing rear light is required for every evening ride. Mudguards are very welcome: the riders behind you will thank you.',
    },
    {
      id: 'nw02', club_id: CLUB_MAIN, author_id: 'p02', pinned: false, created_at: ago(24 * 4), updated_at: ago(24 * 4),
      title: 'New club kit — sizing day on Saturday',
      body: 'Samples of the new jersey and bib shorts are at the bike shop on Saturday between 10:00 and 14:00. Try them on and put your order in before the end of the month.',
    },
    {
      id: 'nw03', club_id: CLUB_MAIN, author_id: 'p01', pinned: false, created_at: ago(24 * 9), updated_at: ago(24 * 9),
      title: 'Ride leader workshop',
      body: 'Want to lead rides? We are running a short workshop on group communication, hand signals and first aid basics. Sign up in the chat of the next long ride.',
    },
    {
      id: 'nw04', club_id: CLUB_GRAVEL, author_id: 'p04', pinned: false, created_at: ago(24 * 3), updated_at: ago(24 * 3),
      title: 'Forest tracks open again',
      body: 'The forestry service reopened the northern tracks. Expect fresh gravel near the junction with the cycle path.',
    },
  ];

  const n = (id: string, type: string, title: string, body: string, hours: number, extra: Row = {}) => ({
    id,
    user_id: DEMO_USER_ID,
    type,
    title,
    body,
    club_id: CLUB_MAIN,
    ride_id: null,
    data: {},
    read_at: null,
    created_at: ago(hours),
    ...extra,
  });
  const notifications = [
    n('nt01', 'comment', 'After-work gravel loop', 'Femke de Graaf: Great, I’ll join the easy group 🙌', 2, { ride_id: 'rd01' }),
    n('nt02', 'member_request', 'Join request: Northside Cycling Club', 'Sophie Willems wants to join.', 20, { data: { member_id: 'p09' } }),
    n('nt03', 'ride_new', 'New ride: Long ride: Heuvelrug climbs', 'Northside Cycling Club · 09:00', 30, { ride_id: 'rd05' }),
    n('nt04', 'news', 'Winter schedule starts next week', 'From next week the weekend long ride starts at 10:00…', 26, { data: { post_id: 'nw01' }, read_at: ago(20) }),
    n('nt05', 'ride_cancelled', 'Cancelled: Night MTB', 'Trails closed after the storm — new date soon.', 48, { ride_id: 'rd06', read_at: ago(40) }),
  ];

  return {
    seededAt: new Date().toISOString(),
    users: [{ id: DEMO_USER_ID, email: DEMO_EMAIL, password: DEMO_PASSWORD, confirmed: true }],
    profiles,
    profile_private: [{ user_id: DEMO_USER_ID, phone: '+31 6 1234 5678', emergency_name: 'Sam Vos', emergency_phone: '+31 6 8765 4321', updated_at: ago(100) }],
    clubs,
    club_members,
    saved_locations: [
      { id: 'sl01', club_id: CLUB_MAIN, name: 'Neude square', address: 'Neude, Utrecht', lat: 52.0929, lng: 5.1185, created_by: DEMO_USER_ID, created_at: ago(500) },
      { id: 'sl02', club_id: CLUB_MAIN, name: 'Café Oase, Amelisweerd', address: 'Amelisweerd, Bunnik', lat: route('rt03').start_lat, lng: route('rt03').start_lng, created_by: 'p01', created_at: ago(400) },
      { id: 'sl03', club_id: CLUB_MAIN, name: 'Galgenwaard stadium', address: 'Herculesplein, Utrecht', lat: 52.0786, lng: 5.1458, created_by: 'p06', created_at: ago(300) },
    ],
    routes,
    route_favorites: [{ user_id: DEMO_USER_ID, route_id: 'rt02', created_at: ago(100) }],
    rides,
    ride_leaders,
    ride_subgroups,
    ride_rsvps,
    ride_comments,
    news_posts,
    notifications,
    push_tokens: [],
    calendar_tokens: [],
  };
}
