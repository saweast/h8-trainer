-- h8-trainer: plans — the trainer's spreadsheet as data. A plan has days ("1 тренування"),
-- each day has exercise rows, and every row has one cell per week with exact planned sets
-- (same jsonb shape as template_exercises.sets). A plan with athlete_id = null is a reusable
-- plan template; a client gets their own copy. Workouts started from a plan point back at the
-- plan, day, week and row, so the grid can show the plan next to what was actually done.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  athlete_id uuid references public.athletes (id) on delete cascade, -- null = plan template
  source_plan_id uuid references public.plans (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  notes text check (char_length(notes) <= 1000),
  weeks integer not null default 4 check (weeks between 1 and 52),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plans_owner_idx on public.plans (owner_id);
-- one active plan per athlete
create unique index plans_active_athlete_uq on public.plans (athlete_id)
  where athlete_id is not null and archived_at is null;

create table public.plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null default '' check (char_length(name) <= 80)
);
create index plan_days_plan_idx on public.plan_days (plan_id, position);

create table public.plan_rows (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.plan_days (id) on delete cascade,
  position integer not null check (position >= 0),
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  rest_s integer check (rest_s between 0 and 1800),
  notes text check (char_length(notes) <= 300)
);
create index plan_rows_day_idx on public.plan_rows (plan_day_id, position);

create table public.plan_cells (
  plan_row_id uuid not null references public.plan_rows (id) on delete cascade,
  week integer not null check (week between 1 and 52),
  sets jsonb not null constraint plan_cells_sets_valid check (private.valid_spec_sets(sets)),
  primary key (plan_row_id, week)
);

alter table public.workouts
  add column plan_id uuid references public.plans (id) on delete set null,
  add column plan_day_id uuid references public.plan_days (id) on delete set null,
  add column plan_week integer check (plan_week between 1 and 52);
create index workouts_plan_idx on public.workouts (plan_id, started_at desc) where plan_id is not null;

alter table public.workout_exercises
  add column plan_row_id uuid references public.plan_rows (id) on delete set null;
create index workout_exercises_plan_row_idx on public.workout_exercises (plan_row_id) where plan_row_id is not null;

create trigger plans_updated_at before update on public.plans
  for each row execute function private.set_updated_at();

-- RLS ----------------------------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_rows enable row level security;
alter table public.plan_cells enable row level security;

-- Plan templates: visible to linked users (like templates). Client plans: to whoever can access
-- the client. Only the owner edits.
create policy plans_select on public.plans for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (athlete_id is null and private.is_linked_user(owner_id))
    or (athlete_id is not null and private.can_access_athlete(athlete_id))
  );
create policy plans_insert on public.plans for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (athlete_id is null or private.can_access_athlete(athlete_id))
  );
create policy plans_update on public.plans for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (athlete_id is null or private.can_access_athlete(athlete_id))
  );
create policy plans_delete on public.plans for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Children: readable when the plan is (the subquery is itself filtered by plans RLS),
-- writable by the plan owner.
create policy plan_days_select on public.plan_days for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id));
create policy plan_days_insert on public.plan_days for insert to authenticated
  with check (exists (select 1 from public.plans p where p.id = plan_id and p.owner_id = (select auth.uid())));
create policy plan_days_update on public.plan_days for update to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.plans p where p.id = plan_id and p.owner_id = (select auth.uid())));
create policy plan_days_delete on public.plan_days for delete to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and p.owner_id = (select auth.uid())));

create policy plan_rows_select on public.plan_rows for select to authenticated
  using (exists (select 1 from public.plan_days d where d.id = plan_day_id));
create policy plan_rows_insert on public.plan_rows for insert to authenticated
  with check (exists (
    select 1 from public.plan_days d join public.plans p on p.id = d.plan_id
    where d.id = plan_day_id and p.owner_id = (select auth.uid())));
create policy plan_rows_update on public.plan_rows for update to authenticated
  using (exists (
    select 1 from public.plan_days d join public.plans p on p.id = d.plan_id
    where d.id = plan_day_id and p.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.plan_days d join public.plans p on p.id = d.plan_id
    where d.id = plan_day_id and p.owner_id = (select auth.uid())));
create policy plan_rows_delete on public.plan_rows for delete to authenticated
  using (exists (
    select 1 from public.plan_days d join public.plans p on p.id = d.plan_id
    where d.id = plan_day_id and p.owner_id = (select auth.uid())));

