-- h8-trainer: hardening after `supabase db advisors`
-- 1. RLS helpers and trigger functions move to a `private` schema that the Data API does not
--    expose, so they are no longer callable as /rest/v1/rpc/*. Policies and triggers reference
--    functions by OID and keep working; only function bodies that call other helpers by name
--    need to be redefined.
-- 2. Template/program child tables get one policy per command instead of an overlapping FOR ALL.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- RLS helpers (still executable by `authenticated`, which policies need, but not via the API)
alter function public.my_athlete_id() set schema private;
alter function public.is_trainer() set schema private;
alter function public.is_trainer_of(uuid) set schema private;
alter function public.can_access_athlete(uuid) set schema private;
alter function public.can_access_workout(uuid) set schema private;
alter function public.can_access_workout_exercise(uuid) set schema private;
alter function public.is_linked_user(uuid) set schema private;

create or replace function private.can_access_workout(p_workout uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select private.can_access_athlete(w.athlete_id) from public.workouts w where w.id = p_workout),
    false
  )
$$;

create or replace function private.can_access_workout_exercise(p_workout_exercise uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (
      select private.can_access_athlete(w.athlete_id)
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = p_workout_exercise
    ),
    false
  )
$$;

-- Public RPC that used a moved helper by name
create or replace function public.create_offline_client(p_display_name text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(p_display_name);
  v_athlete uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not private.is_trainer() then
    raise exception 'only trainers can add clients' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'name must be 1-80 characters' using errcode = '22023';
  end if;

  insert into public.athletes (user_id, display_name, created_by)
  values (null, v_name, v_uid)
  returning id into v_athlete;

  insert into public.trainer_athletes (trainer_id, athlete_id) values (v_uid, v_athlete);
  return v_athlete;
end;
$$;

-- Trigger functions: nobody calls these directly
alter function public.set_updated_at() set schema private;
alter function public.keep_created_by() set schema private;
alter function public.handle_new_user() set schema private;
alter function public.sync_athlete_display_name() set schema private;
alter function public.guard_workout_membership() set schema private;
revoke execute on function private.set_updated_at() from authenticated, anon, public;
revoke execute on function private.keep_created_by() from authenticated, anon, public;
revoke execute on function private.handle_new_user() from authenticated, anon, public;
revoke execute on function private.sync_athlete_display_name() from authenticated, anon, public;
revoke execute on function private.guard_workout_membership() from authenticated, anon, public;

-- One policy per command on template/program children
drop policy template_exercises_write on public.template_exercises;
create policy template_exercises_insert on public.template_exercises for insert to authenticated
  with check (exists (select 1 from public.templates t where t.id = template_id and t.owner_id = (select auth.uid())));
create policy template_exercises_update on public.template_exercises for update to authenticated
  using (exists (select 1 from public.templates t where t.id = template_id and t.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.templates t where t.id = template_id and t.owner_id = (select auth.uid())));
create policy template_exercises_delete on public.template_exercises for delete to authenticated
  using (exists (select 1 from public.templates t where t.id = template_id and t.owner_id = (select auth.uid())));

drop policy program_templates_write on public.program_templates;
create policy program_templates_insert on public.program_templates for insert to authenticated
  with check (
    exists (select 1 from public.programs p where p.id = program_id and p.owner_id = (select auth.uid()))
    and exists (select 1 from public.templates t where t.id = template_id and t.owner_id = (select auth.uid()))
  );
create policy program_templates_update on public.program_templates for update to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and p.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from public.programs p where p.id = program_id and p.owner_id = (select auth.uid()))
    and exists (select 1 from public.templates t where t.id = template_id and t.owner_id = (select auth.uid()))
  );
create policy program_templates_delete on public.program_templates for delete to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and p.owner_id = (select auth.uid())));
