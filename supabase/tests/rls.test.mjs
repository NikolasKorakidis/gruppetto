// Runs every migration against an in-memory Postgres (PGlite) with a minimal
// stand-in for Supabase's auth/storage schemas, then checks the security rules
// by acting as different users.  Run with:  npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text,
    owner_id text default (auth.uid())::text
  );
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant all on storage.objects to authenticated;
  grant execute on all functions in schema storage to authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated, service_role;
`;

const db = new PGlite();
await db.exec(SUPABASE_STUB);
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
}

// --- helpers ---------------------------------------------------------------
async function asUser(uid, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid ?? '' })]);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
async function asAdmin(sql, params = []) {
  await db.exec('reset role');
  return (await db.query(sql, params)).rows;
}
async function rejects(promise, pattern, label) {
  try {
    await promise;
  } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`${label}: wrong error "${e.message}"`);
    return;
  }
  throw new Error(`${label}: expected an error`);
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

// --- fixtures ----------------------------------------------------------------
const [owner, rider, outsider, leader] = (
  await asAdmin(
    `insert into auth.users (email, raw_user_meta_data) values
       ('owner@test.dev', '{"display_name":"Olga Owner"}'),
       ('rider@test.dev', '{}'),
       ('out@test.dev', '{"display_name":"Otto Outsider"}'),
       ('lead@test.dev', '{"display_name":"Lena Leader"}')
     returning id`,
  )
).map((r) => r.id);

console.log('\nGruppetto database tests');

let club, code, ride, publicRide;

await test('signup creates profiles (name from metadata or email)', async () => {
  const rows = await asAdmin(`select display_name from public.profiles order by display_name`);
  assert.deepEqual(rows.map((r) => r.display_name).sort(), ['Lena Leader', 'Olga Owner', 'Otto Outsider', 'rider'].sort());
});

await test('anon cannot read profiles', async () => {
  await rejects(asUser(null, `select * from public.profiles`), /permission denied/, 'anon read');
});

await test('creating a club makes the creator owner', async () => {
  const [c] = await asUser(owner, `insert into public.clubs (name) values ('Test Club') returning id, invite_code`);
  club = c.id;
  code = c.invite_code;
  assert.match(code, /^[A-Z2-9]{8}$/);
  const [m] = await asUser(owner, `select role, status from public.club_members where club_id = $1`, [club]);
  assert.deepEqual(m, { role: 'owner', status: 'active' });
});

await test('outsider can preview a club by invite code but not read it directly', async () => {
  const preview = await asUser(outsider, `select * from public.club_by_invite($1)`, [code.toLowerCase()]);
  assert.equal(preview[0].name, 'Test Club');
  const direct = await asUser(outsider, `select * from public.clubs where id = $1`, [club]);
  assert.equal(direct.length, 0);
});

await test('joining with approval creates a pending membership and notifies admins', async () => {
  const [j] = await asUser(rider, `select * from public.join_club($1)`, [code]);
  assert.equal(j.status, 'pending');
  const notes = await asUser(owner, `select type from public.notifications`);
  assert.deepEqual(notes.map((n) => n.type), ['member_request']);
});

await test('pending member cannot approve themselves', async () => {
  const rows = await asUser(rider, `update public.club_members set status = 'active' where user_id = $1 returning *`, [rider]);
  assert.equal(rows.length, 0);
});

await test('admin approves; member is notified', async () => {
  await asUser(owner, `update public.club_members set status = 'active' where club_id = $1 and user_id = $2`, [club, rider]);
  const notes = await asUser(rider, `select type from public.notifications`);
  assert.deepEqual(notes.map((n) => n.type), ['member_approved']);
  const audit = await asUser(owner, `select action from public.audit_events`);
  assert.equal(audit[0].action, 'membership.updated');
});

await test('a plain member cannot change roles', async () => {
  const rows = await asUser(rider, `update public.club_members set role = 'admin' where user_id = $1 returning *`, [rider]);
  assert.equal(rows.length, 0);
});

await test('the last owner cannot leave', async () => {
  await rejects(
    asUser(owner, `delete from public.club_members where user_id = $1`, [owner]),
    /last owner/,
    'owner leave',
  );
});

await test('owner promotes a ride leader', async () => {
  await asUser(leader, `select * from public.join_club($1)`, [code]);
  await asUser(owner, `update public.club_members set status = 'active', role = 'leader' where user_id = $1`, [leader]);
  const [m] = await asUser(leader, `select role, status from public.club_members where user_id = $1`, [leader]);
  assert.deepEqual(m, { role: 'leader', status: 'active' });
});

await test('member creates a ride; duration is derived; club is notified', async () => {
  const [r] = await asUser(
    rider,
    `insert into public.rides (club_id, title, starts_at, distance_km, avg_speed_kmh, ride_type)
     values ($1, 'Test ride', now() + interval '2 days', 40, 20, 'gravel') returning id, duration_minutes`,
    [club],
  );
  ride = r.id;
  assert.equal(r.duration_minutes, 120);
  const notes = await asUser(owner, `select type from public.notifications where ride_id = $1`, [ride]);
  assert.deepEqual(notes.map((n) => n.type), ['ride_new']);
});

await test('outsider cannot see or RSVP to a club-only ride', async () => {
  assert.equal((await asUser(outsider, `select id from public.rides where id = $1`, [ride])).length, 0);
  await rejects(
    asUser(outsider, `insert into public.ride_rsvps (ride_id, status) values ($1, 'going')`, [ride]),
    /row-level security/,
    'outsider rsvp',
  );
});

await test('ride creator can assign an eligible leader, but not a plain member', async () => {
  await asUser(rider, `insert into public.ride_leaders (ride_id, user_id) values ($1, $2)`, [ride, leader]);
  await rejects(
    asUser(rider, `insert into public.ride_leaders (ride_id, user_id) values ($1, $2)`, [ride, rider]),
    /row-level security/,
    'ineligible leader',
  );
});

await test('assigned leader can edit the ride; others cannot', async () => {
  const ok = await asUser(leader, `update public.rides set description = 'Bring lights' where id = $1 returning id`, [ride]);
  assert.equal(ok.length, 1);
  const no = await asUser(outsider, `update public.rides set description = 'x' where id = $1 returning id`, [ride]);
  assert.equal(no.length, 0);
});

await test('subgroups are editable until the first sign-up, then frozen', async () => {
  const groups = await asUser(
    rider,
    `insert into public.ride_subgroups (ride_id, name, sort_order) values ($1, 'A 30+', 0), ($1, 'B 25-30', 1) returning id`,
    [ride],
  );
  await asUser(owner, `insert into public.ride_rsvps (ride_id, status, subgroup_id) values ($1, 'going', $2)`, [ride, groups[0].id]);
  await rejects(
    asUser(rider, `update public.ride_subgroups set name = 'A 32+' where id = $1`, [groups[0].id]),
    /cannot be changed/,
    'frozen subgroups',
  );
});

await test('subgroup from another ride is rejected', async () => {
  const [other] = await asUser(owner, `insert into public.rides (club_id, title, starts_at) values ($1, 'Other', now() + interval '3 days') returning id`, [club]);
  const [g] = await asUser(owner, `insert into public.ride_subgroups (ride_id, name) values ($1, 'X') returning id`, [other.id]);
  await rejects(
    asUser(leader, `insert into public.ride_rsvps (ride_id, status, subgroup_id) values ($1, 'going', $2)`, [ride, g.id]),
    /Invalid group/,
    'cross-ride subgroup',
  );
});

await test('capacity is enforced', async () => {
  await asUser(owner, `update public.rides set max_participants = 1 where id = $1`, [ride]);
  await rejects(
    asUser(leader, `insert into public.ride_rsvps (ride_id, status) values ($1, 'going')`, [ride]),
    /full/,
    'capacity',
  );
  // "maybe" is still allowed when full.
  await asUser(leader, `insert into public.ride_rsvps (ride_id, status) values ($1, 'maybe')`, [ride]);
  await asUser(owner, `update public.rides set max_participants = null where id = $1`, [ride]);
});

await test('a user cannot RSVP on behalf of someone else', async () => {
  await rejects(
    asUser(rider, `insert into public.ride_rsvps (ride_id, user_id, status) values ($1, $2, 'going')`, [ride, outsider]),
    /row-level security/,
    'rsvp for other',
  );
});

await test('comments notify participants, creator and leaders (not the author)', async () => {
  await asAdmin(`delete from public.notifications`);
  await asUser(owner, `insert into public.ride_comments (ride_id, body) values ($1, 'Who brings coffee?')`, [ride]);
  const rows = await asAdmin(`select user_id from public.notifications where type = 'comment'`);
  assert.deepEqual(rows.map((r) => r.user_id).sort(), [rider, leader].sort());
});

await test('cancelling notifies participants and blocks new RSVPs', async () => {
  await asAdmin(`delete from public.notifications`);
  await asUser(rider, `update public.rides set status = 'cancelled', cancel_reason = 'Storm' where id = $1`, [ride]);
  const rows = await asAdmin(`select user_id, body from public.notifications where type = 'ride_cancelled'`);
  assert.deepEqual(rows.map((r) => r.user_id).sort(), [owner, leader].sort());
  assert.equal(rows[0].body, 'Storm');
  await rejects(
    asUser(leader, `update public.ride_rsvps set status = 'going' where ride_id = $1 and user_id = $2`, [ride, leader]),
    /row-level security/,
    'rsvp on cancelled',
  );
  await asUser(rider, `update public.rides set status = 'published' where id = $1`, [ride]);
  const back = await asAdmin(`select cancel_reason from public.rides where id = $1`, [ride]);
  assert.equal(back[0].cancel_reason, null);
});

await test('public rides are visible to and joinable by non-members', async () => {
  const [r] = await asUser(owner, `insert into public.rides (club_id, title, starts_at, visibility) values ($1, 'Open gravel', now() + interval '5 days', 'public') returning id`, [club]);
  publicRide = r.id;
  assert.equal((await asUser(outsider, `select id from public.rides where id = $1`, [publicRide])).length, 1);
  await asUser(outsider, `insert into public.ride_rsvps (ride_id, status) values ($1, 'going')`, [publicRide]);
  // ...and can see the club name for that ride
  assert.equal((await asUser(outsider, `select name from public.clubs where id = $1`, [club]))[0].name, 'Test Club');
  // ...but not the member list or news
  assert.equal((await asUser(outsider, `select * from public.club_members where club_id = $1`, [club])).length, 0);
});

await test('drafts are only visible to their creator', async () => {
  const [d] = await asUser(rider, `insert into public.rides (club_id, title, starts_at, status) values ($1, 'Draft', now() + interval '1 day', 'draft') returning id`, [club]);
  assert.equal((await asUser(owner, `select id from public.rides where id = $1`, [d.id])).length, 0);
  assert.equal((await asUser(rider, `select id from public.rides where id = $1`, [d.id])).length, 1);
});

await test('private profile data: self and club admins only', async () => {
  await asUser(rider, `insert into public.profile_private (user_id, emergency_phone) values ($1, '+31 6 1234')`, [rider]);
  assert.equal((await asUser(owner, `select * from public.profile_private`)).length, 1);
  assert.equal((await asUser(leader, `select * from public.profile_private`)).length, 0);
  assert.equal((await asUser(outsider, `select * from public.profile_private`)).length, 0);
});

await test('news: admins post, members read and get notified, outsiders see nothing', async () => {
  await rejects(
    asUser(rider, `insert into public.news_posts (club_id, title, body) values ($1, 'Hi', 'x')`, [club]),
    /row-level security/,
    'member news',
  );
  await asUser(owner, `insert into public.news_posts (club_id, title, body) values ($1, 'Season opener', 'Saturday!')`, [club]);
  assert.equal((await asUser(rider, `select * from public.news_posts`)).length, 1);
  assert.equal((await asUser(outsider, `select * from public.news_posts`)).length, 0);
  assert.equal((await asUser(rider, `select * from public.notifications where type = 'news'`)).length, 1);
});

await test('notification preferences are respected', async () => {
  await asUser(rider, `update public.profiles set notify_prefs = notify_prefs || '{"news": false}' where id = $1`, [rider]);
  await asUser(owner, `insert into public.news_posts (club_id, title, body) values ($1, 'Second', 'y')`, [club]);
  assert.equal((await asUser(rider, `select * from public.notifications where type = 'news'`)).length, 1);
});

await test('users only see their own notifications', async () => {
  const all = await asAdmin(`select count(*)::int as n from public.notifications`);
  const mine = await asUser(rider, `select count(*)::int as n from public.notifications`);
  assert.ok(mine[0].n < all[0].n);
});

await test('GPX storage: members upload to their club folder only', async () => {
  await asUser(rider, `insert into storage.objects (bucket_id, name) values ('gpx', $1)`, [`${club}/a.gpx`]);
  await rejects(
    asUser(outsider, `insert into storage.objects (bucket_id, name) values ('gpx', $1)`, [`${club}/b.gpx`]),
    /row-level security/,
    'outsider upload',
  );
  assert.equal((await asUser(outsider, `select * from storage.objects where bucket_id = 'gpx'`)).length, 0);
  assert.equal((await asUser(leader, `select * from storage.objects where bucket_id = 'gpx'`)).length, 1);
});

await test('routes attached to a public ride become readable for its viewers', async () => {
  const [rt] = await asUser(rider, `insert into public.routes (club_id, title, gpx_path) values ($1, 'Forest loop', $2) returning id`, [club, `${club}/a.gpx`]);
  assert.equal((await asUser(outsider, `select id from public.routes where id = $1`, [rt.id])).length, 0);
  await asUser(owner, `update public.rides set route_id = $1 where id = $2`, [rt.id, publicRide]);
  assert.equal((await asUser(outsider, `select id from public.routes where id = $1`, [rt.id])).length, 1);
  assert.equal((await asUser(outsider, `select * from storage.objects where bucket_id = 'gpx'`)).length, 1);
});

await test('calendar token rotation returns a fresh secret', async () => {
  const [a] = await asUser(rider, `select public.rotate_calendar_token() as t`);
  const [b] = await asUser(rider, `select public.rotate_calendar_token() as t`);
  assert.notEqual(a.t, b.t);
  assert.equal(a.t.length, 64);
  assert.equal((await asUser(owner, `select * from public.calendar_tokens`)).length, 0);
});

await test('trigger-only helpers are not callable by users', async () => {
  await rejects(asUser(rider, `select * from public.ride_audience($1, null, 'comment')`, [ride]), /permission denied/, 'ride_audience');
});

await test('deleting a user cascades cleanly', async () => {
  await asAdmin(`delete from auth.users where id = $1`, [outsider]);
  assert.equal((await asAdmin(`select * from public.ride_rsvps where user_id = $1`, [outsider])).length, 0);
});

await test('deleting a club cascades through rides, groups and RSVPs', async () => {
  await asUser(owner, `delete from public.clubs where id = $1`, [club]);
  assert.equal((await asAdmin(`select count(*)::int as n from public.rides`))[0].n, 0);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}\n`);
await db.close();
