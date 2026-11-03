-- h8-trainer: row level security
-- The browser talks to Postgres directly (publishable key), so these policies ARE the backend.

alter table public.profiles enable row level security;
alter table public.athletes enable row level security;
alter table public.trainer_athletes enable row level security;
alter table public.invites enable row level security;
alter table public.exercises enable row level security;
alter table public.athlete_exercise_settings enable row level security;
alter table public.templates enable row level security;
alter table public.template_exercises enable row level security;
alter table public.programs enable row level security;
alter table public.program_templates enable row level security;
alter table public.assignments enable row level security;
alter table public.memberships enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets enable row level security;
alter table public.workout_comments enable row level security;
alter table public.body_measurements enable row level security;

-- profiles: me + linked trainers/clients can read; only I can edit mine (rows come from a trigger)
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_linked_user(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- athletes: created only via trigger / create_offline_client(); renaming allowed for the
-- athlete themself and, for offline clients, their trainer
create policy athletes_select on public.athletes for select to authenticated
  using (public.can_access_athlete(id));
create policy athletes_update on public.athletes for update to authenticated
  using (user_id = (select auth.uid()) or (user_id is null and public.is_trainer_of(id)))
  with check (user_id = (select auth.uid()) or (user_id is null and public.is_trainer_of(id)));
create policy athletes_delete on public.athletes for delete to authenticated
  using (user_id is null and public.is_trainer_of(id));

-- trainer_athletes: links are created by RPCs; either side may see and remove a link
create policy trainer_athletes_select on public.trainer_athletes for select to authenticated
  using (trainer_id = (select auth.uid()) or athlete_id = public.my_athlete_id());
create policy trainer_athletes_delete on public.trainer_athletes for delete to authenticated
  using (trainer_id = (select auth.uid()) or athlete_id = public.my_athlete_id());

-- invites: a trainer manages their own; offline-claim invites only for their own offline clients
create policy invites_select on public.invites for select to authenticated
  using (trainer_id = (select auth.uid()));
create policy invites_insert on public.invites for insert to authenticated
  with check (
    trainer_id = (select auth.uid())
    and public.is_trainer()
    and used_at is null
    and used_by is null
    and expires_at <= now() + interval '30 days'
    and (
      athlete_id is null
      or (
        public.is_trainer_of(athlete_id)
        and exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id is null)
      )
    )
  );
create policy invites_delete on public.invites for delete to authenticated
  using (trainer_id = (select auth.uid()));

-- exercises: global catalog + mine + my trainers'/clients' custom ones; owner edits
create policy exercises_select on public.exercises for select to authenticated
  using (owner_id is null or public.is_linked_user(owner_id));
create policy exercises_insert on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()) and slug is null);
create policy exercises_update on public.exercises for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and slug is null);
create policy exercises_delete on public.exercises for delete to authenticated
  using (owner_id = (select auth.uid()));

-- per-athlete machine settings
create policy athlete_exercise_settings_all on public.athlete_exercise_settings for all to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id));

-- templates / programs: visible to linked users, editable by the owner
create policy templates_select on public.templates for select to authenticated
  using (public.is_linked_user(owner_id));
create policy templates_insert on public.templates for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy templates_update on public.templates for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy templates_delete on public.templates for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy template_exercises_select on public.template_exercises for select to authenticated
  using (exists (select 1 from public.templates t where t.id = template_id and public.is_linked_user(t.owner_id)));
create policy template_exercises_write on public.template_exercises for all to authenticated
  using (exists (select 1 from public.templates t where t.id = template_id and t.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.templates t where t.id = template_id and t.owner_id = (select auth.uid())));

create policy programs_select on public.programs for select to authenticated
  using (public.is_linked_user(owner_id));
create policy programs_insert on public.programs for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy programs_update on public.programs for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy programs_delete on public.programs for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy program_templates_select on public.program_templates for select to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and public.is_linked_user(p.owner_id)));
create policy program_templates_write on public.program_templates for all to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and p.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from public.programs p where p.id = program_id and p.owner_id = (select auth.uid()))
    and exists (select 1 from public.templates t where t.id = template_id and t.owner_id = (select auth.uid()))
  );

