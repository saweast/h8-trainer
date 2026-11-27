-- h8-trainer: supersets — two or more exercises done back to back, rest only after the round.
-- Consecutive exercises with the same `superset` number form one (A1, A2…); a number used by a
-- single exercise means nothing. Workouts, templates and plan rows carry it, and every way of
-- creating one from another copies it (src/lib/supersets.ts).

alter table public.workout_exercises add column superset smallint check (superset between 1 and 100);
alter table public.template_exercises add column superset smallint check (superset between 1 and 100);
alter table public.plan_rows add column superset smallint check (superset between 1 and 100);

-- Linking and unlinking during a workout is a plain update.
grant update (superset) on public.workout_exercises to authenticated;

-- Templates -----------------------------------------------------------------------------------

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
    (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_weight_kg, rest_s, notes, sets, superset)
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
    case when jsonb_typeof(i -> 'sets') = 'array' then i -> 'sets' end,
    (i ->> 'superset')::smallint
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  return v_id;
end;
$$;

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
    insert into public.workout_exercises (id, workout_id, exercise_id, position, notes, superset)
    values (v_we, v_workout, te.exercise_id, te.position, te.notes, te.superset);

    if te.sets is not null then
      perform private.insert_spec_sets(v_we, te.sets);
      continue;
    end if;

    -- chain = which working set a row is (drops share the number of the set they continue)
    with lp as (
      select l.ord, l.weight_kg, l.reps, l.is_drop,
             count(*) filter (where not l.is_drop) over (order by l.ord) as chain
      from public.last_performance(p_athlete, te.exercise_id, v_workout)
        with ordinality as l(workout_id, performed_at, position, weight_kg, reps, is_warmup, is_drop, ord)
      where not l.is_warmup
    ),
    prev as (
      select chain as rn, weight_kg, reps from lp where not is_drop
    ),
    last_prev as (
      select weight_kg, reps from prev order by rn desc limit 1
    ),
    planned as (
      select
        g.n::bigint as n,
        0::bigint as k,
        coalesce(p.weight_kg, lp2.weight_kg, te.target_weight_kg, 0) as weight_kg,
        coalesce(p.reps, lp2.reps, te.target_reps_max, te.target_reps_min, 0) as reps,
        false as is_drop
      from generate_series(1, te.target_sets) as g(n)
      left join prev p on p.rn = g.n
      left join last_prev lp2 on true
      union all
      -- last time's drops come back on the same set, at last time's weights
      select d.chain, row_number() over (partition by d.chain order by d.ord), d.weight_kg, d.reps, true
      from lp d
      where d.is_drop and d.chain between 1 and te.target_sets
    )
    insert into public.sets (workout_exercise_id, position, weight_kg, reps, is_drop)
    select v_we, row_number() over (order by n, k), weight_kg, reps, is_drop
    from planned;
  end loop;

  return v_workout;
end;
$$;

-- Plans ---------------------------------------------------------------------------------------

