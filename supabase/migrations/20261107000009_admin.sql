-- h8-trainer: administrator role and admin-controlled trainer permission.
-- * `is_admin` is granted only from the SQL editor / service role (see README).
-- * Becoming a trainer needs `can_be_trainer`, which only an admin can change. A user with the
--   permission still switches "I'm a trainer" themself.
-- * Revoking the permission also cuts access to that trainer's clients (links are kept, so
--   granting it again restores them).
-- * Admins read users, trainers' clients and workouts through the read-only RPCs below; there
--   are no admin RLS policies, so the admin's own app (exercise picker etc.) is unchanged.

alter table public.profiles
  add column is_admin boolean not null default false,
  add column can_be_trainer boolean not null default false;

-- Existing trainers keep their role.
update public.profiles set can_be_trainer = true where is_trainer;

alter table public.profiles
  add constraint profiles_trainer_allowed check (not is_trainer or can_be_trainer);

-- The new columns stay out of the column-level UPDATE grant on purpose: clients can't edit them.

-- Helpers -----------------------------------------------------------------------------------

create function private.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false)
$$;
revoke execute on function private.is_admin() from anon, public;
grant execute on function private.is_admin() to authenticated;

create or replace function private.is_trainer() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_trainer and p.can_be_trainer from public.profiles p where p.id = (select auth.uid())),
    false
  )
$$;

-- Trainer access requires the admin's permission (own "trainer mode" switch doesn't matter).
create or replace function private.is_trainer_of(p_athlete uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trainer_athletes ta
    join public.profiles p on p.id = ta.trainer_id
    where ta.athlete_id = p_athlete
      and ta.trainer_id = (select auth.uid())
      and p.can_be_trainer
  )
$$;

create or replace function private.can_access_athlete(p_athlete uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.athletes a
      where a.id = p_athlete and a.user_id = (select auth.uid())
    )
    or private.is_trainer_of(p_athlete)
$$;

-- Admin RPCs --------------------------------------------------------------------------------

create function public.admin_users()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  is_admin boolean,
  can_be_trainer boolean,
  is_trainer boolean,
  created_at timestamptz,
  clients_count integer
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.is_admin,
    p.can_be_trainer,
    p.is_trainer,
    p.created_at,
    (select count(*)::integer from public.trainer_athletes ta where ta.trainer_id = p.id)
  from public.profiles p
  order by lower(p.display_name), p.created_at;
end;
$$;

create function public.admin_set_can_be_trainer(p_user uuid, p_allowed boolean) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  update public.profiles
  set can_be_trainer = p_allowed,
      is_trainer = is_trainer and p_allowed
  where id = p_user;

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Clients of one trainer: offline ones (created by the trainer) and ones with an account
-- (joined through an invite).
create function public.admin_trainer_clients(p_trainer uuid)
returns table (
  athlete_id uuid,
  display_name text,
  avatar_url text,
  has_account boolean,
  linked_at timestamptz,
  workouts_count integer,
  last_workout_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    coalesce(nullif(p.display_name, ''), a.display_name),
    p.avatar_url,
    a.user_id is not null,
    ta.created_at,
    (select count(*)::integer from public.workouts w where w.athlete_id = a.id and w.finished_at is not null),
    (select max(w.started_at) from public.workouts w where w.athlete_id = a.id and w.finished_at is not null)
  from public.trainer_athletes ta
  join public.athletes a on a.id = ta.athlete_id
  left join public.profiles p on p.id = a.user_id
  where ta.trainer_id = p_trainer
  order by 7 desc nulls last, 2;
end;
$$;

create function public.admin_athlete_workouts(p_athlete uuid, p_limit integer default 50)
returns table (
  id uuid,
  title text,
  started_at timestamptz,
  finished_at timestamptz,
  membership_id uuid,
  exercise_count integer,
  set_count integer,
  volume_kg numeric
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return query
  select s.id, s.title, s.started_at, s.finished_at, s.membership_id, s.exercise_count, s.set_count, s.volume_kg
  from public.workout_summaries s
  where s.athlete_id = p_athlete and s.finished_at is not null
  order by s.started_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- One workout with exercises and sets, read-only. Null when it doesn't exist.
create function public.admin_workout(p_workout uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', w.id,
    'athlete_id', w.athlete_id,
    'athlete_name', a.display_name,
    'title', w.title,
    'started_at', w.started_at,
    'finished_at', w.finished_at,
    'notes', w.notes,
    'membership_id', w.membership_id,
    'exercises', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', we.id,
          'slug', e.slug,
          'name', e.name,
          'position', we.position,
          'notes', we.notes,
          'sets', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'position', s.position,
                'weight_kg', s.weight_kg,
                'reps', s.reps,
                'is_warmup', s.is_warmup,
                'completed', s.completed_at is not null
              )
              order by s.position
            )
            from public.sets s
            where s.workout_exercise_id = we.id
          ), '[]'::jsonb)
        )
        order by we.position
      )
      from public.workout_exercises we
      join public.exercises e on e.id = we.exercise_id
      where we.workout_id = w.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.workouts w
  join public.athletes a on a.id = w.athlete_id
  where w.id = p_workout;

  return v_result;
end;
$$;

revoke execute on function public.admin_users() from anon, public;
revoke execute on function public.admin_set_can_be_trainer(uuid, boolean) from anon, public;
revoke execute on function public.admin_trainer_clients(uuid) from anon, public;
revoke execute on function public.admin_athlete_workouts(uuid, integer) from anon, public;
revoke execute on function public.admin_workout(uuid) from anon, public;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_set_can_be_trainer(uuid, boolean) to authenticated;
grant execute on function public.admin_trainer_clients(uuid) to authenticated;
grant execute on function public.admin_athlete_workouts(uuid, integer) to authenticated;
grant execute on function public.admin_workout(uuid) to authenticated;
