-- h8-trainer: drops carry over. Starting a template with uniform targets copies last time's sets
-- by number (as before) and now also the drops that continued them, at last time's weights, so
-- whoever did drops last time finds them ready. A template saved from a workout stays flexible.

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