create or replace function public.save_plan(
  p_id uuid,
  p_athlete uuid,
  p_name text,
  p_notes text,
  p_weeks integer,
  p_days jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_new boolean := not exists (select 1 from public.plans where id = v_id);
  v_day_ids uuid[];
  v_row_ids uuid[];
begin
  if jsonb_typeof(p_days) is distinct from 'array' then
    raise exception 'days must be an array' using errcode = '22023';
  end if;

  v_day_ids := array(select (d ->> 'id')::uuid from jsonb_array_elements(p_days) d);
  v_row_ids := array(
    select (r ->> 'id')::uuid
    from jsonb_array_elements(p_days) d, jsonb_array_elements(coalesce(d -> 'rows', '[]'::jsonb)) r
  );
  if exists (select 1 from public.plan_days where id = any(v_day_ids) and plan_id <> v_id)
     or exists (
       select 1 from public.plan_rows r join public.plan_days d on d.id = r.plan_day_id
       where r.id = any(v_row_ids) and d.plan_id <> v_id) then
    raise exception 'day or row belongs to another plan' using errcode = '22023';
  end if;

  if v_new and p_athlete is not null then
    -- a new client plan replaces the client's active one
    update public.plans set archived_at = now()
    where athlete_id = p_athlete and archived_at is null and owner_id = (select auth.uid());
  end if;

  insert into public.plans (id, athlete_id, name, notes, weeks)
  values (v_id, p_athlete, trim(p_name), nullif(trim(coalesce(p_notes, '')), ''), p_weeks)
  on conflict (id) do update set name = excluded.name, notes = excluded.notes, weeks = excluded.weeks;

  insert into public.plan_days (id, plan_id, position, name)
  select (d ->> 'id')::uuid, v_id, (t.ord - 1)::integer, trim(coalesce(d ->> 'name', ''))
  from jsonb_array_elements(p_days) with ordinality as t(d, ord)
  on conflict (id) do update set position = excluded.position, name = excluded.name;

  insert into public.plan_rows (id, plan_day_id, position, exercise_id, rest_s, notes, superset)
  select (r ->> 'id')::uuid, (d ->> 'id')::uuid, (rt.ord - 1)::integer, (r ->> 'exercise_id')::uuid,
         (r ->> 'rest_s')::integer, nullif(trim(coalesce(r ->> 'notes', '')), ''), (r ->> 'superset')::smallint
  from jsonb_array_elements(p_days) d,
       jsonb_array_elements(coalesce(d -> 'rows', '[]'::jsonb)) with ordinality as rt(r, ord)
  on conflict (id) do update set
    plan_day_id = excluded.plan_day_id, position = excluded.position, exercise_id = excluded.exercise_id,
    rest_s = excluded.rest_s, notes = excluded.notes, superset = excluded.superset;

  -- removed rows/days go only after the upserts, so a row moved to another day keeps its id
  delete from public.plan_rows r using public.plan_days d
  where d.id = r.plan_day_id and d.plan_id = v_id and r.id <> all(v_row_ids);
  delete from public.plan_days where plan_id = v_id and id <> all(v_day_ids);

  delete from public.plan_cells c using public.plan_rows r, public.plan_days d
  where r.id = c.plan_row_id and d.id = r.plan_day_id and d.plan_id = v_id;

  insert into public.plan_cells (plan_row_id, week, sets)
  select (r ->> 'id')::uuid, (c ->> 'week')::integer, c -> 'sets'
  from jsonb_array_elements(p_days) d,
       jsonb_array_elements(coalesce(d -> 'rows', '[]'::jsonb)) r,
       jsonb_array_elements(coalesce(r -> 'cells', '[]'::jsonb)) c
  where (c ->> 'week')::integer <= p_weeks;

  return v_id;
end;
$$;

create or replace function public.copy_plan(p_source uuid, p_athlete uuid, p_name text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_src public.plans;
  v_id uuid := gen_random_uuid();
  d record;
  v_day uuid;
  r record;
  v_row uuid;
begin
  select * into v_src from public.plans where id = p_source;
  if v_src.id is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  if p_athlete is not null then
    update public.plans set archived_at = now()
    where athlete_id = p_athlete and archived_at is null and owner_id = (select auth.uid());
  end if;

  insert into public.plans (id, athlete_id, source_plan_id, name, notes, weeks)
  values (v_id, p_athlete, v_src.id, coalesce(nullif(trim(p_name), ''), v_src.name), v_src.notes, v_src.weeks);

  for d in select * from public.plan_days where plan_id = p_source order by position loop
    v_day := gen_random_uuid();
    insert into public.plan_days (id, plan_id, position, name) values (v_day, v_id, d.position, d.name);
    for r in select * from public.plan_rows where plan_day_id = d.id order by position loop
      v_row := gen_random_uuid();
      insert into public.plan_rows (id, plan_day_id, position, exercise_id, rest_s, notes, superset)
      values (v_row, v_day, r.position, r.exercise_id, r.rest_s, r.notes, r.superset);
      insert into public.plan_cells (plan_row_id, week, sets)
      select v_row, c.week, c.sets from public.plan_cells c where c.plan_row_id = r.id;
    end loop;
  end loop;

  return v_id;
end;
$$;

create or replace function public.create_plan_from_templates(p_athlete uuid, p_name text, p_weeks integer, p_template_ids uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_day uuid;
  v_row uuid;
  t record;
  te record;
  v_sets jsonb;
begin
  if p_athlete is not null then
    update public.plans set archived_at = now()
    where athlete_id = p_athlete and archived_at is null and owner_id = (select auth.uid());
  end if;

  insert into public.plans (id, athlete_id, name, weeks) values (v_id, p_athlete, trim(p_name), p_weeks);

  for t in
    select tp.id, tp.name, (u.ord - 1)::integer as position
    from unnest(p_template_ids) with ordinality as u(template_id, ord)
    join public.templates tp on tp.id = u.template_id
    order by u.ord
  loop
    v_day := gen_random_uuid();
    insert into public.plan_days (id, plan_id, position, name) values (v_day, v_id, t.position, left(t.name, 80));
    for te in select * from public.template_exercises where template_id = t.id order by position loop
      v_row := gen_random_uuid();
      insert into public.plan_rows (id, plan_day_id, position, exercise_id, rest_s, notes, superset)
      values (v_row, v_day, te.position, te.exercise_id, te.rest_s, te.notes, te.superset);
      v_sets := coalesce(
        te.sets,
        case when te.target_weight_kg is not null then (
          select jsonb_agg(jsonb_build_object(
            'w', te.target_weight_kg,
            'r', coalesce(te.target_reps_max, te.target_reps_min, 10)))
          from generate_series(1, te.target_sets)
        ) end
      );
      if v_sets is not null then
        insert into public.plan_cells (plan_row_id, week, sets)
        select v_row, w, v_sets from generate_series(1, p_weeks) as w;
      end if;
    end loop;
  end loop;

  return v_id;
end;
$$;

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
    insert into public.workout_exercises (id, workout_id, exercise_id, position, notes, plan_row_id, superset)
    values (v_we, v_workout, r.exercise_id, r.position, r.notes, r.id, r.superset);

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