create policy plan_cells_select on public.plan_cells for select to authenticated
  using (exists (select 1 from public.plan_rows r where r.id = plan_row_id));
create policy plan_cells_insert on public.plan_cells for insert to authenticated
  with check (exists (
    select 1 from public.plan_rows r
    join public.plan_days d on d.id = r.plan_day_id
    join public.plans p on p.id = d.plan_id
    where r.id = plan_row_id and p.owner_id = (select auth.uid())));
create policy plan_cells_update on public.plan_cells for update to authenticated
  using (exists (
    select 1 from public.plan_rows r
    join public.plan_days d on d.id = r.plan_day_id
    join public.plans p on p.id = d.plan_id
    where r.id = plan_row_id and p.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.plan_rows r
    join public.plan_days d on d.id = r.plan_day_id
    join public.plans p on p.id = d.plan_id
    where r.id = plan_row_id and p.owner_id = (select auth.uid())));
create policy plan_cells_delete on public.plan_cells for delete to authenticated
  using (exists (
    select 1 from public.plan_rows r
    join public.plan_days d on d.id = r.plan_day_id
    join public.plans p on p.id = d.plan_id
    where r.id = plan_row_id and p.owner_id = (select auth.uid())));

grant select, insert, update, delete on public.plans, public.plan_days, public.plan_rows, public.plan_cells to authenticated;
revoke all on public.plans, public.plan_days, public.plan_rows, public.plan_cells from anon;
-- ownership columns are not client-editable
revoke update on public.plans from authenticated;
grant update (name, notes, weeks, archived_at) on public.plans to authenticated;

-- Saving -------------------------------------------------------------------------------------

