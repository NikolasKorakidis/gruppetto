/**
 * Demo mode: an in-app stand-in for the Supabase HTTP API (auth, PostgREST,
 * RPC, storage, functions). The real supabase-js client talks to it through a
 * custom `fetch`, so every screen runs exactly the same code as in production.
 * Data lives in memory and is saved to localStorage so changes survive reloads.
 */
import { createSeed, DEMO_USER_ID, type DemoDb } from './seed';

type Row = Record<string, any>;
type Table = Exclude<keyof DemoDb, 'seededAt' | 'users'>;

const STORAGE_KEY = 'gruppetto.demo.v2';
export const DEMO_URL = 'https://demo.gruppetto.local';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
function sameDay(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function load(): DemoDb {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb;
      // Ride dates are relative to "today": reseed on a new day so they stay upcoming.
      if (sameDay(parsed.seededAt)) return parsed;
    }
  } catch {
    // corrupt storage: start fresh
  }
  return createSeed();
}

let db: DemoDb = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // storage full or unavailable: keep working in memory
  }
}

const listeners = new Set<() => void>();
/** Subscribe to any data change (used to refresh screens, like Realtime would). */
export function onDemoChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function changed() {
  save();
  listeners.forEach((fn) => fn());
}

export function resetDemoData() {
  db = createSeed();
  changed();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const now = () => new Date().toISOString();
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
const code = (n = 8) =>
  Array.from({ length: n }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class HttpError {
  status: number;
  body: Row;
  constructor(status: number, body: Row) {
    this.status = status;
    this.body = body;
  }
}
const pgError = (message: string, status = 400) => new HttpError(status, { code: 'P0001', message, details: null, hint: null });

function respond(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(body === undefined || status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

function jwt(sub: string, exp: number) {
  return `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ sub, exp, role: 'authenticated', aud: 'authenticated' }),
  )}.demo`;
}

function uidFrom(headers: Headers): string | null {
  const token = headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(unb64url(part)).sub ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function authUser(u: DemoDb['users'][number], identities = true) {
  const p = db.profiles.find((x) => x.id === u.id);
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: u.confirmed ? now() : null,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: p?.display_name },
    identities: identities ? [{ id: u.id, provider: 'email', identity_data: { email: u.email } }] : [],
    created_at: '2026-01-01T00:00:00Z',
  };
}

function session(userId: string) {
  const u = db.users.find((x) => x.id === userId)!;
  const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
  return {
    access_token: jwt(userId, exp),
    token_type: 'bearer',
    expires_in: 30 * 86400,
    expires_at: exp,
    refresh_token: `demo-refresh.${userId}`,
    user: authUser(u),
  };
}

const authError = (status: number, error_code: string, msg: string) => new HttpError(status, { code: status, error_code, msg });

function handleAuth(method: string, path: string, query: URLSearchParams, body: Row, uid: string | null) {
  const findUser = (email: string) => db.users.find((u) => u.email === String(email ?? '').trim().toLowerCase());

  if (path === 'token' && query.get('grant_type') === 'password') {
    const u = findUser(body.email);
    if (!u || u.password !== body.password) throw authError(400, 'invalid_credentials', 'Invalid login credentials');
    if (!u.confirmed) throw authError(400, 'email_not_confirmed', 'Email not confirmed');
    return session(u.id);
  }
  if (path === 'token' && query.get('grant_type') === 'refresh_token') {
    const id = String(body.refresh_token ?? '').split('.')[1];
    if (!db.users.some((u) => u.id === id)) throw authError(400, 'refresh_token_not_found', 'Invalid Refresh Token');
    return session(id);
  }
  if (path === 'signup') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const existing = findUser(email);
    if (existing?.confirmed) return authUser(existing, false); // Supabase hides existing accounts like this
    if (existing) {
      existing.password = body.password;
      return authUser(existing);
    }
    const id = uuid();
    db.users.push({ id, email, password: body.password, confirmed: false });
    db.profiles.push({
      id,
      display_name: body.data?.display_name || email.split('@')[0],
      avatar_url: null,
      bio: null,
      city: null,
      notify_prefs: { ride_new: true, ride_changed: true, comment: true, news: true },
      onboarded: false,
      created_at: now(),
    });
    changed();
    return authUser(db.users.at(-1)!);
  }
  if (path === 'verify') {
    const u = findUser(body.email);
    if (!u || !/^\d{6,10}$/.test(String(body.token ?? ''))) throw authError(403, 'otp_expired', 'Token has expired or is invalid');
    u.confirmed = true;
    changed();
    return session(u.id);
  }
  if (path === 'user' && method === 'GET') {
    const u = db.users.find((x) => x.id === uid);
    if (!u) throw authError(401, 'session_not_found', 'Session not found');
    return authUser(u);
  }
  if (path === 'user' && method === 'PUT') {
    const u = db.users.find((x) => x.id === uid);
    if (!u) throw authError(401, 'session_not_found', 'Session not found');
    if (body.password) u.password = body.password;
    changed();
    return authUser(u);
  }
  if (path === 'logout') return undefined;
  return {}; // recover, resend, otp: pretend an email was sent
}

// ---------------------------------------------------------------------------
// Access rules (a light version of the real RLS policies)
// ---------------------------------------------------------------------------
const memberOf = (uid: string | null, clubId: unknown) =>
  db.club_members.some((m) => m.club_id === clubId && m.user_id === uid && m.status === 'active');
const adminOf = (uid: string | null, clubId: unknown) =>
  db.club_members.some((m) => m.club_id === clubId && m.user_id === uid && m.status === 'active' && ['owner', 'admin'].includes(m.role));

function visible(table: Table, row: Row, uid: string | null): boolean {
  switch (table) {
    case 'rides':
      return row.creator_id === uid || (row.status !== 'draft' && (row.visibility === 'public' || memberOf(uid, row.club_id)));
    case 'news_posts':
    case 'saved_locations':
      return memberOf(uid, row.club_id);
    case 'notifications':
    case 'push_tokens':
    case 'calendar_tokens':
      return row.user_id === uid;
    case 'profile_private':
      return row.user_id === uid || db.club_members.some((m) => m.user_id === row.user_id && adminOf(uid, m.club_id));
    case 'club_members':
      return row.user_id === uid || (row.status === 'active' && memberOf(uid, row.club_id)) || adminOf(uid, row.club_id);
    case 'routes':
      return (
        row.owner_id === uid ||
        row.visibility === 'public' ||
        memberOf(uid, row.club_id) ||
        db.rides.some((r) => r.route_id === row.id && r.visibility === 'public')
      );
    case 'clubs':
      return memberOf(uid, row.id) || row.is_discoverable || db.club_members.some((m) => m.club_id === row.id && m.user_id === uid);
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Query parsing (the subset of PostgREST the app uses)
// ---------------------------------------------------------------------------
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function splitTopLevel(s: string) {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function compare(a: unknown, b: string) {
  const na = Number(a);
  const nb = Number(b);
  if (a !== null && a !== '' && !Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== 'boolean') return na - nb;
  return String(a).localeCompare(b);
}

function test(value: unknown, expr: string): boolean {
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot);
  const v = expr.slice(dot + 1);
  switch (op) {
    case 'eq':
      return String(value) === v;
    case 'neq':
      return String(value) !== v;
    case 'gt':
      return value != null && compare(value, v) > 0;
    case 'gte':
      return value != null && compare(value, v) >= 0;
    case 'lt':
      return value != null && compare(value, v) < 0;
    case 'lte':
      return value != null && compare(value, v) <= 0;
    case 'in':
      return v
        .slice(1, -1)
        .split(',')
        .map((x) => x.replace(/^"|"$/g, ''))
        .includes(String(value));
    case 'is':
      return v === 'null' ? value == null : String(value) === v;
    default:
      return true;
  }
}

function filterRows(rows: Row[], q: URLSearchParams) {
  let out = rows;
  q.forEach((value, key) => {
    if (RESERVED.has(key)) return;
    if (key === 'or') {
      const parts = splitTopLevel(value.replace(/^\(|\)$/g, '')).map((p) => {
        const i = p.indexOf('.');
        return [p.slice(0, i), p.slice(i + 1)] as const;
      });
      out = out.filter((r) => parts.some(([col, expr]) => test(r[col], expr)));
    } else {
      out = out.filter((r) => test(r[key], value));
    }
  });
  return out;
}

function sortRows(rows: Row[], order: string | null) {
  if (!order) return rows;
  const keys = order.split(',').map((o) => {
    const [col, dir] = o.split('.');
    return { col, desc: dir === 'desc' };
  });
  return [...rows].sort((a, b) => {
    for (const { col, desc } of keys) {
      const x = a[col];
      const y = b[col];
      if (x === y) continue;
      const c = typeof x === 'boolean' || typeof y === 'boolean' ? Number(!!x) - Number(!!y) : compare(x, String(y));
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Embedded relations (what the app's select strings ask for)
// ---------------------------------------------------------------------------
const lite = (id: unknown) => {
  const p = db.profiles.find((x) => x.id === id);
  return p ? { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, city: p.city } : { id, display_name: 'Former member', avatar_url: null, city: null };
};
const clubLite = (id: unknown) => {
  const c = db.clubs.find((x) => x.id === id)!;
  return c ? { id: c.id, name: c.name, logo_url: c.logo_url, color: c.color } : null;
};

function shape(table: Table, row: Row): Row {
  switch (table) {
    case 'rides': {
      const route = row.route_id ? db.routes.find((r) => r.id === row.route_id) : null;
      return {
        ...row,
        club: clubLite(row.club_id),
        creator: lite(row.creator_id),
        rsvps: db.ride_rsvps.filter((r) => r.ride_id === row.id).map((r) => ({ ...r, profile: lite(r.user_id) })),
        leaders: db.ride_leaders.filter((l) => l.ride_id === row.id).map((l) => ({ user_id: l.user_id, profile: lite(l.user_id) })),
        subgroups: db.ride_subgroups.filter((g) => g.ride_id === row.id),
        comments: [{ count: db.ride_comments.filter((c) => c.ride_id === row.id).length }],
        route: route
          ? { id: route.id, title: route.title, preview: route.preview, gpx_path: route.gpx_path, distance_km: route.distance_km, elevation_gain_m: route.elevation_gain_m, start_lat: route.start_lat, start_lng: route.start_lng }
          : null,
      };
    }
    case 'club_members':
      return { ...row, club: db.clubs.find((c) => c.id === row.club_id) ?? null, profile: lite(row.user_id) };
    case 'ride_comments':
      return { ...row, author: lite(row.author_id) };
    case 'news_posts':
      return { ...row, author: lite(row.author_id) };
    case 'routes':
      return { ...row, owner: lite(row.owner_id) };
    case 'ride_rsvps':
    case 'ride_leaders':
      return { ...row, profile: lite(row.user_id) };
    default:
      return row;
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
const PK: Partial<Record<Table, string[]>> = {
  ride_rsvps: ['ride_id', 'user_id'],
  route_favorites: ['user_id', 'route_id'],
  ride_leaders: ['ride_id', 'user_id'],
  club_members: ['club_id', 'user_id'],
  profile_private: ['user_id'],
  push_tokens: ['token'],
  calendar_tokens: ['user_id'],
};
const pkOf = (t: Table) => PK[t] ?? ['id'];

function withDefaults(table: Table, input: Row, uid: string | null): Row {
  const row: Row = { ...input };
  if (pkOf(table)[0] === 'id' && !row.id) row.id = uuid();
  row.created_at ??= now();
  if (['rides', 'routes', 'clubs', 'news_posts', 'ride_rsvps', 'profile_private'].includes(table)) row.updated_at = now();
  switch (table) {
    case 'clubs':
      Object.assign(row, {
        invite_code: row.invite_code ?? code(),
        color: row.color ?? '#0E7C66',
        requires_approval: row.requires_approval ?? true,
        is_discoverable: row.is_discoverable ?? false,
        timezone: row.timezone ?? 'Europe/Amsterdam',
        created_by: uid,
      });
      break;
    case 'rides':
      Object.assign(row, {
        creator_id: uid,
        status: row.status ?? 'published',
        visibility: row.visibility ?? 'club',
        allow_maybe: row.allow_maybe ?? true,
        has_stopover: row.has_stopover ?? false,
        published_as_club: row.published_as_club ?? false,
      });
      break;
    case 'ride_comments':
      row.author_id = uid;
      row.edited_at = null;
      break;
    case 'news_posts':
      row.author_id = uid;
      row.pinned ??= false;
      break;
    case 'routes':
      row.owner_id = uid;
      row.visibility ??= 'club';
      break;
    case 'saved_locations':
      row.created_by = uid;
      break;
    case 'ride_rsvps':
    case 'route_favorites':
    case 'profile_private':
    case 'push_tokens':
      row.user_id ??= uid;
      break;
  }
  return row;
}

function computeDuration(row: Row) {
  if (row.distance_km && row.avg_speed_kmh && !row.duration_minutes) {
    row.duration_minutes = Math.round((Number(row.distance_km) / Number(row.avg_speed_kmh)) * 60);
  }
}

function validateRsvp(row: Row, uid: string | null) {
  if (row.user_id !== uid) throw pgError('new row violates row-level security policy for table "ride_rsvps"', 403);
  const ride = db.rides.find((r) => r.id === row.ride_id);
  if (!ride || ride.status !== 'published') throw pgError('new row violates row-level security policy for table "ride_rsvps"', 403);
  if (row.status === 'maybe' && !ride.allow_maybe) throw pgError('This ride does not allow "maybe".');
  if (row.status !== 'going') row.subgroup_id = null;
  if (row.status === 'going') {
    const others = db.ride_rsvps.filter((r) => r.ride_id === ride.id && r.status === 'going' && r.user_id !== uid);
    if (ride.max_participants && others.length >= ride.max_participants) throw pgError('This ride is full.');
    const group = db.ride_subgroups.find((g) => g.id === row.subgroup_id);
    if (group?.max_participants && others.filter((r) => r.subgroup_id === group.id).length >= group.max_participants) {
      throw pgError('This group is full.');
    }
  }
}

function notify(userId: string, n: Row) {
  db.notifications.push({ id: uuid(), user_id: userId, data: {}, read_at: null, created_at: now(), club_id: null, ride_id: null, body: null, ...n });
}

const REPLIES = ['See you there! 🚴', 'Count me in 👍', 'I’ll bring spare tubes.', 'Great, thanks for organising!', 'Weather looks good for it ☀️'];

/** A club mate answers your chat message a few seconds later, so the demo feels alive. */
function simulateReply(comment: Row, uid: string) {
  const ride = db.rides.find((r) => r.id === comment.ride_id);
  const candidates = db.ride_rsvps.filter((r) => r.ride_id === comment.ride_id && r.user_id !== uid && r.status === 'going');
  if (!ride || !candidates.length) return;
  const who = candidates[Math.floor(Math.random() * candidates.length)].user_id;
  setTimeout(() => {
    const body = REPLIES[Math.floor(Math.random() * REPLIES.length)];
    db.ride_comments.push({ id: uuid(), ride_id: ride.id, author_id: who, body, created_at: now(), edited_at: null });
    notify(uid, { type: 'comment', title: ride.title, body: `${lite(who).display_name}: ${body}`, club_id: ride.club_id, ride_id: ride.id });
    changed();
  }, 3500);
}

function afterInsert(table: Table, row: Row, uid: string | null) {
  if (table === 'clubs') {
    db.club_members.push({ club_id: row.id, user_id: uid, role: 'owner', status: 'active', requested_at: now(), approved_at: now(), approved_by: null });
  }
  if (table === 'ride_comments' && uid) simulateReply(row, uid);
}

function cascadeDelete(table: Table, row: Row) {
  const drop = (t: Table, pred: (r: Row) => boolean) => {
    (db as Record<Table, Row[]>)[t] = (db[t] as Row[]).filter((r) => !pred(r));
  };
  if (table === 'rides') {
    for (const t of ['ride_rsvps', 'ride_comments', 'ride_leaders', 'ride_subgroups', 'notifications'] as Table[]) drop(t, (r) => r.ride_id === row.id);
  }
  if (table === 'routes') {
    drop('route_favorites', (r) => r.route_id === row.id);
    db.rides.forEach((r) => r.route_id === row.id && (r.route_id = null));
  }
  if (table === 'clubs') {
    db.rides.filter((r) => r.club_id === row.id).forEach((r) => cascadeDelete('rides', r));
    for (const t of ['rides', 'club_members', 'routes', 'news_posts', 'saved_locations', 'notifications'] as Table[]) drop(t, (r) => r.club_id === row.id);
  }
}

function handleRest(method: string, table: Table, q: URLSearchParams, headers: Headers, body: unknown, uid: string | null) {
  if (!(table in db)) throw new HttpError(404, { code: 'PGRST205', message: `Could not find the table 'public.${table}'` });
  if (!uid) throw new HttpError(401, { code: '42501', message: 'permission denied' });
  const store = db[table] as Row[];
  const prefer = headers.get('Prefer') ?? '';
  const single = (headers.get('Accept') ?? '').includes('vnd.pgrst.object');
  const wantsRows = prefer.includes('return=representation');

  const finish = (rows: Row[], status = 200) => {
    const shaped = rows.map((r) => shape(table, r));
    if (single) {
      if (shaped.length !== 1) throw new HttpError(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      return respond(shaped[0], status);
    }
    return respond(shaped, status, { 'Content-Range': `0-${Math.max(0, shaped.length - 1)}/${shaped.length}` });
  };

  if (method === 'GET' || method === 'HEAD') {
    let rows = filterRows(store.filter((r) => visible(table, r, uid)), q);
    rows = sortRows(rows, q.get('order'));
    const total = rows.length;
    const offset = Number(q.get('offset') ?? 0);
    const limit = q.get('limit') ? Number(q.get('limit')) : undefined;
    rows = rows.slice(offset, limit ? offset + limit : undefined);
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'Content-Range': `0-${Math.max(0, total - 1)}/${total}` } });
    return finish(rows);
  }

  if (method === 'POST') {
    const items = (Array.isArray(body) ? body : [body]) as Row[];
    const upsert = prefer.includes('resolution=merge-duplicates');
    const out: Row[] = [];
    for (const item of items) {
      const keys = pkOf(table);
      const existing = upsert ? store.find((r) => keys.every((k) => r[k] === (item[k] ?? (k === 'user_id' ? uid : undefined)))) : null;
      if (existing) {
        const next = { ...existing, ...item, updated_at: now() };
        if (table === 'ride_rsvps') validateRsvp(next, uid);
        Object.assign(existing, next);
        out.push(existing);
        continue;
      }
      const row = withDefaults(table, item, uid);
      if (table === 'ride_rsvps') validateRsvp(row, uid);
      if (table === 'rides') {
        if (!memberOf(uid, row.club_id)) throw pgError('new row violates row-level security policy for table "rides"', 403);
        computeDuration(row);
      }
      if (table === 'ride_subgroups' && db.ride_rsvps.some((r) => r.ride_id === row.ride_id && r.status !== 'not_going')) {
        throw pgError('Groups cannot be changed after the first sign-up.');
      }
      store.push(row);
      afterInsert(table, row, uid);
      out.push(row);
    }
    changed();
    return wantsRows ? finish(out, 201) : respond(undefined, 201);
  }

  if (method === 'PATCH') {
    const patch = body as Row;
    const rows = filterRows(store.filter((r) => visible(table, r, uid)), q);
    for (const row of rows) {
      if (table === 'club_members' && patch.status === 'active' && row.status === 'pending') {
        const club = db.clubs.find((c) => c.id === row.club_id);
        notify(row.user_id, { type: 'member_approved', title: `Welcome to ${club?.name}`, body: 'Your membership has been approved.', club_id: row.club_id });
      }
      Object.assign(row, patch);
      if ('updated_at' in row) row.updated_at = now();
      if (table === 'rides') {
        if (patch.distance_km !== undefined || patch.avg_speed_kmh !== undefined) {
          if (patch.duration_minutes == null) row.duration_minutes = null;
          computeDuration(row);
        }
        if (row.status !== 'cancelled') row.cancel_reason = null;
      }
    }
    changed();
    return wantsRows ? finish(rows) : respond(undefined, 204);
  }

  if (method === 'DELETE') {
    const rows = filterRows(store.filter((r) => visible(table, r, uid)), q);
    if (table === 'club_members') {
      for (const r of rows) {
        const owners = store.filter((m) => m.club_id === r.club_id && m.role === 'owner' && m.status === 'active');
        if (r.role === 'owner' && owners.length <= 1) throw pgError('The last owner cannot leave or be removed. Transfer ownership first.');
      }
    }
    if (table === 'ride_subgroups') {
      const rideIds = new Set(rows.map((r) => r.ride_id));
      if (db.ride_rsvps.some((r) => rideIds.has(r.ride_id) && r.status !== 'not_going')) throw pgError('Groups cannot be changed after the first sign-up.');
    }
    (db as Record<Table, Row[]>)[table] = store.filter((r) => !rows.includes(r));
    rows.forEach((r) => cascadeDelete(table, r));
    changed();
    return wantsRows ? finish(rows) : respond(undefined, 204);
  }

  throw new HttpError(405, { message: 'Method not allowed' });
}

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------
function handleRpc(fn: string, args: Row, uid: string | null) {
  if (!uid) throw new HttpError(401, { message: 'Not signed in' });
  const byCode = (c: unknown) => db.clubs.find((x) => x.invite_code === String(c ?? '').trim().toUpperCase());
  switch (fn) {
    case 'club_by_invite': {
      const c = byCode(args.p_code);
      if (!c) return [];
      const member_count = db.club_members.filter((m) => m.club_id === c.id && m.status === 'active').length;
      return [{ id: c.id, name: c.name, city: c.city, logo_url: c.logo_url, color: c.color, member_count, requires_approval: c.requires_approval }];
    }
    case 'join_club': {
      const c = byCode(args.p_code);
      if (!c) throw pgError('Invalid invite code');
      let m = db.club_members.find((x) => x.club_id === c.id && x.user_id === uid);
      if (!m) {
        m = { club_id: c.id, user_id: uid, role: 'member', status: c.requires_approval ? 'pending' : 'active', requested_at: now(), approved_at: null, approved_by: null };
        db.club_members.push(m);
        if (m.status === 'pending') {
          // In the demo an admin approves you after a few seconds.
          setTimeout(() => {
            m!.status = 'active';
            m!.approved_at = now();
            notify(uid, { type: 'member_approved', title: `Welcome to ${c.name}`, body: 'Your membership has been approved.', club_id: c.id });
            changed();
          }, 6000);
        }
        changed();
      }
      return [{ club_id: c.id, status: m.status }];
    }
    case 'regenerate_invite_code': {
      const c = db.clubs.find((x) => x.id === args.p_club);
      if (!c || !adminOf(uid, c.id)) throw new HttpError(403, { code: '42501', message: 'Not allowed' });
      c.invite_code = code();
      changed();
      return c.invite_code;
    }
    case 'rotate_calendar_token': {
      const token = (uuid() + uuid()).replace(/-/g, '');
      db.calendar_tokens = db.calendar_tokens.filter((t) => t.user_id !== uid);
      db.calendar_tokens.push({ user_id: uid, token, created_at: now() });
      changed();
      return token;
    }
    default:
      throw new HttpError(404, { message: `Unknown function ${fn}` });
  }
}

// ---------------------------------------------------------------------------
// Entry point: fetch()-compatible
// ---------------------------------------------------------------------------
export async function demoFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const uid = uidFrom(headers);
  let body: unknown;
  if (typeof init.body === 'string' && init.body) {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }

  await sleep(120 + Math.random() * 220); // feel like a network

  try {
    const path = url.pathname;
    if (path.startsWith('/auth/v1/')) {
      const res = handleAuth(method, path.slice('/auth/v1/'.length), url.searchParams, body ?? {}, uid);
      return res === undefined ? respond(undefined, 204) : respond(res);
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      return respond(handleRpc(path.slice('/rest/v1/rpc/'.length), body ?? {}, uid));
    }
    if (path.startsWith('/rest/v1/')) {
      return handleRest(method, path.slice('/rest/v1/'.length) as Table, url.searchParams, headers, body, uid);
    }
    if (path.startsWith('/storage/v1/object/sign/')) {
      return respond({ signedURL: `/object/sign/${path.split('/sign/')[1]}?token=demo` });
    }
    if (path.startsWith('/storage/v1/')) {
      return respond(method === 'DELETE' ? [] : { Key: path, Id: uuid() });
    }
    if (path === '/functions/v1/delete-account') {
      if (!uid) throw new HttpError(401, { error: 'unauthorized' });
      db.users = db.users.filter((u) => u.id !== uid);
      db.profiles = db.profiles.filter((p) => p.id !== uid);
      db.club_members = db.club_members.filter((m) => m.user_id !== uid);
      db.ride_rsvps = db.ride_rsvps.filter((r) => r.user_id !== uid);
      changed();
      return respond({ deleted: true });
    }
    return respond({ message: 'Not found' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return respond(e.body, e.status);
    return respond({ message: String((e as Error)?.message ?? e) }, 500);
  }
}

/** GPX text for a route in demo mode (built from its stored line). */
export function demoGpx(path: string) {
  const route = db.routes.find((r) => r.gpx_path === path);
  const pts = ((route?.preview as [number, number][]) ?? [])
    .map(([lat, lng]) => `<trkpt lat="${lat}" lon="${lng}"></trkpt>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Gruppetto demo" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${route?.title ?? 'Route'}</name><trkseg>${pts}</trkseg></trk></gpx>`;
}

export const demoUserId = DEMO_USER_ID;
