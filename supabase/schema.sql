-- Halfway database schema for Supabase (PostgreSQL 15 or newer).
--
-- Run this file first in the Supabase SQL editor, then run puzzles.sql.
-- Both files are safe to run again after an update.
--
-- Security model
--   * Players sign in anonymously (Supabase Auth, "Anonymous sign-ins").
--   * Every table has row level security on and no policies, and table
--     privileges are revoked, so clients cannot read or write tables directly.
--   * Clients call the functions at the bottom of this file. They run with the
--     owner's rights, act only for auth.uid(), and compute scores on the server
--     from the player's pin, so a modified client cannot post a made-up score.

-- =====================================================================
-- Tables
-- =====================================================================

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  callsign   text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.puzzles (
  day      date not null,
  round    smallint not null check (round between 1 and 5),
  a_name   text not null,
  b_name   text not null,
  a_lon    double precision not null,
  a_lat    double precision not null,
  b_lon    double precision not null,
  b_lat    double precision not null,
  mid_lon  double precision not null,
  mid_lat  double precision not null,
  dist_km  double precision not null check (dist_km > 0),
  primary key (day, round)
);

create table if not exists public.plays (
  player     uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  round      smallint not null,
  pin_lon    double precision not null check (pin_lon between -180 and 180),
  pin_lat    double precision not null check (pin_lat between -90 and 90),
  km         double precision not null,
  score      smallint not null check (score between 0 and 100),
  hard       boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (player, day, round),
  foreign key (day, round) references public.puzzles (day, round)
);
create index if not exists plays_day_round_idx on public.plays (day, round);

create table if not exists public.leagues (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  name       text not null check (char_length(name) between 1 and 40),
  owner      uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.league_members (
  league    uuid not null references public.leagues (id) on delete cascade,
  player    uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league, player)
);
create index if not exists league_members_player_idx on public.league_members (player);

alter table public.profiles       enable row level security;
alter table public.puzzles        enable row level security;
alter table public.plays          enable row level security;
alter table public.leagues        enable row level security;
alter table public.league_members enable row level security;

revoke all on public.profiles, public.puzzles, public.plays, public.leagues, public.league_members
  from anon, authenticated;

-- =====================================================================
-- Helpers (not callable by clients)
-- =====================================================================

-- Great-circle distance in km (haversine, Earth radius 6371 km), as in src/lib/geo.js.
create or replace function public.halfway_km(lon1 double precision, lat1 double precision,
                                             lon2 double precision, lat2 double precision)
returns double precision
language sql immutable
as $$
  select 2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  )))
$$;

-- Same curve as scoreFor() in src/lib/scoring.js.
create or replace function public.halfway_score(off_km double precision, route_km double precision)
returns smallint
language sql immutable
as $$
  select case
    when off_km <= greatest(60, route_km * 0.015) then 100
    else round((100 * power(0.5, ((off_km - greatest(60, route_km * 0.015)) / route_km) / 0.12))::numeric)
  end::smallint
$$;

-- Callsigns are "Adjective Noun NN" from fixed lists, as in src/lib/callsigns.js.
create or replace function public.halfway_callsign_ok(p text)
returns boolean
language sql immutable
as $$
  select coalesce(p ~ '^[A-Za-z]+ [A-Za-z]+ [1-9][0-9]$', false)
     and split_part(p, ' ', 1) = any (array[
       'Amber', 'Arctic', 'Cobalt', 'Coral', 'Copper', 'Crimson', 'Golden', 'Indigo', 'Jade',
       'Lunar', 'Misty', 'Polar', 'Saffron', 'Silver', 'Solar', 'Swift', 'Tidal', 'Velvet'])
     and split_part(p, ' ', 2) = any (array[
       'Albatross', 'Comet', 'Condor', 'Crane', 'Falcon', 'Gannet', 'Heron', 'Horizon', 'Ibis',
       'Kestrel', 'Meridian', 'Monsoon', 'Osprey', 'Petrel', 'Sirocco', 'Swallow', 'Tern', 'Zephyr'])
$$;

create or replace function public.halfway_new_code()
returns text
language plpgsql volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text := '';
begin
  for i in 1..6 loop
    c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return c;
end
$$;

create or replace function public.halfway_require_profile()
returns uuid
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'halfway:not_signed_in';
  end if;
  if not exists (select 1 from profiles where id = uid) then
    raise exception 'halfway:no_profile';
  end if;
  return uid;
end
$$;

-- =====================================================================
-- Client API
-- =====================================================================

create or replace function public.set_callsign(p_callsign text)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'halfway:not_signed_in';
  end if;
  if not halfway_callsign_ok(p_callsign) then
    raise exception 'halfway:bad_callsign';
  end if;
  insert into profiles (id, callsign) values (uid, p_callsign)
  on conflict (id) do update set callsign = excluded.callsign;
  return p_callsign;
end
$$;

