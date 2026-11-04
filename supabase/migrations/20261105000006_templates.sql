-- h8-trainer: templates and programs — atomic saves, starting a workout from a template,
-- "next day" of a program, and template usage. All run as the caller (RLS applies).

-- Creates or replaces a template with its exercises in one transaction.
-- p_items: [{exercise_id, target_sets, target_reps_min, target_reps_max, target_weight_kg, rest_s, notes}]
create function public.save_template(p_id uuid, p_name text, p_notes text, p_items jsonb)
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
    (template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_weight_kg, rest_s, notes)
  select
    v_id,
    (i ->> 'exercise_id')::uuid,
    (t.ord - 1)::integer,
    coalesce((i ->> 'target_sets')::integer, 3),
    (i ->> 'target_reps_min')::integer,
    (i ->> 'target_reps_max')::integer,
    (i ->> 'target_weight_kg')::numeric,
    (i ->> 'rest_s')::integer,
    nullif(trim(coalesce(i ->> 'notes', '')), '')
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  return v_id;
end;
$$;

-- Creates or replaces a program as an ordered list of the caller's templates.
create function public.save_program(p_id uuid, p_name text, p_template_ids uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  insert into public.programs (id, name)
  values (v_id, trim(p_name))
  on conflict (id) do update set name = excluded.name;

  delete from public.program_templates where program_id = v_id;

  insert into public.program_templates (program_id, position, template_id)
  select v_id, (t.ord - 1)::integer, t.template_id
  from unnest(p_template_ids) with ordinality as t(template_id, ord);

  return v_id;
end;
$$;

-- Starts a workout from a template. Every planned set copies the same-numbered working set
-- from the last time this athlete did the exercise (or the last such set), falling back to the
-- template targets — the same rule as src/lib/templatePrefill.ts.
create function public.start_workout_from_template(p_athlete uuid, p_template uuid, p_program uuid default null)
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

  insert into public.workouts (id, athlete_id, title, template_id, program_id)
  values (v_workout, p_athlete, v_name, p_template, p_program);

  for te in
    select * from public.template_exercises where template_id = p_template order by position
  loop
    v_we := gen_random_uuid();
    insert into public.workout_exercises (id, workout_id, exercise_id, position, notes)
    values (v_we, v_workout, te.exercise_id, te.position, te.notes);

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

-- The template that comes after the last finished workout of this program (cycling), or the
-- first one if the program hasn't been used yet.
create function public.next_program_template(p_athlete uuid, p_program uuid)
returns uuid
language sql stable
set search_path = ''
as $$
  with pt as (
    select template_id, (row_number() over (order by position) - 1)::integer as idx, count(*) over () as n
    from public.program_templates
    where program_id = p_program
  ),
  last_done as (
    select w.template_id
    from public.workouts w
    where w.athlete_id = p_athlete and w.program_id = p_program and w.finished_at is not null
    order by w.started_at desc
    limit 1
  ),
  last_idx as (
    select min(pt.idx) as idx from pt join last_done using (template_id)
  )
  select pt.template_id
  from pt
  where pt.idx = coalesce(((select idx from last_idx) + 1) % (select max(n) from pt), 0)
$$;

-- When each template was last used, per athlete.
create view public.template_usage with (security_invoker = true) as
select
  w.template_id,
  w.athlete_id,
  max(w.started_at) as last_used_at,
  count(*)::integer as times_used
from public.workouts w
where w.template_id is not null and w.finished_at is not null
group by w.template_id, w.athlete_id;

revoke execute on function public.save_template(uuid, text, text, jsonb) from anon, public;
revoke execute on function public.save_program(uuid, text, uuid[]) from anon, public;
revoke execute on function public.start_workout_from_template(uuid, uuid, uuid) from anon, public;
revoke execute on function public.next_program_template(uuid, uuid) from anon, public;
grant execute on function public.save_template(uuid, text, text, jsonb) to authenticated;
grant execute on function public.save_program(uuid, text, uuid[]) to authenticated;
grant execute on function public.start_workout_from_template(uuid, uuid, uuid) to authenticated;
grant execute on function public.next_program_template(uuid, uuid) to authenticated;
revoke all on public.template_usage from anon;
grant select on public.template_usage to authenticated;
