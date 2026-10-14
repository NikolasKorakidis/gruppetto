-- =============================================================================
-- Gruppetto — initial schema
-- Multi-club ride planning: clubs, members, rides, RSVPs, routes (GPX),
-- comments, news, notifications, calendar feeds.
--
-- Security model
--   * Every table has RLS enabled. Anonymous users get nothing.
--   * Tenant boundary = club_id. Membership is checked through SECURITY DEFINER
--     helpers (is_club_member / is_club_admin) so policies never recurse.
--   * Notifications are only written by triggers (SECURITY DEFINER).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.club_role as enum ('owner', 'admin', 'leader', 'member');
create type public.membership_status as enum ('pending', 'active', 'rejected');
create type public.ride_type as enum ('road', 'gravel', 'mtb', 'cx', 'ebike', 'social', 'training', 'tour');
create type public.ride_visibility as enum ('club', 'public');
create type public.ride_status as enum ('draft', 'published', 'cancelled', 'completed');
create type public.rsvp_status as enum ('going', 'maybe', 'not_going');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 8 chars, no ambiguous characters (0/O, 1/I/L).
create function public.gen_invite_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 31) + 1, 1), '')
  from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') as b) s,
       generate_series(0, 7) as i
$$;

create function public.gen_secret_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 80),
  avatar_url    text,
  bio           text check (char_length(bio) <= 500),
  city          text check (char_length(city) <= 80),
  notify_prefs  jsonb not null default
                '{"ride_new": true, "ride_changed": true, "comment": true, "news": true}'::jsonb,
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Sensitive data lives in its own table so it can have stricter policies.
create table public.profile_private (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  phone             text check (char_length(phone) <= 40),
  emergency_name    text check (char_length(emergency_name) <= 80),
  emergency_phone   text check (char_length(emergency_phone) <= 40),
  updated_at        timestamptz not null default now()
);
create trigger profile_private_updated_at before update on public.profile_private
  for each row execute function public.set_updated_at();

-- Create a profile row for every new auth user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Clubs & membership
-- ---------------------------------------------------------------------------
create table public.clubs (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 2 and 80),
  description        text check (char_length(description) <= 2000),
  city               text check (char_length(city) <= 80),
  logo_url           text,
  color              text not null default '#0E7C66' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  invite_code        text not null unique default public.gen_invite_code(),
  requires_approval  boolean not null default true,
  is_discoverable    boolean not null default false,
  timezone           text not null default 'Europe/Amsterdam',
  created_by         uuid not null default auth.uid() references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger clubs_updated_at before update on public.clubs
  for each row execute function public.set_updated_at();

create table public.club_members (
  club_id      uuid not null references public.clubs (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.club_role not null default 'member',
  status       public.membership_status not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  uuid references public.profiles (id) on delete set null,
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id, status);

-- Membership helpers. SECURITY DEFINER so they can be used inside policies
-- of club_members itself without infinite recursion.
create function public.club_role_of(p_club uuid) returns public.club_role
language sql stable security definer set search_path = '' as $$
  select role from public.club_members
  where club_id = p_club and user_id = auth.uid() and status = 'active'
$$;

create function public.is_club_member(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club and user_id = auth.uid() and status = 'active'
  )
$$;

create function public.is_club_admin(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club and user_id = auth.uid() and status = 'active'
      and role in ('owner', 'admin')
  )
$$;

-- True when the caller administers a club that p_user is an active member of.
create function public.is_admin_of_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.club_members a
    join public.club_members b on b.club_id = a.club_id
    where a.user_id = auth.uid() and a.status = 'active' and a.role in ('owner', 'admin')
      and b.user_id = p_user and b.status = 'active'
  )
$$;

-- The creator of a club becomes its owner.
create function public.handle_new_club() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.club_members (club_id, user_id, role, status, approved_at)
  values (new.id, new.created_by, 'owner', 'active', now());
  return new;
