-- h8-trainer: drop sets — a working set to (near) failure, then straight away a lighter weight to
-- failure again, 2–4 times in a row without rest.
--
-- Every drop is its own row in `sets` with is_drop = true. It continues the nearest set before it
-- (by position) that isn't a drop: "80x10 → 60x8 → 40x6" is one set plus two drops. The chain counts
-- as one set (set counts, templates, plans), its volume counts in full, and records only come from
-- the first set of the chain: drops are done tired and say nothing about strength.
--
-- In planned sets (templates, plan cells) a drop is {w, r, drop: true}; r = 0 means "as many as
-- you can". The notation is "80x10+60+40" or "80x10+60x8+40x6" (src/lib/setSpec.ts).

alter table public.sets
  add column is_drop boolean not null default false,
  add constraint sets_drop_not_warmup check (not (is_drop and is_warmup));

-- Planned sets ------------------------------------------------------------------------------

create or replace function private.valid_spec_sets(p jsonb) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  e jsonb;
  w numeric;
  r numeric;
  v_warmup boolean;
  v_drop boolean;
  v_prev_warmup boolean; -- null before the first set
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 1 and 30 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'w') is distinct from 'number'
       or jsonb_typeof(e -> 'r') is distinct from 'number' then
      return false;
    end if;
    if e ? 'warmup' and jsonb_typeof(e -> 'warmup') <> 'boolean' then
      return false;
    end if;
    if e ? 'drop' and jsonb_typeof(e -> 'drop') <> 'boolean' then
      return false;
    end if;
    v_warmup := coalesce((e ->> 'warmup')::boolean, false);
    v_drop := coalesce((e ->> 'drop')::boolean, false);
    -- a drop follows a working set (or another drop) and is never a warm-up
    if v_drop and (v_warmup or v_prev_warmup is distinct from false) then
      return false;
    end if;
    w := (e ->> 'w')::numeric;
    r := (e ->> 'r')::numeric;
    if w not between 0 and 1000 or r <> trunc(r) or r > 100 or r < (case when v_drop then 0 else 1 end) then
      return false;
    end if;
    if e ? 'note' and (jsonb_typeof(e -> 'note') <> 'string' or char_length(e ->> 'note') > 100) then
      return false;
    end if;
    v_prev_warmup := v_warmup;
  end loop;
  return true;
end;
$$;

create or replace function private.insert_spec_sets(p_workout_exercise uuid, p_sets jsonb) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_notes text;
begin
  insert into public.sets (workout_exercise_id, position, weight_kg, reps, is_warmup, is_drop)
  select p_workout_exercise, t.ord::integer, (t.e ->> 'w')::numeric, (t.e ->> 'r')::integer,
         coalesce((t.e ->> 'warmup')::boolean, false), coalesce((t.e ->> 'drop')::boolean, false)
  from jsonb_array_elements(p_sets) with ordinality as t(e, ord);

  select string_agg(distinct t.e ->> 'note', '; ') into v_notes
  from jsonb_array_elements(p_sets) as t(e)
  where t.e ? 'note';

  if v_notes is not null then
    update public.workout_exercises
    set notes = left(concat_ws(' · ', nullif(notes, ''), v_notes), 300)
    where id = p_workout_exercise;
  end if;
end;
$$;