-- assignments: assign your own templates/programs to athletes you can access
create policy assignments_select on public.assignments for select to authenticated
  using (public.can_access_athlete(athlete_id));
create policy assignments_insert on public.assignments for insert to authenticated
  with check (
    assigned_by = (select auth.uid())
    and public.can_access_athlete(athlete_id)
    and (
      (template_id is not null and exists (
        select 1 from public.templates t where t.id = template_id and t.owner_id = (select auth.uid())))
      or (program_id is not null and exists (
        select 1 from public.programs p where p.id = program_id and p.owner_id = (select auth.uid())))
    )
  );
create policy assignments_delete on public.assignments for delete to authenticated
  using (public.can_access_athlete(athlete_id));

-- memberships:
--   trainer packages — read by the athlete and that trainer, written only by that linked trainer
--   gym memberships — read and written by the athlete and any of their trainers
create policy memberships_select on public.memberships for select to authenticated
  using (
    athlete_id = public.my_athlete_id()
    or (kind = 'trainer' and trainer_id = (select auth.uid()))
    or (kind = 'gym' and public.is_trainer_of(athlete_id))
  );
create policy memberships_insert on public.memberships for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (kind = 'trainer' and trainer_id = (select auth.uid()) and public.is_trainer_of(athlete_id))
      or (kind = 'gym' and trainer_id is null and public.can_access_athlete(athlete_id))
    )
  );
create policy memberships_update on public.memberships for update to authenticated
  using (
    (kind = 'trainer' and trainer_id = (select auth.uid()))
    or (kind = 'gym' and public.can_access_athlete(athlete_id))
  )
  with check (
    (kind = 'trainer' and trainer_id = (select auth.uid()) and public.is_trainer_of(athlete_id))
    or (kind = 'gym' and trainer_id is null and public.can_access_athlete(athlete_id))
  );
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    (kind = 'trainer' and trainer_id = (select auth.uid()))
    or (kind = 'gym' and public.can_access_athlete(athlete_id))
  );

-- workouts: athlete + their trainers; a charged workout can only be deleted by the package trainer
create policy workouts_select on public.workouts for select to authenticated
  using (public.can_access_athlete(athlete_id));
create policy workouts_insert on public.workouts for insert to authenticated
  with check (created_by = (select auth.uid()) and public.can_access_athlete(athlete_id));
create policy workouts_update on public.workouts for update to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id));
create policy workouts_delete on public.workouts for delete to authenticated
  using (
    public.can_access_athlete(athlete_id)
    and (
      membership_id is null
      or exists (select 1 from public.memberships m where m.id = membership_id and m.trainer_id = (select auth.uid()))
    )
  );

create policy workout_exercises_all on public.workout_exercises for all to authenticated
  using (public.can_access_workout(workout_id))
  with check (public.can_access_workout(workout_id));

create policy sets_all on public.sets for all to authenticated
  using (public.can_access_workout_exercise(workout_exercise_id))
  with check (public.can_access_workout_exercise(workout_exercise_id));

create policy workout_comments_select on public.workout_comments for select to authenticated
  using (public.can_access_workout(workout_id));
create policy workout_comments_insert on public.workout_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_access_workout(workout_id));
create policy workout_comments_update on public.workout_comments for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.can_access_workout(workout_id));
create policy workout_comments_delete on public.workout_comments for delete to authenticated
  using (author_id = (select auth.uid()));

create policy body_measurements_all on public.body_measurements for all to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id));

-- Privileges -------------------------------------------------------------------------------
-- Nothing is readable without signing in.

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Column-level limits on top of RLS: identity/ownership columns are not client-editable.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, is_trainer, locale) on public.profiles to authenticated;
revoke update on public.athletes from authenticated;
grant update (display_name) on public.athletes to authenticated;
revoke update on public.invites from authenticated;
