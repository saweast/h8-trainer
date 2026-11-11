-- h8-trainer: finishing workouts safely when a trainer and a client have the same session open.
-- * finish_workout(): the server decides which sets were done. Before, the browser deleted the
--   sets *it* thought were pending, so a client with a stale screen tapping "Finish" erased the
--   sets their trainer had just logged.
-- * An in-progress workout can only be discarded by whoever started it, so a client can't delete
--   the session their trainer is recording.
-- * last_activity_at + auto-finish: a workout left open for 30 minutes without any change is
--   finished automatically (pg_cron every 5 minutes where available, and on the next app visit).

-- Activity ----------------------------------------------------------------------------------

alter table public.workouts add column last_activity_at timestamptz not null default now();

update public.workouts w
set last_activity_at = greatest(
  w.started_at,
  w.updated_at,
  coalesce(w.finished_at, w.started_at),
  coalesce(
    (select max(s.completed_at)
     from public.workout_exercises we
     join public.sets s on s.workout_exercise_id = we.id
     where we.workout_id = w.id),
    w.started_at
  )
);

create index workouts_unfinished_activity_idx on public.workouts (last_activity_at) where finished_at is null;

create function private.touch_workout(p_workout uuid) returns void
language sql security definer
set search_path = ''
as $$
  update public.workouts
  set last_activity_at = now()
  where id = p_workout and finished_at is null and last_activity_at < now()
$$;

create function private.touch_workout_from_exercise() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.touch_workout(new.workout_id);
  return null;
end;
$$;

create function private.touch_workout_from_set() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.touch_workout((select we.workout_id from public.workout_exercises we where we.id = new.workout_exercise_id));
  return null;
end;
$$;

-- Inserts and edits only: deletes happen while finishing, and during cascades from the workout.
create trigger workout_exercises_touch_workout
  after insert or update on public.workout_exercises
  for each row execute function private.touch_workout_from_exercise();
create trigger sets_touch_workout
  after insert or update on public.sets
  for each row execute function private.touch_workout_from_set();

revoke execute on function private.touch_workout(uuid) from authenticated, anon, public;
revoke execute on function private.touch_workout_from_exercise() from authenticated, anon, public;
revoke execute on function private.touch_workout_from_set() from authenticated, anon, public;

-- Finishing ---------------------------------------------------------------------------------

-- Drops planned-but-not-done sets and exercises left empty, then stamps finished_at.
create function private.close_workout(p_workout uuid, p_title text, p_finished_at timestamptz) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.sets s
  using public.workout_exercises we
  where we.id = s.workout_exercise_id and we.workout_id = p_workout and s.completed_at is null;

  delete from public.workout_exercises we
  where we.workout_id = p_workout
    and not exists (select 1 from public.sets s where s.workout_exercise_id = we.id);

  update public.workouts
  set finished_at = greatest(started_at, p_finished_at),
      title = left(coalesce(nullif(trim(p_title), ''), title), 80)
  where id = p_workout and finished_at is null;
end;
$$;
revoke execute on function private.close_workout(uuid, text, timestamptz) from authenticated, anon, public;

create function public.finish_workout(p_workout uuid, p_title text default null)
returns table (finished_at timestamptz, completed_sets integer)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_workout public.workouts;
  v_done integer;
begin
  select * into v_workout from public.workouts w where w.id = p_workout for update;
  if not found or not private.can_access_athlete(v_workout.athlete_id) then
    raise exception 'workout not found' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_done
  from public.workout_exercises we
  join public.sets s on s.workout_exercise_id = we.id
  where we.workout_id = p_workout and s.completed_at is not null;

  -- Already finished (by the other device, or automatically): nothing to drop, report as is.
  if v_workout.finished_at is not null then
    return query select v_workout.finished_at, v_done;
    return;
  end if;

  if v_done = 0 then
    raise exception 'no completed sets to save' using errcode = '22023';
  end if;

  perform private.close_workout(p_workout, p_title, now());
  return query select w.finished_at, v_done from public.workouts w where w.id = p_workout;
end;
$$;

-- Auto-finish -------------------------------------------------------------------------------

-- Workouts idle for p_idle: finished as of their last activity. One with nothing done is
-- deleted, unless it is charged to a package (the charge stays; the trainer decides).
create function private.auto_finish_workouts(p_athlete uuid default null, p_idle interval default interval '30 minutes')
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select w.id, w.membership_id, w.last_activity_at,
      exists (
        select 1 from public.workout_exercises we
        join public.sets s on s.workout_exercise_id = we.id
        where we.workout_id = w.id and s.completed_at is not null
      ) as has_done
    from public.workouts w
    where w.finished_at is null
      and w.last_activity_at < now() - p_idle
      and (p_athlete is null or w.athlete_id = p_athlete)
    for update skip locked
  loop
    if not r.has_done and r.membership_id is null then
      delete from public.workouts where id = r.id;
    else
      perform private.close_workout(r.id, null, r.last_activity_at);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.auto_finish_workouts(uuid, interval) from authenticated, anon, public;

-- Called by the app before it shows "workout in progress", so an abandoned session is closed
-- even where pg_cron isn't running.
create function public.close_stale_workouts(p_athlete uuid) returns integer
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.can_access_athlete(p_athlete) then
    raise exception 'athlete not found' using errcode = 'P0002';
  end if;
  return private.auto_finish_workouts(p_athlete);
end;
$$;

revoke execute on function public.finish_workout(uuid, text) from anon, public;
revoke execute on function public.close_stale_workouts(uuid) from anon, public;
grant execute on function public.finish_workout(uuid, text) to authenticated;
grant execute on function public.close_stale_workouts(uuid) to authenticated;

-- Background sweep where pg_cron exists (Supabase); the PGlite test database has no pg_cron.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('h8-auto-finish-workouts', '*/5 * * * *', 'select private.auto_finish_workouts()');
  end if;
exception when others then
  raise notice 'pg_cron unavailable (%); idle workouts close on the next app visit', sqlerrm;
end;
$$;

-- Discarding --------------------------------------------------------------------------------
-- An in-progress workout belongs to whoever is recording it. Finished ones keep the old rule.

drop policy workouts_delete on public.workouts;
create policy workouts_delete on public.workouts for delete to authenticated
  using (
    private.can_access_athlete(athlete_id)
    and (finished_at is not null or created_by is null or created_by = (select auth.uid()))
    and (
      membership_id is null
      or exists (select 1 from public.memberships m where m.id = membership_id and m.trainer_id = (select auth.uid()))
    )
  );
