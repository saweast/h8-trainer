-- h8-trainer: exact planned sets ("20x10, 50x5, 80x8x3") in templates, warm-ups included.
-- `sets` is [{w, r, warmup?, note?}] (see src/lib/setSpec.ts). When present it overrides the
-- uniform target_* fields, and starting a workout copies it as is: the trainer's plan wins over
-- last time. Templates without `sets` behave exactly as before.

-- Shape check shared by template and plan cells. Not security-sensitive; check constraints run it
-- as the caller, so it stays executable by `authenticated` (schema `private` is not in the API).
create function private.valid_spec_sets(p jsonb) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  e jsonb;
  w numeric;
  r numeric;
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
    w := (e ->> 'w')::numeric;
    r := (e ->> 'r')::numeric;
    if w not between 0 and 1000 or r not between 1 and 100 or r <> trunc(r) then
      return false;
    end if;
    if e ? 'warmup' and jsonb_typeof(e -> 'warmup') <> 'boolean' then
      return false;
    end if;
    if e ? 'note' and (jsonb_typeof(e -> 'note') <> 'string' or char_length(e ->> 'note') > 100) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.template_exercises
  add column sets jsonb constraint template_exercises_sets_valid check (sets is null or private.valid_spec_sets(sets));

-- Inserts planned sets into a workout exercise; set notes go to the exercise notes.
create function private.insert_spec_sets(p_workout_exercise uuid, p_sets jsonb) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_notes text;
begin
  insert into public.sets (workout_exercise_id, position, weight_kg, reps, is_warmup)
  select p_workout_exercise, t.ord::integer, (t.e ->> 'w')::numeric, (t.e ->> 'r')::integer,
         coalesce((t.e ->> 'warmup')::boolean, false)
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
revoke execute on function private.insert_spec_sets(uuid, jsonb) from anon, public;
grant execute on function private.insert_spec_sets(uuid, jsonb) to authenticated;

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
    -- with exact sets, target_sets mirrors the working set count so old clients still read sense
    case
      when jsonb_typeof(i -> 'sets') = 'array' then
        least(greatest((select count(*) from jsonb_array_elements(i -> 'sets') s where not coalesce((s ->> 'warmup')::boolean, false)), 1), 20)::integer
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
      where not lp.is_warmup
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
