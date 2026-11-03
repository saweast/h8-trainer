-- h8-trainer: access helpers, triggers, RPCs and read models

-- Access helpers ---------------------------------------------------------------------------
-- SECURITY DEFINER so RLS policies can call them without recursing into each other's policies.

create function public.my_athlete_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select a.id from public.athletes a where a.user_id = (select auth.uid())
$$;

create function public.is_trainer() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select p.is_trainer from public.profiles p where p.id = (select auth.uid())), false)
$$;

create function public.is_trainer_of(p_athlete uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trainer_athletes ta
    where ta.athlete_id = p_athlete and ta.trainer_id = (select auth.uid())
  )
$$;

-- The athlete themself or one of their trainers: full read + write (both may log and edit).
create function public.can_access_athlete(p_athlete uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.athletes a
      where a.id = p_athlete and a.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.trainer_athletes ta
      where ta.athlete_id = p_athlete and ta.trainer_id = (select auth.uid())
    )
$$;

create function public.can_access_workout(p_workout uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select public.can_access_athlete(w.athlete_id) from public.workouts w where w.id = p_workout),
    false
  )
$$;

create function public.can_access_workout_exercise(p_workout_exercise uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.can_access_athlete(w.athlete_id)
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = p_workout_exercise
    ),
    false
  )
$$;