-- Creates or updates a plan in one transaction. Day and row ids come from the client and are
-- kept, so workouts already done against a row stay linked to it; removed days/rows are deleted
-- and all cells are rewritten.
-- p_days: [{id, name, rows: [{id, exercise_id, rest_s, notes, cells: [{week, sets}]}]}]
create function public.save_plan(
  p_id uuid,
  p_athlete uuid,
  p_name text,
  p_notes text,
  p_weeks integer,
  p_days jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_new boolean := not exists (select 1 from public.plans where id = v_id);
  v_day_ids uuid[];
  v_row_ids uuid[];
begin
  if jsonb_typeof(p_days) is distinct from 'array' then
    raise exception 'days must be an array' using errcode = '22023';
  end if;

  v_day_ids := array(select (d ->> 'id')::uuid from jsonb_array_elements(p_days) d);
  v_row_ids := array(
    select (r ->> 'id')::uuid
    from jsonb_array_elements(p_days) d, jsonb_array_elements(coalesce(d -> 'rows', '[]'::jsonb)) r
  );
  if exists (select 1 from public.plan_days where id = any(v_day_ids) and plan_id <> v_id)
     or exists (
       select 1 from public.plan_rows r join public.plan_days d on d.id = r.plan_day_id
       where r.id = any(v_row_ids) and d.plan_id <> v_id) then
    raise exception 'day or row belongs to another plan' using errcode = '22023';
  end if;

  if v_new and p_athlete is not null then
    -- a new client plan replaces the client's active one
    update public.plans set archived_at = now()
    where athlete_id = p_athlete and archived_at is null and owner_id = (select auth.uid());
  end if;

  insert into public.plans (id, athlete_id, name, notes, weeks)
  values (v_id, p_athlete, trim(p_name), nullif(trim(coalesce(p_notes, '')), ''), p_weeks)
  on conflict (id) do update set name = excluded.name, notes = excluded.notes, weeks = excluded.weeks;

  insert into public.plan_days (id, plan_id, position, name)
  select (d ->> 'id')::uuid, v_id, (t.ord - 1)::integer, trim(coalesce(d ->> 'name', ''))
  from jsonb_array_elements(p_days) with ordinality as t(d, ord)
  on conflict (id) do update set position = excluded.position, name = excluded.name;

  insert into public.plan_rows (id, plan_day_id, position, exercise_id, rest_s, notes)
  select (r ->> 'id')::uuid, (d ->> 'id')::uuid, (rt.ord - 1)::integer, (r ->> 'exercise_id')::uuid,
         (r ->> 'rest_s')::integer, nullif(trim(coalesce(r ->> 'notes', '')), '')
  from jsonb_array_elements(p_days) d,
       jsonb_array_elements(coalesce(d -> 'rows', '[]'::jsonb)) with ordinality as rt(r, ord)
  on conflict (id) do update set
    plan_day_id = excluded.plan_day_id, position = excluded.position, exercise_id = excluded.exercise_id,
    rest_s = excluded.rest_s, notes = excluded.notes;

  -- removed rows/days go only after the upserts, so a row moved to another day keeps its id
  delete from public.plan_rows r using public.plan_days d
  where d.id = r.plan_day_id and d.plan_id = v_id and r.id <> all(v_row_ids);
  delete from public.plan_days where plan_id = v_id and id <> all(v_day_ids);

  delete from public.plan_cells c using public.plan_rows r, public.plan_days d
  where r.id = c.plan_row_id and d.id = r.plan_day_id and d.plan_id = v_id;

  insert into public.plan_cells (plan_row_id, week, sets)
  select (r ->> 'id')::uuid, (c ->> 'week')::integer, c -> 'sets'
  from jsonb_array_elements(p_days) d,
       jsonb_array_elements(coalesce(d -> 'rows', '[]'::jsonb)) r,
       jsonb_array_elements(coalesce(r -> 'cells', '[]'::jsonb)) c
  where (c ->> 'week')::integer <= p_weeks;

  return v_id;
end;
$$;

-- Copies a plan: template → client, client → client, client → template (p_athlete null).
create function public.copy_plan(p_source uuid, p_athlete uuid, p_name text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_src public.plans;
  v_id uuid := gen_random_uuid();
  d record;
  v_day uuid;
  r record;
  v_row uuid;
begin
  select * into v_src from public.plans where id = p_source;
  if v_src.id is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  if p_athlete is not null then
    update public.plans set archived_at = now()
    where athlete_id = p_athlete and archived_at is null and owner_id = (select auth.uid());
  end if;

  insert into public.plans (id, athlete_id, source_plan_id, name, notes, weeks)
  values (v_id, p_athlete, v_src.id, coalesce(nullif(trim(p_name), ''), v_src.name), v_src.notes, v_src.weeks);

  for d in select * from public.plan_days where plan_id = p_source order by position loop
    v_day := gen_random_uuid();
    insert into public.plan_days (id, plan_id, position, name) values (v_day, v_id, d.position, d.name);
    for r in select * from public.plan_rows where plan_day_id = d.id order by position loop
      v_row := gen_random_uuid();
      insert into public.plan_rows (id, plan_day_id, position, exercise_id, rest_s, notes)
      values (v_row, v_day, r.position, r.exercise_id, r.rest_s, r.notes);
      insert into public.plan_cells (plan_row_id, week, sets)
      select v_row, c.week, c.sets from public.plan_cells c where c.plan_row_id = r.id;
    end loop;
  end loop;

  return v_id;
end;
$$;

-- A plan from existing templates (a program's days): one day per template, every week gets the
-- template's exact sets, or its uniform targets when a target weight is set. Without either the
-- cell stays empty and starting the workout falls back to last time.
create function public.create_plan_from_templates(p_athlete uuid, p_name text, p_weeks integer, p_template_ids uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_day uuid;
  v_row uuid;
  t record;
  te record;
  v_sets jsonb;
begin
  if p_athlete is not null then
    update public.plans set archived_at = now()
    where athlete_id = p_athlete and archived_at is null and owner_id = (select auth.uid());
  end if;

  insert into public.plans (id, athlete_id, name, weeks) values (v_id, p_athlete, trim(p_name), p_weeks);

  for t in
    select tp.id, tp.name, (u.ord - 1)::integer as position
    from unnest(p_template_ids) with ordinality as u(template_id, ord)
    join public.templates tp on tp.id = u.template_id
    order by u.ord
  loop
    v_day := gen_random_uuid();
    insert into public.plan_days (id, plan_id, position, name) values (v_day, v_id, t.position, left(t.name, 80));
    for te in select * from public.template_exercises where template_id = t.id order by position loop
      v_row := gen_random_uuid();
      insert into public.plan_rows (id, plan_day_id, position, exercise_id, rest_s, notes)
      values (v_row, v_day, te.position, te.exercise_id, te.rest_s, te.notes);
      v_sets := coalesce(
        te.sets,
        case when te.target_weight_kg is not null then (
          select jsonb_agg(jsonb_build_object(
            'w', te.target_weight_kg,
            'r', coalesce(te.target_reps_max, te.target_reps_min, 10)))
          from generate_series(1, te.target_sets)
        ) end
      );
      if v_sets is not null then
        insert into public.plan_cells (plan_row_id, week, sets)
        select v_row, w, v_sets from generate_series(1, p_weeks) as w;
      end if;
    end loop;
  end loop;

  return v_id;
end;
$$;

-- Running ------------------------------------------------------------------------------------

-- The slot after the last finished workout of this plan (week by week, day by day), or the very
-- first slot. Skipped days don't block the plan. Empty when the last slot is done.
create function public.next_plan_slot(p_plan uuid)
returns table (week integer, plan_day_id uuid)
language sql stable
set search_path = ''
as $$
  with plan as (
    select id, athlete_id, weeks from public.plans where id = p_plan
  ),
  slots as (
    select g.w as week, d.id as plan_day_id,
           row_number() over (order by g.w, d.position) as n
    from plan
    cross join generate_series(1, plan.weeks) as g(w)
    join public.plan_days d on d.plan_id = plan.id
  ),
  last_done as (
    select s.n
    from public.workouts wo
    join plan on plan.id = wo.plan_id and plan.athlete_id = wo.athlete_id
    join slots s on s.week = wo.plan_week and s.plan_day_id = wo.plan_day_id
    where wo.finished_at is not null
    order by wo.started_at desc
    limit 1
  )
  select s.week, s.plan_day_id
  from slots s
  where s.n = coalesce((select n from last_done), 0) + 1
$$;

-- Starts a workout for the plan's client from one cell column (week × day). Planned sets are
-- copied as is (warm-ups included); a row without a cell for that week repeats last time.
create function public.start_workout_from_plan(
  p_plan uuid,
  p_week integer,
  p_day uuid,
  p_membership uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_day public.plan_days;
  v_workout uuid := gen_random_uuid();
  v_we uuid;
  r record;
  v_sets jsonb;
begin
  select * into v_plan from public.plans where id = p_plan;
  if v_plan.id is null or v_plan.athlete_id is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  select * into v_day from public.plan_days where id = p_day and plan_id = p_plan;
  if v_day.id is null then
    raise exception 'day not found' using errcode = 'P0002';
  end if;
  if p_week not between 1 and v_plan.weeks then
    raise exception 'week out of range' using errcode = '22023';
  end if;

  insert into public.workouts (id, athlete_id, title, plan_id, plan_day_id, plan_week, membership_id)
  values (v_workout, v_plan.athlete_id, left(coalesce(nullif(v_day.name, ''), v_plan.name), 80),
          p_plan, p_day, p_week, p_membership);

  for r in select * from public.plan_rows where plan_day_id = p_day order by position loop
    v_we := gen_random_uuid();
    insert into public.workout_exercises (id, workout_id, exercise_id, position, notes, plan_row_id)
    values (v_we, v_workout, r.exercise_id, r.position, r.notes, r.id);

    select c.sets into v_sets from public.plan_cells c where c.plan_row_id = r.id and c.week = p_week;
    if v_sets is not null then
      perform private.insert_spec_sets(v_we, v_sets);
    else
      insert into public.sets (workout_exercise_id, position, weight_kg, reps, is_warmup)
      select v_we, lp.position, lp.weight_kg, lp.reps, lp.is_warmup
      from public.last_performance(v_plan.athlete_id, r.exercise_id, v_workout) lp;
    end if;
  end loop;

  return v_workout;
end;
$$;

revoke execute on function public.save_plan(uuid, uuid, text, text, integer, jsonb) from anon, public;
revoke execute on function public.copy_plan(uuid, uuid, text) from anon, public;
revoke execute on function public.create_plan_from_templates(uuid, text, integer, uuid[]) from anon, public;
revoke execute on function public.next_plan_slot(uuid) from anon, public;
revoke execute on function public.start_workout_from_plan(uuid, integer, uuid, uuid) from anon, public;
grant execute on function public.save_plan(uuid, uuid, text, text, integer, jsonb) to authenticated;
grant execute on function public.copy_plan(uuid, uuid, text) to authenticated;
grant execute on function public.create_plan_from_templates(uuid, text, integer, uuid[]) to authenticated;
grant execute on function public.next_plan_slot(uuid) to authenticated;
grant execute on function public.start_workout_from_plan(uuid, integer, uuid, uuid) to authenticated;