end $$;

create trigger on_club_created after insert on public.clubs
  for each row execute function public.handle_new_club();

-- Guard rails on membership changes (RLS decides *who* may write, this decides
-- *what* may change).
create function public.guard_club_members() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_role public.club_role;
begin
  -- Cascades (club or user deletion) and service-role maintenance bypass the guard.
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return coalesce(new, old);
  end if;

  v_actor_role := public.club_role_of(coalesce(new.club_id, old.club_id));

  if tg_op = 'DELETE' then
    if old.role = 'owner' and not exists (
      select 1 from public.club_members
      where club_id = old.club_id and role = 'owner' and status = 'active' and user_id <> old.user_id
    ) then
      raise exception 'The last owner cannot leave or be removed. Transfer ownership first.'
        using errcode = 'P0001';
    end if;
    if old.role in ('owner', 'admin') and old.user_id <> auth.uid() and v_actor_role <> 'owner' then
      raise exception 'Only an owner can remove an admin.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.club_id <> old.club_id or new.user_id <> old.user_id then
    raise exception 'Membership keys are immutable.' using errcode = 'P0001';
  end if;
  if (new.role in ('owner', 'admin') or old.role in ('owner', 'admin'))
     and new.role is distinct from old.role and v_actor_role is distinct from 'owner' then
    raise exception 'Only an owner can grant or revoke admin/owner roles.' using errcode = 'P0001';
  end if;
  if old.role = 'owner' and new.role <> 'owner' and not exists (
    select 1 from public.club_members
    where club_id = old.club_id and role = 'owner' and status = 'active' and user_id <> old.user_id
  ) then
    raise exception 'A club needs at least one owner.' using errcode = 'P0001';
  end if;
  if new.status = 'active' and old.status <> 'active' then
    new.approved_at := now();
    new.approved_by := auth.uid();
  end if;
  return new;
end $$;

create trigger club_members_guard before update or delete on public.club_members
  for each row execute function public.guard_club_members();