create or replace function public.my_profile()
returns table (callsign text, days_played bigint, total_points bigint)
language sql stable security definer set search_path = public, pg_temp
as $$
  select pr.callsign,
         (select count(distinct pl.day) from plays pl where pl.player = pr.id),
         (select coalesce(sum(pl.score), 0) from plays pl where pl.player = pr.id)
  from profiles pr
  where pr.id = auth.uid()
$$;

-- Scores one round on the server. Rounds must arrive in order, once each,
-- for a day that is "today" somewhere on Earth. Re-sending a round that was
-- already stored returns the stored result, so retries are safe.
create or replace function public.submit_round(p_day date, p_round int,
                                               p_lon double precision, p_lat double precision,
                                               p_hard boolean default false)
returns table (points smallint, off_km double precision)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  uid       uuid := halfway_require_profile();
  utc_today date := (now() at time zone 'utc')::date;
  pz        puzzles;
  done      int;
  v_km      double precision;
  v_score   smallint;
begin
  if p_day is null or p_day < utc_today - 1 or p_day > utc_today + 1 then
    raise exception 'halfway:day_closed';
  end if;
  if p_lon is null or p_lat is null or p_lon < -180 or p_lon > 180 or p_lat < -90 or p_lat > 90 then
    raise exception 'halfway:bad_pin';
  end if;

  select pl.score, pl.km into v_score, v_km
  from plays pl where pl.player = uid and pl.day = p_day and pl.round = p_round;
  if found then
    return query select v_score, v_km;
    return;
  end if;

  select * into pz from puzzles z where z.day = p_day and z.round = p_round;
  if not found then
    raise exception 'halfway:no_puzzle';
  end if;

  select count(*) into done from plays pl where pl.player = uid and pl.day = p_day;
  if done <> p_round - 1 then
    raise exception 'halfway:out_of_order';
  end if;

  v_km := halfway_km(p_lon, p_lat, pz.mid_lon, pz.mid_lat);
  v_score := halfway_score(v_km, pz.dist_km);
  insert into plays (player, day, round, pin_lon, pin_lat, km, score, hard)
  values (uid, p_day, p_round, p_lon, p_lat, v_km, v_score, coalesce(p_hard, false));
  return query select v_score, v_km;
end
$$;

-- Top players for one day (only players who finished all five rounds), plus the caller.
create or replace function public.daily_board(p_day date, p_limit int default 10)
returns table (pos bigint, callsign text, total int, off_km int, scores smallint[],
               hard boolean, is_me boolean, players bigint)
language sql stable security definer set search_path = public, pg_temp
as $$
  with t as (
    select pl.player,
           sum(pl.score)::int                      as total,
           round(sum(pl.km))::int                  as off_km,
           array_agg(pl.score order by pl.round)   as scores,
           bool_and(pl.hard)                       as hard
    from plays pl
    where pl.day = p_day
    group by pl.player
    having count(*) = 5
  ), r as (
    select t.*, rank() over (order by t.total desc, t.off_km asc) as rk, count(*) over () as n
    from t
  )
  select r.rk, pr.callsign, r.total, r.off_km, r.scores, r.hard,
         coalesce(r.player = auth.uid(), false), r.n
  from r join profiles pr on pr.id = r.player
  where r.rk <= least(greatest(coalesce(p_limit, 10), 1), 100) or r.player = auth.uid()
  order by r.rk, pr.callsign
$$;

-- Total points across every day played.
create or replace function public.alltime_board(p_limit int default 10)
returns table (pos bigint, callsign text, total bigint, days bigint, is_me boolean, players bigint)
language sql stable security definer set search_path = public, pg_temp
as $$
  with t as (
    select pl.player, sum(pl.score)::bigint as total, count(distinct pl.day) as days
    from plays pl
    group by pl.player
  ), r as (
    select t.*, rank() over (order by t.total desc, t.days asc) as rk, count(*) over () as n
    from t
  )
  select r.rk, pr.callsign, r.total, r.days, coalesce(r.player = auth.uid(), false), r.n
  from r join profiles pr on pr.id = r.player
  where r.rk <= least(greatest(coalesce(p_limit, 10), 1), 100) or r.player = auth.uid()
  order by r.rk, pr.callsign
$$;

-- Where other players tapped on a round, and how the caller compares.
-- Only available once the caller has played that round.
create or replace function public.round_crowd(p_day date, p_round int)
returns json
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  uid  uuid := halfway_require_profile();
  mine smallint;
begin
  select pl.score into mine from plays pl
  where pl.player = uid and pl.day = p_day and pl.round = p_round;
  if not found then
    raise exception 'halfway:play_first';
  end if;
  return json_build_object(
    'pins', coalesce((
      select json_agg(json_build_array(round(x.pin_lon::numeric, 2), round(x.pin_lat::numeric, 2)))
      from (
        select pl.pin_lon, pl.pin_lat from plays pl
        where pl.day = p_day and pl.round = p_round and pl.player <> uid
        order by pl.created_at desc
        limit 300
      ) x), '[]'::json),
    'others', (select count(*) from plays pl
               where pl.day = p_day and pl.round = p_round and pl.player <> uid),
    'beaten', (select count(*) from plays pl
               where pl.day = p_day and pl.round = p_round and pl.player <> uid and pl.score < mine),
    'median', (select percentile_disc(0.5) within group (order by pl.score) from plays pl
               where pl.day = p_day and pl.round = p_round)
  );