-- Me, my trainers and my clients: may see each other's names, custom exercises and templates.
create function public.is_linked_user(p_user uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_user = (select auth.uid())
    or exists (
      select 1
      from public.trainer_athletes ta
      join public.athletes a on a.id = ta.athlete_id
      where (ta.trainer_id = (select auth.uid()) and a.user_id = p_user)
         or (ta.trainer_id = p_user and a.user_id = (select auth.uid()))
    )
$$;

-- Column defaults that depend on the caller ------------------------------------------------

alter table public.athletes alter column created_by set default auth.uid();
alter table public.memberships alter column created_by set default auth.uid();
alter table public.workouts alter column created_by set default auth.uid();
alter table public.body_measurements alter column created_by set default auth.uid();
alter table public.assignments alter column assigned_by set default auth.uid();
alter table public.invites alter column trainer_id set default auth.uid();
alter table public.templates alter column owner_id set default auth.uid();
alter table public.programs alter column owner_id set default auth.uid();
alter table public.workout_comments alter column author_id set default auth.uid();

-- Authorship never changes after insert.
create function public.keep_created_by() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

create trigger workouts_keep_created_by before update on public.workouts
  for each row execute function public.keep_created_by();
create trigger memberships_keep_created_by before update on public.memberships
  for each row execute function public.keep_created_by();
create trigger body_measurements_keep_created_by before update on public.body_measurements
  for each row execute function public.keep_created_by();

-- New user → profile + own athlete ---------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := left(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Athlete'
  ), 80);
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, v_name, left(new.raw_user_meta_data ->> 'avatar_url', 500));

  insert into public.athletes (user_id, display_name, created_by)
  values (new.id, v_name, new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the athlete's name in sync with the profile name.
create function public.sync_athlete_display_name() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.display_name <> '' and new.display_name is distinct from old.display_name then
    update public.athletes set display_name = new.display_name where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_athlete_name
  after update of display_name on public.profiles
  for each row execute function public.sync_athlete_display_name();

-- Package charging guard -------------------------------------------------------------------
-- Only the trainer who sold a package may charge a workout to it, move or remove that charge,
-- or reopen a charged workout. Otherwise a client could "refund" sessions themselves.

create function public.guard_workout_membership() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Service role / SQL editor, or a trusted RPC (claim_invite) moving history between athletes.
  if v_uid is null or current_setting('h8.trusted_move', true) = 'on' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.membership_id is not null
    and (
      new.membership_id is distinct from old.membership_id
      or new.athlete_id <> old.athlete_id
      or (old.finished_at is not null and new.finished_at is null)
    )
    and not exists (
      select 1 from public.memberships m where m.id = old.membership_id and m.trainer_id = v_uid
    )
  then
    raise exception 'only the package trainer can change this charge' using errcode = '42501';
  end if;

  if new.membership_id is not null
    and (tg_op = 'INSERT' or new.membership_id is distinct from old.membership_id)
    and not exists (
      select 1 from public.memberships m
      where m.id = new.membership_id
        and m.kind = 'trainer'
        and m.trainer_id = v_uid
        and m.athlete_id = new.athlete_id
    )
  then
    raise exception 'a workout can only be charged to your own package for this athlete' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger workouts_guard_membership
  before insert or update on public.workouts
  for each row execute function public.guard_workout_membership();

-- Trainer RPCs ------------------------------------------------------------------------------

-- Creates a client without an account and links it to the calling trainer.
create function public.create_offline_client(p_display_name text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(p_display_name);
  v_athlete uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_trainer() then
    raise exception 'only trainers can add clients' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'name must be 1-80 characters' using errcode = '22023';
  end if;

  insert into public.athletes (user_id, display_name, created_by)
  values (null, v_name, v_uid)
  returning id into v_athlete;

  insert into public.trainer_athletes (trainer_id, athlete_id) values (v_uid, v_athlete);
  return v_athlete;
end;
$$;

-- Preview for the invite page (the invitee can't read invites directly).
create function public.get_invite(p_code text)
returns table (trainer_name text, trainer_avatar_url text, athlete_name text, status text)
language sql stable security definer
set search_path = ''
as $$
  select
    p.display_name,
    p.avatar_url,
    a.display_name,
    case
      when i.used_at is not null then 'used'
      when i.expires_at < now() then 'expired'
      when i.trainer_id = (select auth.uid()) then 'own'
      else 'valid'
    end
  from public.invites i
  join public.profiles p on p.id = i.trainer_id
  left join public.athletes a on a.id = i.athlete_id
  where i.code = p_code
$$;

-- Accepts an invite: links the caller to the trainer. If the invite is for an offline client,
-- that client's history, packages and settings move to the caller and the offline row is removed.
create function public.claim_invite(p_code text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.invites;
  v_me uuid;
  v_offline uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.invites where code = p_code for update;
  if not found or v_invite.used_at is not null or v_invite.expires_at < now() then
    raise exception 'invite is invalid or expired' using errcode = 'P0002';
  end if;
  if v_invite.trainer_id = v_uid then
    raise exception 'you cannot accept your own invite' using errcode = '22023';
  end if;

  select id into v_me from public.athletes where user_id = v_uid;
  if v_me is null then
    raise exception 'athlete profile missing' using errcode = 'P0002';
  end if;

  v_offline := v_invite.athlete_id;
  if v_offline is not null then
    if exists (select 1 from public.athletes where id = v_offline and user_id is not null) then
      raise exception 'invite is invalid or expired' using errcode = 'P0002';
    end if;

    perform set_config('h8.trusted_move', 'on', true);

    update public.workouts set athlete_id = v_me where athlete_id = v_offline;
    update public.body_measurements set athlete_id = v_me where athlete_id = v_offline;
    update public.memberships set athlete_id = v_me where athlete_id = v_offline;

    insert into public.athlete_exercise_settings (athlete_id, exercise_id, setup_notes, rest_s)
    select v_me, s.exercise_id, s.setup_notes, s.rest_s
    from public.athlete_exercise_settings s
    where s.athlete_id = v_offline
    on conflict (athlete_id, exercise_id) do nothing;

    update public.assignments a set athlete_id = v_me
    where a.athlete_id = v_offline
      and not exists (
        select 1 from public.assignments mine
        where mine.athlete_id = v_me
          and (mine.template_id = a.template_id or mine.program_id = a.program_id)
      );

    insert into public.trainer_athletes (trainer_id, athlete_id)
    select ta.trainer_id, v_me from public.trainer_athletes ta where ta.athlete_id = v_offline
    on conflict do nothing;

    delete from public.athletes where id = v_offline;

    perform set_config('h8.trusted_move', 'off', true);
  end if;

  insert into public.trainer_athletes (trainer_id, athlete_id)
  values (v_invite.trainer_id, v_me)
  on conflict do nothing;

  update public.invites set used_at = now(), used_by = v_uid where code = p_code;
  return v_me;
end;
$$;

-- Read models (run as the caller, so RLS applies) ------------------------------------------

-- Best results per exercise for one athlete. Pass the in-progress workout to exclude it, so
-- the app can tell when a new set beats the previous records. e1RM matches src/lib/oneRepMax.ts.
create function public.exercise_records(p_athlete uuid, p_exclude_workout uuid default null)
returns table (
  exercise_id uuid,
  best_weight_kg numeric,
  best_e1rm_kg numeric,
  best_set_volume_kg numeric,
  best_reps integer,
  workouts_count bigint,
  last_performed_at timestamptz
)
language sql stable
set search_path = ''
as $$
  select
    we.exercise_id,
    max(s.weight_kg),
    round(max(case
      when s.reps = 1 then s.weight_kg
      when s.reps <= 12 then s.weight_kg * (1 + s.reps / 30.0)
    end), 1),
    max(s.weight_kg * s.reps),
    max(s.reps),
    count(distinct w.id),
    max(w.started_at)
  from public.sets s
  join public.workout_exercises we on we.id = s.workout_exercise_id
  join public.workouts w on w.id = we.workout_id
  where w.athlete_id = p_athlete
    and (p_exclude_workout is null or w.id <> p_exclude_workout)
    and s.completed_at is not null
    and not s.is_warmup
    and s.reps > 0
    and s.weight_kg > 0
  group by we.exercise_id
$$;

-- Completed sets from the most recent other workout that included this exercise ("last time").
create function public.last_performance(p_athlete uuid, p_exercise uuid, p_exclude_workout uuid default null)
returns table (
  workout_id uuid,
  performed_at timestamptz,
  "position" integer,
  weight_kg numeric,
  reps integer,
  is_warmup boolean
)
language sql stable
set search_path = ''
as $$
  with last_workout as (
    select w.id, w.started_at
    from public.workouts w
    join public.workout_exercises we on we.workout_id = w.id
    join public.sets s on s.workout_exercise_id = we.id
    where w.athlete_id = p_athlete
      and we.exercise_id = p_exercise
      and (p_exclude_workout is null or w.id <> p_exclude_workout)
      and s.completed_at is not null
    order by w.started_at desc
    limit 1
  )
  select lw.id, lw.started_at, s.position, s.weight_kg, s.reps, s.is_warmup
  from last_workout lw
  join public.workout_exercises we on we.workout_id = lw.id and we.exercise_id = p_exercise
  join public.sets s on s.workout_exercise_id = we.id
  where s.completed_at is not null
  order by we.position, s.position
$$;

-- Sessions used per membership. Status (active / expiring / ...) is computed in the app in the
-- viewer's local time zone: src/lib/membership.ts.
create view public.membership_usage with (security_invoker = true) as
select
  m.*,
  (
    select count(*)::integer
    from public.workouts w
    where w.finished_at is not null
      and (
        (m.kind = 'trainer' and w.membership_id = m.id)
        or (
          m.kind = 'gym'
          and w.athlete_id = m.athlete_id
          and w.started_at >= m.starts_on::timestamptz
          and (m.ends_on is null or w.started_at < (m.ends_on + 1)::timestamptz)
        )
      )
  ) as sessions_used
from public.memberships m;

-- History list rows: counts and volume without loading every set.
create view public.workout_summaries with (security_invoker = true) as
select
  w.id,
  w.athlete_id,
  w.title,
  w.started_at,
  w.finished_at,
  w.template_id,
  w.membership_id,
  w.created_by,
  count(distinct we.id)::integer as exercise_count,
  count(s.id) filter (where s.completed_at is not null and not s.is_warmup)::integer as set_count,
  coalesce(sum(s.weight_kg * s.reps) filter (where s.completed_at is not null and not s.is_warmup), 0) as volume_kg
from public.workouts w
left join public.workout_exercises we on we.workout_id = w.id
left join public.sets s on s.workout_exercise_id = we.id
group by w.id;

-- Trainer dashboard: one row per client with their latest finished workout.
create function public.trainer_clients_overview()
returns table (
  athlete_id uuid,
  display_name text,
  avatar_url text,
  has_account boolean,
  linked_at timestamptz,
  last_workout_id uuid,
  last_workout_title text,
  last_workout_at timestamptz
)
language sql stable
set search_path = ''
as $$
  select
    a.id,
    coalesce(nullif(p.display_name, ''), a.display_name),
    p.avatar_url,
    a.user_id is not null,
    ta.created_at,
    lw.id,
    lw.title,
    lw.started_at
  from public.trainer_athletes ta
  join public.athletes a on a.id = ta.athlete_id
  left join public.profiles p on p.id = a.user_id
  left join lateral (
    select w.id, w.title, w.started_at
    from public.workouts w
    where w.athlete_id = a.id and w.finished_at is not null
    order by w.started_at desc
    limit 1
  ) lw on true
  where ta.trainer_id = (select auth.uid())
  order by lw.started_at desc nulls last, a.display_name
$$;