-- Invite flow --------------------------------------------------------------
create function public.club_by_invite(p_code text)
returns table (id uuid, name text, city text, logo_url text, color text, member_count bigint, requires_approval boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.city, c.logo_url, c.color,
         (select count(*) from public.club_members m where m.club_id = c.id and m.status = 'active'),
         c.requires_approval
  from public.clubs c
  where c.invite_code = upper(trim(p_code))
$$;

create function public.join_club(p_code text)
returns table (club_id uuid, status public.membership_status)
language plpgsql security definer set search_path = '' as $$
declare
  v_club public.clubs;
  v_status public.membership_status;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into v_club from public.clubs where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'Invalid invite code' using errcode = 'P0002';
  end if;

  v_status := case when v_club.requires_approval then 'pending' else 'active' end;

  insert into public.club_members (club_id, user_id, role, status, approved_at)
  values (v_club.id, auth.uid(), 'member', v_status,
          case when v_status = 'active' then now() end)
  on conflict on constraint club_members_pkey do update
    -- A rejected user may ask again; active/pending stay as they are.
    set status = case when public.club_members.status = 'rejected' then excluded.status
                      else public.club_members.status end,
        requested_at = now()
  returning public.club_members.status into v_status;

  return query select v_club.id, v_status;
end $$;

create function public.regenerate_invite_code(p_club uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if not public.is_club_admin(p_club) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.clubs set invite_code = public.gen_invite_code() where id = p_club
  returning invite_code into v_code;
  return v_code;
end $$;

-- ---------------------------------------------------------------------------
-- Saved start locations
-- ---------------------------------------------------------------------------
create table public.saved_locations (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  address     text check (char_length(address) <= 200),
  lat         double precision,
  lng         double precision,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index saved_locations_club_idx on public.saved_locations (club_id);

-- ---------------------------------------------------------------------------
-- Routes (GPX library)
-- ---------------------------------------------------------------------------
create table public.routes (
  id                uuid primary key default gen_random_uuid(),
  club_id           uuid not null references public.clubs (id) on delete cascade,
  owner_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 120),
  description       text check (char_length(description) <= 2000),
  ride_type         public.ride_type,
  visibility        public.ride_visibility not null default 'club',
  distance_km       numeric(7, 2),
  elevation_gain_m  integer,
  elevation_loss_m  integer,
  start_lat         double precision,
  start_lng         double precision,
  bbox              double precision[],          -- [minLat, minLng, maxLat, maxLng]
  preview           jsonb,                       -- simplified [[lat, lng], ...]
  gpx_path          text,                        -- storage: gpx/<club_id>/<file>.gpx
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index routes_club_idx on public.routes (club_id, created_at desc);
create trigger routes_updated_at before update on public.routes
  for each row execute function public.set_updated_at();

create table public.route_favorites (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  route_id    uuid not null references public.routes (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, route_id)
);

-- ---------------------------------------------------------------------------
-- Rides
-- ---------------------------------------------------------------------------
create table public.rides (
  id                 uuid primary key default gen_random_uuid(),
  club_id            uuid not null references public.clubs (id) on delete cascade,
  creator_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  published_as_club  boolean not null default false,
  title              text not null check (char_length(title) between 2 and 120),
  description        text check (char_length(description) <= 5000),
  ride_type          public.ride_type not null default 'road',
  starts_at          timestamptz not null,
  distance_km        numeric(7, 2) check (distance_km > 0 and distance_km < 2000),
  avg_speed_kmh      numeric(4, 1) check (avg_speed_kmh > 0 and avg_speed_kmh < 80),
  duration_minutes   integer check (duration_minutes > 0),
  elevation_gain_m   integer check (elevation_gain_m >= 0),
  start_name         text check (char_length(start_name) <= 120),
  start_address      text check (char_length(start_address) <= 200),
  start_lat          double precision,
  start_lng          double precision,
  has_stopover       boolean not null default false,
  stopover_note      text check (char_length(stopover_note) <= 200),
  visibility         public.ride_visibility not null default 'club',
  status             public.ride_status not null default 'published',
  route_id           uuid references public.routes (id) on delete set null,
  max_participants   integer check (max_participants > 0),
  allow_maybe        boolean not null default true,
  cancel_reason      text check (char_length(cancel_reason) <= 300),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index rides_club_starts_idx on public.rides (club_id, starts_at);
create index rides_public_starts_idx on public.rides (starts_at) where visibility = 'public';
create trigger rides_updated_at before update on public.rides
  for each row execute function public.set_updated_at();

-- Fill duration from distance/speed when not given; keep keys immutable.
create function public.prepare_ride() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.club_id <> old.club_id or new.creator_id <> old.creator_id) then
    raise exception 'club_id and creator_id cannot be changed' using errcode = 'P0001';
  end if;
  if new.distance_km is not null and new.avg_speed_kmh is not null
     and (new.duration_minutes is null
          or (tg_op = 'UPDATE' and new.duration_minutes = old.duration_minutes
              and (new.distance_km <> old.distance_km or new.avg_speed_kmh <> old.avg_speed_kmh))) then
    new.duration_minutes := round(new.distance_km / new.avg_speed_kmh * 60);
  end if;
  if new.status <> 'cancelled' then
    new.cancel_reason := null;
  end if;
  return new;
end $$;

create trigger rides_prepare before insert or update on public.rides
  for each row execute function public.prepare_ride();

create table public.ride_leaders (
  ride_id     uuid not null references public.rides (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (ride_id, user_id)
);

create table public.ride_subgroups (
  id                uuid primary key default gen_random_uuid(),
  ride_id           uuid not null references public.rides (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 40),
  description       text check (char_length(description) <= 120),
  sort_order        integer not null default 0,
  max_participants  integer check (max_participants > 0)
);
create index ride_subgroups_ride_idx on public.ride_subgroups (ride_id, sort_order);

create table public.ride_rsvps (
  ride_id      uuid not null references public.rides (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status       public.rsvp_status not null,
  subgroup_id  uuid references public.ride_subgroups (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (ride_id, user_id)
);
create index ride_rsvps_user_idx on public.ride_rsvps (user_id);
create trigger ride_rsvps_updated_at before update on public.ride_rsvps
  for each row execute function public.set_updated_at();

create table public.ride_comments (
  id          uuid primary key default gen_random_uuid(),
  ride_id     uuid not null references public.rides (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index ride_comments_ride_idx on public.ride_comments (ride_id, created_at);

-- Ride permission helpers ---------------------------------------------------
create function public.can_view_ride(p_ride uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rides r
    where r.id = p_ride
      and (r.creator_id = auth.uid()
           or (r.status <> 'draft' and (r.visibility = 'public' or public.is_club_member(r.club_id))))
  )
$$;

create function public.can_manage_ride(p_ride uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rides r
    where r.id = p_ride
      and (r.creator_id = auth.uid()
           or public.is_club_admin(r.club_id)
           or exists (select 1 from public.ride_leaders l where l.ride_id = r.id and l.user_id = auth.uid()))
  )
$$;

create function public.can_rsvp(p_ride uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rides r
    where r.id = p_ride
      and r.status = 'published'
      and r.starts_at > now() - interval '12 hours'
      and (r.visibility = 'public' or public.is_club_member(r.club_id))
  )
$$;

create function public.can_view_route(p_route uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.routes rt
    where rt.id = p_route
      and (rt.owner_id = auth.uid()
           or rt.visibility = 'public'
           or public.is_club_member(rt.club_id)
           or exists (select 1 from public.rides r
                      where r.route_id = rt.id and r.visibility = 'public' and r.status <> 'draft'))
  )
$$;

-- Subgroups are frozen once someone has signed up (protects people's choice).
create function public.guard_ride_subgroups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if exists (
    select 1 from public.ride_rsvps
    where ride_id = coalesce(new.ride_id, old.ride_id) and status in ('going', 'maybe')
  ) then
    raise exception 'Groups cannot be changed after the first sign-up.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger ride_subgroups_guard before insert or update or delete on public.ride_subgroups
  for each row execute function public.guard_ride_subgroups();

-- RSVP validation: subgroup must belong to the ride, maybe must be allowed,
-- capacity is enforced (ride-level and group-level).
create function public.validate_rsvp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ride public.rides;
  v_group public.ride_subgroups;
  v_count integer;
begin
  -- Lock the ride row so concurrent sign-ups cannot overbook.
  select * into v_ride from public.rides where id = new.ride_id for update;

  if new.status = 'maybe' and not v_ride.allow_maybe then
    raise exception 'This ride does not allow "maybe".' using errcode = 'P0001';
  end if;

  if new.status <> 'going' then
    new.subgroup_id := null;
  end if;

  if new.subgroup_id is not null then
    select * into v_group from public.ride_subgroups where id = new.subgroup_id;
    if not found or v_group.ride_id <> new.ride_id then
      raise exception 'Invalid group for this ride.' using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'going' and (tg_op = 'INSERT' or old.status <> 'going'
                               or new.subgroup_id is distinct from old.subgroup_id) then
    if v_ride.max_participants is not null then
      select count(*) into v_count from public.ride_rsvps
      where ride_id = new.ride_id and status = 'going' and user_id <> new.user_id;
      if v_count >= v_ride.max_participants then
        raise exception 'This ride is full.' using errcode = 'P0001';
      end if;
    end if;
    if v_group.max_participants is not null then
      select count(*) into v_count from public.ride_rsvps
      where subgroup_id = new.subgroup_id and status = 'going' and user_id <> new.user_id;
      if v_count >= v_group.max_participants then
        raise exception 'This group is full.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end $$;

create trigger ride_rsvps_validate before insert or update on public.ride_rsvps
  for each row execute function public.validate_rsvp();

-- ---------------------------------------------------------------------------
-- News
-- ---------------------------------------------------------------------------
create table public.news_posts (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 2 and 140),
  body        text not null check (char_length(body) <= 10000),
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index news_posts_club_idx on public.news_posts (club_id, pinned desc, created_at desc);
create trigger news_posts_updated_at before update on public.news_posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications, push tokens, calendar tokens, audit
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  club_id     uuid references public.clubs (id) on delete cascade,
  ride_id     uuid references public.rides (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.push_tokens (
  token       text primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

create table public.calendar_tokens (
  user_id     uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  token       text not null unique default public.gen_secret_token(),
  created_at  timestamptz not null default now()
);

create function public.rotate_calendar_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  insert into public.calendar_tokens (user_id) values (auth.uid())
  on conflict (user_id) do update set token = public.gen_secret_token(), created_at = now()
  returning token into v_token;
  return v_token;
end $$;

create table public.audit_events (
  id          bigint generated always as identity primary key,
  club_id     uuid references public.clubs (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_events_club_idx on public.audit_events (club_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notification fan-out triggers
-- ---------------------------------------------------------------------------

-- Ride participants (going/maybe) + creator + leaders, minus one excluded user,
-- filtered by a notify_prefs key.
create function public.ride_audience(p_ride uuid, p_exclude uuid, p_pref text)
returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct u.uid
  from (
    select r.user_id as uid from public.ride_rsvps r
      where r.ride_id = p_ride and r.status in ('going', 'maybe')
    union
    select creator_id from public.rides where id = p_ride
    union
    select l.user_id from public.ride_leaders l where l.ride_id = p_ride
  ) u
  join public.profiles p on p.id = u.uid
  where u.uid is distinct from p_exclude
    and coalesce((p.notify_prefs ->> p_pref)::boolean, true)
$$;

create function public.on_comment_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ride public.rides;
  v_author text;
begin
  select * into v_ride from public.rides where id = new.ride_id;
  select display_name into v_author from public.profiles where id = new.author_id;
  insert into public.notifications (user_id, type, title, body, club_id, ride_id)
  select a.user_id, 'comment', v_ride.title, coalesce(v_author, 'Someone') || ': ' || left(new.body, 140),
         v_ride.club_id, v_ride.id
  from public.ride_audience(new.ride_id, new.author_id, 'comment') a;
  return new;
end $$;

create trigger ride_comments_notify after insert on public.ride_comments
  for each row execute function public.on_comment_created();

create function public.notify_new_ride(p_ride public.rides) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_club text;
begin
  select name into v_club from public.clubs where id = p_ride.club_id;
  insert into public.notifications (user_id, type, title, body, club_id, ride_id)
  select m.user_id, 'ride_new', 'New ride: ' || p_ride.title,
         v_club || ' · ' || to_char(p_ride.starts_at at time zone coalesce(
           (select timezone from public.clubs where id = p_ride.club_id), 'UTC'), 'Dy DD Mon HH24:MI'),
         p_ride.club_id, p_ride.id
  from public.club_members m
  join public.profiles p on p.id = m.user_id
  where m.club_id = p_ride.club_id and m.status = 'active'
    and m.user_id <> p_ride.creator_id
    and coalesce((p.notify_prefs ->> 'ride_new')::boolean, true);
end $$;

create function public.on_ride_written() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' then
      perform public.notify_new_ride(new);
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status = 'draft' and new.status = 'published' then
    perform public.notify_new_ride(new);
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    insert into public.notifications (user_id, type, title, body, club_id, ride_id)
    select a.user_id, 'ride_cancelled', 'Cancelled: ' || new.title,
           coalesce(new.cancel_reason, 'This ride has been cancelled.'), new.club_id, new.id
    from public.ride_audience(new.id, auth.uid(), 'ride_changed') a;
    insert into public.audit_events (club_id, actor_id, action, entity, entity_id, details)
    values (new.club_id, auth.uid(), 'ride.cancelled', 'ride', new.id::text,
            jsonb_build_object('reason', new.cancel_reason));
  elsif old.status = 'cancelled' and new.status = 'published' then
    insert into public.notifications (user_id, type, title, body, club_id, ride_id)
    select a.user_id, 'ride_reactivated', 'Back on: ' || new.title,
           'This ride is happening after all.', new.club_id, new.id
    from public.ride_audience(new.id, auth.uid(), 'ride_changed') a;
    insert into public.audit_events (club_id, actor_id, action, entity, entity_id)
    values (new.club_id, auth.uid(), 'ride.reactivated', 'ride', new.id::text);
  elsif new.status = 'published' and (
        new.starts_at is distinct from old.starts_at
     or new.start_name is distinct from old.start_name
     or new.start_address is distinct from old.start_address
     or new.route_id is distinct from old.route_id) then
    insert into public.notifications (user_id, type, title, body, club_id, ride_id)
    select a.user_id, 'ride_changed', 'Updated: ' || new.title,
           'Start time, location or route has changed.', new.club_id, new.id
    from public.ride_audience(new.id, auth.uid(), 'ride_changed') a;
  end if;
  return new;
end $$;

create trigger rides_notify after insert or update on public.rides
  for each row execute function public.on_ride_written();

create function public.on_news_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, club_id, data)
  select m.user_id, 'news', new.title, left(new.body, 140), new.club_id,
         jsonb_build_object('post_id', new.id)
  from public.club_members m
  join public.profiles p on p.id = m.user_id
  where m.club_id = new.club_id and m.status = 'active' and m.user_id <> new.author_id
    and coalesce((p.notify_prefs ->> 'news')::boolean, true);
  return new;
end $$;

create trigger news_posts_notify after insert on public.news_posts
  for each row execute function public.on_news_created();

create function public.on_membership_written() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_club text;
begin
  select name into v_club from public.clubs where id = new.club_id;

  if new.status = 'pending' and (tg_op = 'INSERT' or old.status <> 'pending') then
    select display_name into v_name from public.profiles where id = new.user_id;
    insert into public.notifications (user_id, type, title, body, club_id, data)
    select m.user_id, 'member_request', 'Join request: ' || v_club,
           coalesce(v_name, 'Someone') || ' wants to join.', new.club_id,
           jsonb_build_object('member_id', new.user_id)
    from public.club_members m
    where m.club_id = new.club_id and m.status = 'active' and m.role in ('owner', 'admin');
  elsif tg_op = 'UPDATE' and new.status = 'active' and old.status = 'pending' then
    insert into public.notifications (user_id, type, title, body, club_id)
    values (new.user_id, 'member_approved', 'Welcome to ' || v_club,
            'Your membership has been approved.', new.club_id);
  end if;

  if tg_op = 'UPDATE' and (new.role <> old.role or new.status <> old.status) then
    insert into public.audit_events (club_id, actor_id, action, entity, entity_id, details)
    values (new.club_id, auth.uid(), 'membership.updated', 'club_member', new.user_id::text,
            jsonb_build_object('from', jsonb_build_object('role', old.role, 'status', old.status),
                               'to',   jsonb_build_object('role', new.role, 'status', new.status)));
  end if;
  return new;
end $$;

create trigger club_members_notify after insert or update on public.club_members
  for each row execute function public.on_membership_written();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.profile_private  enable row level security;
alter table public.clubs            enable row level security;
alter table public.club_members     enable row level security;
alter table public.saved_locations  enable row level security;
alter table public.routes           enable row level security;
alter table public.route_favorites  enable row level security;
alter table public.rides            enable row level security;
alter table public.ride_leaders     enable row level security;
alter table public.ride_subgroups   enable row level security;
alter table public.ride_rsvps       enable row level security;
alter table public.ride_comments    enable row level security;
alter table public.news_posts       enable row level security;
alter table public.notifications    enable row level security;
alter table public.push_tokens      enable row level security;
alter table public.calendar_tokens  enable row level security;
alter table public.audit_events     enable row level security;

-- profiles: non-sensitive, readable by signed-in users; only self can edit.
create policy "profiles: read" on public.profiles for select to authenticated using (true);
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- profile_private: self, plus admins of a shared club (read only).
create policy "private: read" on public.profile_private for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_of_user(user_id));
create policy "private: insert self" on public.profile_private for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "private: update self" on public.profile_private for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- clubs
create policy "clubs: read" on public.clubs for select to authenticated
  using (
    created_by = (select auth.uid())
    or public.is_club_member(id)
    or is_discoverable
    or exists (select 1 from public.club_members m
               where m.club_id = clubs.id and m.user_id = (select auth.uid()))
    or exists (select 1 from public.rides r
               where r.club_id = clubs.id and r.visibility = 'public' and r.status <> 'draft')
  );
create policy "clubs: create" on public.clubs for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "clubs: update by admin" on public.clubs for update to authenticated
  using (public.is_club_admin(id)) with check (public.is_club_admin(id));
create policy "clubs: delete by owner" on public.clubs for delete to authenticated
  using (public.club_role_of(id) = 'owner');

-- club_members: rows are created through join_club() / the club trigger.
create policy "members: read" on public.club_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (status = 'active' and public.is_club_member(club_id))
    or public.is_club_admin(club_id)
  );
create policy "members: admin update" on public.club_members for update to authenticated
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));
create policy "members: leave or remove" on public.club_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_club_admin(club_id));

-- saved_locations
create policy "locations: read" on public.saved_locations for select to authenticated
  using (public.is_club_member(club_id));
create policy "locations: create" on public.saved_locations for insert to authenticated
  with check (public.is_club_member(club_id) and created_by = (select auth.uid()));
create policy "locations: delete" on public.saved_locations for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_club_admin(club_id));

-- routes
create policy "routes: read" on public.routes for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_view_route(id));
create policy "routes: create" on public.routes for insert to authenticated
  with check (public.is_club_member(club_id) and owner_id = (select auth.uid()));
create policy "routes: update" on public.routes for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_club_admin(club_id))
  with check (public.is_club_member(club_id));
create policy "routes: delete" on public.routes for delete to authenticated
  using (owner_id = (select auth.uid()) or public.is_club_admin(club_id));

create policy "favorites: own" on public.route_favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_view_route(route_id));

-- rides
create policy "rides: read" on public.rides for select to authenticated
  using (
    creator_id = (select auth.uid())
    or (status <> 'draft' and (visibility = 'public' or public.is_club_member(club_id)))
  );
create policy "rides: create" on public.rides for insert to authenticated
  with check (public.is_club_member(club_id) and creator_id = (select auth.uid()));
create policy "rides: update" on public.rides for update to authenticated
  using (public.can_manage_ride(id)) with check (public.is_club_member(club_id));
create policy "rides: delete" on public.rides for delete to authenticated
  using (creator_id = (select auth.uid()) or public.is_club_admin(club_id));

-- ride_leaders: managers assign; assignee must be an eligible active member.
create policy "leaders: read" on public.ride_leaders for select to authenticated
  using (public.can_view_ride(ride_id));
create policy "leaders: assign" on public.ride_leaders for insert to authenticated
  with check (
    public.can_manage_ride(ride_id)
    and exists (
      select 1 from public.rides r
      join public.club_members m on m.club_id = r.club_id
      where r.id = ride_id and m.user_id = ride_leaders.user_id
        and m.status = 'active' and m.role in ('owner', 'admin', 'leader')
    )
  );
create policy "leaders: unassign" on public.ride_leaders for delete to authenticated
  using (public.can_manage_ride(ride_id));

-- ride_subgroups
create policy "groups: read" on public.ride_subgroups for select to authenticated
  using (public.can_view_ride(ride_id));
create policy "groups: manage" on public.ride_subgroups for all to authenticated
  using (public.can_manage_ride(ride_id)) with check (public.can_manage_ride(ride_id));

-- ride_rsvps
create policy "rsvps: read" on public.ride_rsvps for select to authenticated
  using (public.can_view_ride(ride_id));
create policy "rsvps: create own" on public.ride_rsvps for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_rsvp(ride_id));
create policy "rsvps: update own" on public.ride_rsvps for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_rsvp(ride_id));
create policy "rsvps: delete" on public.ride_rsvps for delete to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_ride(ride_id));

-- ride_comments
create policy "comments: read" on public.ride_comments for select to authenticated
  using (public.can_view_ride(ride_id));
create policy "comments: create" on public.ride_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_view_ride(ride_id));
create policy "comments: edit own" on public.ride_comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "comments: delete" on public.ride_comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.can_manage_ride(ride_id));

