-- h8-trainer: let a trainer charge a workout started from a template to a client's package.
-- Same function as before plus p_membership; the workouts guard trigger still checks that the
-- caller is the trainer of that package and that it belongs to this athlete.

drop function public.start_workout_from_template(uuid, uuid, uuid);

create function public.start_workout_from_template(
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

revoke execute on function public.start_workout_from_template(uuid, uuid, uuid, uuid) from anon, public;
grant execute on function public.start_workout_from_template(uuid, uuid, uuid, uuid) to authenticated;
