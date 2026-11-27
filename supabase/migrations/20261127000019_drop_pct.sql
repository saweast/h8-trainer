-- h8-trainer: how much lighter a drop is, per person and exercise ("−25% on this machine"), next
-- to the machine setup and rest. Null = the app default (20%).

alter table public.athlete_exercise_settings
  add column drop_pct smallint check (drop_pct between 5 and 50);

-- Merging clients keeps the setting with the rest of the machine setup.
create or replace function private.merge_athlete(p_from uuid, p_into uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_from = p_into then
    raise exception 'cannot merge a client into itself' using errcode = '22023';
  end if;

  -- lets the workouts guard accept charged workouts changing athlete (packages move with them)
  perform set_config('h8.trusted_move', 'on', true);

  update public.workouts set athlete_id = p_into where athlete_id = p_from;
  update public.body_measurements set athlete_id = p_into where athlete_id = p_from;
  update public.memberships set athlete_id = p_into where athlete_id = p_from;
  update public.client_notes set athlete_id = p_into where athlete_id = p_from;

  insert into public.athlete_exercise_settings (athlete_id, exercise_id, setup_notes, rest_s, drop_pct)
  select p_into, s.exercise_id, s.setup_notes, s.rest_s, s.drop_pct
  from public.athlete_exercise_settings s
  where s.athlete_id = p_from
  on conflict (athlete_id, exercise_id) do nothing;

  update public.assignments a set athlete_id = p_into
  where a.athlete_id = p_from
    and not exists (
      select 1 from public.assignments mine
      where mine.athlete_id = p_into
        and (mine.template_id = a.template_id or mine.program_id = a.program_id)
    );

  -- One active plan per athlete: when both have one, the target keeps theirs and the moved one
  -- is archived (still there with its history, just not current).
  update public.plans set archived_at = now()
  where athlete_id = p_from
    and archived_at is null
    and exists (select 1 from public.plans p where p.athlete_id = p_into and p.archived_at is null);
  update public.plans set athlete_id = p_into where athlete_id = p_from;

  insert into public.trainer_athletes (trainer_id, athlete_id)
  select ta.trainer_id, p_into from public.trainer_athletes ta where ta.athlete_id = p_from
  on conflict do nothing;

  -- Open invites for the old row would otherwise turn into plain invites (athlete_id → null).
  delete from public.invites where athlete_id = p_from and used_at is null;

  delete from public.athletes where id = p_from;

  perform set_config('h8.trusted_move', 'off', true);
end;
$$;
revoke execute on function private.merge_athlete(uuid, uuid) from authenticated, anon, public;
