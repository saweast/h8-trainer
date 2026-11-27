-- h8-trainer: "to failure" sets. The app stores them as rpe = 10 (the column was there, unused);
-- the admin view now shows it too.

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
                'rpe', s.rpe,
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
