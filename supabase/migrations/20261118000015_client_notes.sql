-- h8-trainer: trainer's private notes about a client.
-- Free text ("wants to lose weight, knee hurts after running"), plus two structured kinds the app
-- acts on: what to avoid and what the client prefers, optionally about one exercise or one muscle
-- group. Only the trainer who wrote a note sees it; the client and other trainers never do.

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'avoid', 'prefer')),
  exercise_id uuid references public.exercises (id) on delete cascade,
  muscle_group public.muscle_group,
  body text not null default '' check (char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (exercise_id is null or muscle_group is null),
  -- a plain note is its text; avoid / prefer may be just the exercise or group
  check (char_length(trim(body)) > 0 or (kind <> 'note' and (exercise_id is not null or muscle_group is not null)))
);
create index client_notes_trainer_athlete_idx on public.client_notes (trainer_id, athlete_id, created_at desc);
create index client_notes_athlete_idx on public.client_notes (athlete_id);

create trigger client_notes_updated_at before update on public.client_notes
  for each row execute function private.set_updated_at();

alter table public.client_notes enable row level security;

create policy client_notes_select on public.client_notes for select to authenticated
  using (trainer_id = (select auth.uid()) and private.is_trainer_of(athlete_id));
create policy client_notes_insert on public.client_notes for insert to authenticated
  with check (
    trainer_id = (select auth.uid())
    and private.is_trainer_of(athlete_id)
    -- only an exercise the trainer can see (catalog, own or a linked user's custom one)
    and (exercise_id is null or exists (select 1 from public.exercises e where e.id = exercise_id))
  );
create policy client_notes_update on public.client_notes for update to authenticated
  using (trainer_id = (select auth.uid()) and private.is_trainer_of(athlete_id))
  with check (
    trainer_id = (select auth.uid())
    and private.is_trainer_of(athlete_id)
    and (exercise_id is null or exists (select 1 from public.exercises e where e.id = exercise_id))
  );
create policy client_notes_delete on public.client_notes for delete to authenticated
  using (trainer_id = (select auth.uid()) and private.is_trainer_of(athlete_id));

revoke all on public.client_notes from anon, authenticated;
grant select, insert, delete on public.client_notes to authenticated;
grant update (kind, exercise_id, muscle_group, body) on public.client_notes to authenticated;

-- Unlinking a client removes the trainer's notes about them.
create function private.drop_client_notes() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.client_notes where trainer_id = old.trainer_id and athlete_id = old.athlete_id;
  return old;
end;
$$;
revoke execute on function private.drop_client_notes() from authenticated, anon, public;

create trigger trainer_athletes_drop_notes after delete on public.trainer_athletes
  for each row execute function private.drop_client_notes();

-- Merging keeps the notes: they move with the rest of the history.
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

  insert into public.athlete_exercise_settings (athlete_id, exercise_id, setup_notes, rest_s)
  select p_into, s.exercise_id, s.setup_notes, s.rest_s
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
