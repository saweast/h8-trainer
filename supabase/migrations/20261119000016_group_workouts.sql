-- h8-trainer: split sessions — one trainer training several clients at the same time.
-- Every client still gets a workout of their own (their history, records, package charge, what
-- they see in the app); the workouts of one session share a group_id. Grouping never grants
-- access: each workout keeps its own athlete and RLS, so a client only ever sees their own.

alter table public.workouts add column group_id uuid;
create index workouts_group_idx on public.workouts (group_id) where group_id is not null;

-- A workout joins a session when it is started (start_group_workout) and never moves.
create function private.keep_group_id() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('h8.group_start', true) is distinct from 'on' then
    new.group_id := old.group_id;
  end if;
  return new;
end;
$$;
revoke execute on function private.keep_group_id() from authenticated, anon, public;

create trigger workouts_keep_group_id before update on public.workouts
  for each row execute function private.keep_group_id();

-- Activity: while the trainer works with one client, the whole session stays open, so another
-- client's workout isn't auto-finished in the middle of it.
create or replace function private.touch_workout(p_workout uuid) returns void
language sql security definer
set search_path = ''
as $$
  update public.workouts w
  set last_activity_at = now()
  from public.workouts src
  where src.id = p_workout
    and w.finished_at is null
    and w.last_activity_at < now()
    and (
      w.id = src.id
      or (src.group_id is not null and w.group_id = src.group_id and w.created_by is not distinct from src.created_by)
    )
$$;
revoke execute on function private.touch_workout(uuid) from authenticated, anon, public;

-- Starting ----------------------------------------------------------------------------------

-- One workout per client, empty or from the trainer's template (each prefilled from that
-- client's own last time). p_memberships follows p_athletes: the package to charge, or null.
create function public.start_group_workout(
  p_athletes uuid[],
  p_memberships uuid[] default null,
  p_template uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_group uuid := gen_random_uuid();
  v_count integer := coalesce(array_length(p_athletes, 1), 0);
  v_workout uuid;
  i integer;
begin
  if v_count < 2 or v_count > 10 then
    raise exception 'a split session is for 2 to 10 clients' using errcode = '22023';
  end if;
  if (select count(distinct a) from unnest(p_athletes) a) <> v_count then
    raise exception 'each client can be in the session once' using errcode = '22023';
  end if;
  if p_memberships is not null and coalesce(array_length(p_memberships, 1), 0) <> v_count then
    raise exception 'one package (or null) per client' using errcode = '22023';
  end if;

  for i in 1 .. v_count loop
    if not private.is_trainer_of(p_athletes[i]) then
      raise exception 'not your client' using errcode = '42501';
    end if;
    -- A session abandoned earlier doesn't block a new one; one still going does.
    perform public.close_stale_workouts(p_athletes[i]);
    if exists (select 1 from public.workouts w where w.athlete_id = p_athletes[i] and w.finished_at is null) then
      raise exception 'client already has a workout in progress' using errcode = '55000';
    end if;

    if p_template is null then
      insert into public.workouts (athlete_id, membership_id)
      values (p_athletes[i], p_memberships[i])
      returning id into v_workout;
    else
      v_workout := public.start_workout_from_template(p_athletes[i], p_template, null, p_memberships[i]);
    end if;

    perform set_config('h8.group_start', 'on', true);
    update public.workouts set group_id = v_group where id = v_workout;
    perform set_config('h8.group_start', 'off', true);
  end loop;

  return v_group;
end;
$$;

-- Finishing ---------------------------------------------------------------------------------

-- Saves every client's done sets. A client with nothing done isn't saved (and not charged): they
-- didn't train. Only whoever started the session finishes it; titles are per workout id.
create function public.finish_group_workout(p_group uuid, p_titles jsonb default '{}'::jsonb)
returns table (workout_id uuid, athlete_id uuid, completed_sets integer)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r record;
  v_found integer;
  v_open integer;
  v_done integer;
begin
  perform 1 from public.workouts w
  where w.group_id = p_group and w.created_by = (select auth.uid()) and private.can_access_athlete(w.athlete_id)
  for update;
  get diagnostics v_found = row_count;
  if v_found = 0 then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  select count(*)::integer, coalesce(sum(d.done), 0)::integer into v_open, v_done
  from public.workouts w
  cross join lateral (
    select count(*)::integer as done from public.workout_exercises we
    join public.sets s on s.workout_exercise_id = we.id
    where we.workout_id = w.id and s.completed_at is not null
  ) d
  where w.group_id = p_group and w.created_by = (select auth.uid()) and w.finished_at is null;
  if v_open > 0 and v_done = 0 then
    raise exception 'no completed sets to save' using errcode = '22023';
  end if;

  for r in
    select w.id, w.athlete_id, w.finished_at, d.done
    from public.workouts w
    cross join lateral (
      select count(*)::integer as done from public.workout_exercises we
      join public.sets s on s.workout_exercise_id = we.id
      where we.workout_id = w.id and s.completed_at is not null
    ) d
    where w.group_id = p_group and w.created_by = (select auth.uid()) and private.can_access_athlete(w.athlete_id)
    order by d.done desc
  loop
    if r.finished_at is null then
      if r.done > 0 then
        perform private.close_workout(r.id, p_titles ->> r.id::text, now());
      else
        delete from public.workouts where id = r.id;
      end if;
    end if;
    workout_id := r.id;
    athlete_id := r.athlete_id;
    completed_sets := r.done;
    return next;
  end loop;
end;
$$;

revoke execute on function public.start_group_workout(uuid[], uuid[], uuid) from anon, public;
revoke execute on function public.finish_group_workout(uuid, jsonb) from anon, public;
grant execute on function public.start_group_workout(uuid[], uuid[], uuid) to authenticated;
grant execute on function public.finish_group_workout(uuid, jsonb) to authenticated;