-- target_sets mirrors the working set count: a drop chain is one set.
create or replace function public.save_template(p_id uuid, p_name text, p_notes text, p_items jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  insert into public.templates (id, name, notes)
  values (v_id, trim(p_name), nullif(trim(coalesce(p_notes, '')), ''))
  on conflict (id) do update set name = excluded.name, notes = excluded.notes;

  delete from public.template_exercises where template_id = v_id;

  insert into public.template_exercises
    (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_weight_kg, rest_s, notes, sets)
  select
    v_id,
    (i ->> 'exercise_id')::uuid,
    (t.ord - 1)::integer,
    case
      when jsonb_typeof(i -> 'sets') = 'array' then
        least(greatest((
          select count(*) from jsonb_array_elements(i -> 'sets') s
          where not coalesce((s ->> 'warmup')::boolean, false) and not coalesce((s ->> 'drop')::boolean, false)
        ), 1), 20)::integer
      else coalesce((i ->> 'target_sets')::integer, 3)
    end,
    (i ->> 'target_reps_min')::integer,
    (i ->> 'target_reps_max')::integer,
    (i ->> 'target_weight_kg')::numeric,
    (i ->> 'rest_s')::integer,
    nullif(trim(coalesce(i ->> 'notes', '')), ''),
    case when jsonb_typeof(i -> 'sets') = 'array' then i -> 'sets' end
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  return v_id;
end;
$$;

-- Read models -------------------------------------------------------------------------------

-- "Last time" now tells drops apart, so the app can pair them with this time's drops.
drop function public.last_performance(uuid, uuid, uuid);
create function public.last_performance(p_athlete uuid, p_exercise uuid, p_exclude_workout uuid default null)
returns table (
  workout_id uuid,
  performed_at timestamptz,
  "position" integer,
  weight_kg numeric,
  reps integer,
  is_warmup boolean,
  is_drop boolean
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
  select lw.id, lw.started_at, s.position, s.weight_kg, s.reps, s.is_warmup, s.is_drop
  from last_workout lw
  join public.workout_exercises we on we.workout_id = lw.id and we.exercise_id = p_exercise
  join public.sets s on s.workout_exercise_id = we.id
  where s.completed_at is not null
  order by we.position, s.position
$$;
revoke execute on function public.last_performance(uuid, uuid, uuid) from anon, public;
grant execute on function public.last_performance(uuid, uuid, uuid) to authenticated;

-- Records come from the first set of a chain only. e1RM matches src/lib/oneRepMax.ts.
create or replace function public.exercise_records(p_athlete uuid, p_exclude_workout uuid default null)
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
    and not s.is_drop
    and s.reps > 0
    and s.weight_kg > 0
  group by we.exercise_id
$$;

-- A drop chain is one set; its volume counts in full.
create or replace view public.workout_summaries with (security_invoker = true) as
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
  count(s.id) filter (where s.completed_at is not null and not s.is_warmup and not s.is_drop)::integer as set_count,
  coalesce(sum(s.weight_kg * s.reps) filter (where s.completed_at is not null and not s.is_warmup), 0) as volume_kg
from public.workouts w
left join public.workout_exercises we on we.workout_id = w.id
left join public.sets s on s.workout_exercise_id = we.id
group by w.id;

-- Starting ----------------------------------------------------------------------------------

-- Uniform targets copy last time's working sets one by one; drops aren't sets of their own, so
-- they don't shift the numbering (they are added in the workout, with last time's weights).
create or replace function public.start_workout_from_template(
  p_athlete uuid,
  p_template uuid,
  p_program uuid default null,
  p_membership uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_workout uuid := gen_random_uuid();
  v_name text;
  v_we uuid;
  te record;
begin
  select name into v_name from public.templates where id = p_template;
  if v_name is null then
    raise exception 'template not found' using errcode = 'P0002';
  end if;

  insert into public.workouts (id, athlete_id, title, template_id, program_id, membership_id)
  values (v_workout, p_athlete, v_name, p_template, p_program, p_membership);

  for te in
    select * from public.template_exercises where template_id = p_template order by position
  loop
    v_we := gen_random_uuid();
    insert into public.workout_exercises (id, workout_id, exercise_id, position, notes)
    values (v_we, v_workout, te.exercise_id, te.position, te.notes);

    if te.sets is not null then
      perform private.insert_spec_sets(v_we, te.sets);
      continue;
    end if;

    with prev as (
      select row_number() over (order by lp.position) as rn, lp.weight_kg, lp.reps
      from public.last_performance(p_athlete, te.exercise_id, v_workout) lp
      where not lp.is_warmup and not lp.is_drop
    ),
    last_prev as (
      select weight_kg, reps from prev order by rn desc limit 1
    )
    insert into public.sets (workout_exercise_id, position, weight_kg, reps)
    select
      v_we,
      g.n,
      coalesce(p.weight_kg, lp2.weight_kg, te.target_weight_kg, 0),
      coalesce(p.reps, lp2.reps, te.target_reps_max, te.target_reps_min, 0)
    from generate_series(1, te.target_sets) as g(n)
    left join prev p on p.rn = g.n
    left join last_prev lp2 on true;
  end loop;

  return v_workout;
end;
$$;

-- A row without a cell repeats last time as it was, drops included.
create or replace function public.start_workout_from_plan(
  p_plan uuid,
  p_week integer,
  p_day uuid,
  p_membership uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_day public.plan_days;
  v_workout uuid := gen_random_uuid();
  v_we uuid;
  r record;
  v_sets jsonb;
begin
  select * into v_plan from public.plans where id = p_plan;
  if v_plan.id is null or v_plan.athlete_id is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  select * into v_day from public.plan_days where id = p_day and plan_id = p_plan;
  if v_day.id is null then
    raise exception 'day not found' using errcode = 'P0002';
  end if;
  if p_week not between 1 and v_plan.weeks then
    raise exception 'week out of range' using errcode = '22023';
  end if;

  insert into public.workouts (id, athlete_id, title, plan_id, plan_day_id, plan_week, membership_id)
  values (v_workout, v_plan.athlete_id, left(coalesce(nullif(v_day.name, ''), v_plan.name), 80),
          p_plan, p_day, p_week, p_membership);

  for r in select * from public.plan_rows where plan_day_id = p_day order by position loop
    v_we := gen_random_uuid();
    insert into public.workout_exercises (id, workout_id, exercise_id, position, notes, plan_row_id)
    values (v_we, v_workout, r.exercise_id, r.position, r.notes, r.id);

    select c.sets into v_sets from public.plan_cells c where c.plan_row_id = r.id and c.week = p_week;
    if v_sets is not null then
      perform private.insert_spec_sets(v_we, v_sets);
    else
      insert into public.sets (workout_exercise_id, position, weight_kg, reps, is_warmup, is_drop)
      select v_we, lp.position, lp.weight_kg, lp.reps, lp.is_warmup, lp.is_drop
      from public.last_performance(v_plan.athlete_id, r.exercise_id, v_workout) lp;
    end if;
  end loop;

  return v_workout;
end;
$$;

-- Logging -----------------------------------------------------------------------------------

-- Adds a drop right after `p_after` (the last set of its chain), moving the sets below it down
-- by one, in one go. Runs as the caller, so RLS decides. Repeating a call (a retry after a lost
-- response) changes nothing.
create function public.add_drop_set(p_id uuid, p_after uuid, p_weight_kg numeric, p_reps integer default 0)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_after public.sets;
begin
  if exists (select 1 from public.sets where id = p_id) then
    return;
  end if;
  select * into v_after from public.sets where id = p_after;
  if v_after.id is null then
    raise exception 'set not found' using errcode = 'P0002';
  end if;
  if v_after.is_warmup then
    raise exception 'a drop follows a working set' using errcode = '22023';
  end if;

  update public.sets
  set position = position + 1
  where workout_exercise_id = v_after.workout_exercise_id and position > v_after.position;

  insert into public.sets (id, workout_exercise_id, position, weight_kg, reps, is_drop)
  values (p_id, v_after.workout_exercise_id, v_after.position + 1, p_weight_kg, p_reps, true);
end;
$$;
revoke execute on function public.add_drop_set(uuid, uuid, numeric, integer) from anon, public;
grant execute on function public.add_drop_set(uuid, uuid, numeric, integer) to authenticated;

-- Admin -------------------------------------------------------------------------------------

create or replace function public.admin_workout(p_workout uuid) returns jsonb
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
                'is_drop', s.is_drop,
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