-- news_posts
create policy "news: read" on public.news_posts for select to authenticated
  using (public.is_club_member(club_id));
create policy "news: create" on public.news_posts for insert to authenticated
  with check (public.is_club_admin(club_id) and author_id = (select auth.uid()));
create policy "news: update" on public.news_posts for update to authenticated
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));
create policy "news: delete" on public.news_posts for delete to authenticated
  using (public.is_club_admin(club_id));

-- notifications: own only (rows are inserted by triggers).
create policy "notifications: read own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications: update own" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: delete own" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- push & calendar tokens: own only.
create policy "push: own" on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar: read own" on public.calendar_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy "calendar: delete own" on public.calendar_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- audit: club admins read.
create policy "audit: admin read" on public.audit_events for select to authenticated
  using (public.is_club_admin(club_id));

-- ---------------------------------------------------------------------------
-- Grants: explicit and minimal. anon gets nothing.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to authenticated, service_role;
-- Trigger-only helpers should not be callable directly.
revoke execute on function public.notify_new_ride(public.rides) from authenticated;
revoke execute on function public.ride_audience(uuid, uuid, text) from authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.ride_comments, public.ride_rsvps, public.notifications;

-- ---------------------------------------------------------------------------
-- Storage buckets & policies
--   gpx/<club_id>/<uuid>.gpx      private, club members only
--   avatars/<user_id>/<file>      public read, owner write
--   club-logos/<club_id>/<file>   public read, club admin write
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('gpx', 'gpx', false, 15728640, null),
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('club-logos', 'club-logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function public.can_read_gpx(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_club_member(public.try_uuid((string_to_array(p_name, '/'))[1]))
      or exists (select 1 from public.routes r where r.gpx_path = p_name and public.can_view_route(r.id))
$$;
grant execute on function public.can_read_gpx(text) to authenticated;

create policy "gpx: read" on storage.objects for select to authenticated
  using (bucket_id = 'gpx' and public.can_read_gpx(name));
create policy "gpx: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'gpx'
              and public.is_club_member(public.try_uuid((storage.foldername(name))[1])));
create policy "gpx: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'gpx' and owner_id = (select auth.uid())::text);

create policy "avatars: write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
create policy "avatars: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

create policy "logos: write admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'club-logos'
              and public.is_club_admin(public.try_uuid((storage.foldername(name))[1])));
create policy "logos: update admin" on storage.objects for update to authenticated
  using (bucket_id = 'club-logos'
         and public.is_club_admin(public.try_uuid((storage.foldername(name))[1])));
create policy "logos: delete admin" on storage.objects for delete to authenticated
  using (bucket_id = 'club-logos'
         and public.is_club_admin(public.try_uuid((storage.foldername(name))[1])));