end
$$;

create or replace function public.create_league(p_name text)
returns table (league_code text, league_name text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  uid    uuid := halfway_require_profile();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
  v_code text;
  v_id   uuid;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'halfway:bad_name';
  end if;
  if (select count(*) from leagues l where l.owner = uid) >= 10 then
    raise exception 'halfway:too_many_leagues';
  end if;
  loop
    v_code := halfway_new_code();
    begin
      insert into leagues (code, name, owner) values (v_code, v_name, uid) returning id into v_id;
      exit;
    exception when unique_violation then
      -- code already taken: try another
    end;
  end loop;
  insert into league_members (league, player) values (v_id, uid);
  return query select v_code, v_name;
end
$$;

create or replace function public.join_league(p_code text)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  uid    uuid := halfway_require_profile();
  v_id   uuid;
  v_name text;
begin
  select l.id, l.name into v_id, v_name from leagues l where l.code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'halfway:no_league';
  end if;
  if exists (select 1 from league_members m where m.league = v_id and m.player = uid) then
    return v_name;
  end if;
  if (select count(*) from league_members m where m.player = uid) >= 30 then
    raise exception 'halfway:too_many_memberships';
  end if;
  if (select count(*) from league_members m where m.league = v_id) >= 500 then
    raise exception 'halfway:league_full';
  end if;
  insert into league_members (league, player) values (v_id, uid) on conflict do nothing;
  return v_name;
end
$$;

create or replace function public.leave_league(p_code text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  uid uuid := halfway_require_profile();
begin
  delete from league_members m
  using leagues l
  where l.id = m.league and l.code = upper(btrim(coalesce(p_code, ''))) and m.player = uid;
end
$$;

create or replace function public.my_leagues()
returns table (league_code text, league_name text, members bigint, is_owner boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select l.code, l.name,
         (select count(*) from league_members x where x.league = l.id),
         l.owner = auth.uid()
  from leagues l
  join league_members m on m.league = l.id and m.player = auth.uid()
  order by l.created_at
$$;

-- Standings for a league between two dates (inclusive, at most 31 days). Members only.
create or replace function public.league_board(p_code text, p_from date, p_to date)
returns table (pos bigint, callsign text, total bigint, days bigint, is_me boolean, players bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  uid  uuid := halfway_require_profile();
  v_id uuid;
begin
  select l.id into v_id from leagues l where l.code = upper(btrim(coalesce(p_code, '')));
  if not found or not exists (select 1 from league_members m where m.league = v_id and m.player = uid) then
    raise exception 'halfway:not_a_member';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then
    raise exception 'halfway:bad_range';
  end if;
  return query
    with t as (
      select m.player,
             coalesce(sum(pl.score), 0)::bigint as total,
             count(distinct pl.day)             as days
      from league_members m
      left join plays pl on pl.player = m.player and pl.day between p_from and p_to
      where m.league = v_id
      group by m.player
    ), r as (
      select t.*, rank() over (order by t.total desc) as rk, count(*) over () as n from t
    )
    select r.rk, pr.callsign, r.total, r.days, r.player = uid, r.n
    from r join profiles pr on pr.id = r.player
    order by r.rk, pr.callsign;
end
$$;

-- Removes the caller's profile, plays, league memberships and owned leagues.
create or replace function public.delete_my_data()
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'halfway:not_signed_in';
  end if;
  delete from profiles where id = uid;
end
$$;

-- =====================================================================
-- Permissions: only signed-in players (anonymous included) may call the API.
-- =====================================================================

revoke execute on function
  public.halfway_km(double precision, double precision, double precision, double precision),
  public.halfway_score(double precision, double precision),
  public.halfway_callsign_ok(text),
  public.halfway_new_code(),
  public.halfway_require_profile(),
  public.set_callsign(text),
  public.my_profile(),
  public.submit_round(date, int, double precision, double precision, boolean),
  public.daily_board(date, int),
  public.alltime_board(int),
  public.round_crowd(date, int),
  public.create_league(text),
  public.join_league(text),
  public.leave_league(text),
  public.my_leagues(),
  public.league_board(text, date, date),
  public.delete_my_data()
from public, anon, authenticated;

grant execute on function
  public.set_callsign(text),
  public.my_profile(),
  public.submit_round(date, int, double precision, double precision, boolean),
  public.daily_board(date, int),
  public.alltime_board(int),
  public.round_crowd(date, int),
  public.create_league(text),
  public.join_league(text),
  public.leave_league(text),
  public.my_leagues(),
  public.league_board(text, date, date),
  public.delete_my_data()
to authenticated;
