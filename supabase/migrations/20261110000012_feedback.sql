-- h8-trainer: client feedback.
-- 1. Per exercise after doing it: easy / ok / hard + a short note (workout_exercises).
-- 2. On the plan before doing it: comment threads on a plan, an exercise row or one cell.
-- 3. A feed for the trainer across all clients, with "seen up to" on the profile.

alter table public.workout_exercises
  add column difficulty smallint check (difficulty between 1 and 3), -- 1 easy · 2 ok · 3 hard
  add column athlete_feedback text check (char_length(athlete_feedback) <= 300),
  add column feedback_at timestamptz,
  add column feedback_by uuid references public.profiles (id) on delete set null;

-- Who left the feedback and when is stamped by the server, not trusted from the client.
create function private.stamp_exercise_feedback() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.difficulty is distinct from old.difficulty or new.athlete_feedback is distinct from old.athlete_feedback then
    if new.difficulty is null and nullif(trim(coalesce(new.athlete_feedback, '')), '') is null then
      new.feedback_at := null;
      new.feedback_by := null;
    else
      new.feedback_at := now();
      new.feedback_by := (select auth.uid());
    end if;
  else
    new.feedback_at := old.feedback_at;
    new.feedback_by := old.feedback_by;
  end if;
  return new;
end;
$$;
revoke execute on function private.stamp_exercise_feedback() from authenticated, anon, public;

create trigger workout_exercises_feedback before update on public.workout_exercises
  for each row execute function private.stamp_exercise_feedback();
create index workout_exercises_feedback_idx on public.workout_exercises (feedback_at desc) where feedback_at is not null;

-- Plan comments ------------------------------------------------------------------------------

create table public.plan_comments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  plan_row_id uuid references public.plan_rows (id) on delete cascade, -- null = whole plan
  week integer check (week between 1 and 52),                          -- null = whole row
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (week is null or plan_row_id is not null)
);
create index plan_comments_plan_idx on public.plan_comments (plan_id, created_at);

alter table public.plan_comments enable row level security;

-- Readable with the plan; written by the client or their trainer, on client plans only.
create policy plan_comments_select on public.plan_comments for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id));
create policy plan_comments_insert on public.plan_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.plans p
      where p.id = plan_id and p.athlete_id is not null and private.can_access_athlete(p.athlete_id)
    )
    and (
      plan_row_id is null
      or exists (
        select 1 from public.plan_rows r join public.plan_days d on d.id = r.plan_day_id
        where r.id = plan_row_id and d.plan_id = plan_comments.plan_id
      )
    )
  );
create policy plan_comments_delete on public.plan_comments for delete to authenticated
  using (author_id = (select auth.uid()));

grant select, insert, delete on public.plan_comments to authenticated;
revoke all on public.plan_comments from anon;

-- Feed ---------------------------------------------------------------------------------------

alter table public.profiles add column feedback_seen_at timestamptz;
grant update (feedback_seen_at) on public.profiles to authenticated;
-- server-stamped feedback columns are not client-editable
revoke update on public.workout_exercises from authenticated;
grant update (exercise_id, position, notes, difficulty, athlete_feedback) on public.workout_exercises to authenticated;

-- Latest feedback from the caller's clients (their own notes excluded), newest first.
create function public.trainer_feedback_feed(p_limit integer default 50)
returns table (
  kind text,           -- 'exercise' | 'plan' | 'workout'
  created_at timestamptz,
  athlete_id uuid,
  athlete_name text,
  author_name text,
  workout_id uuid,
  exercise_id uuid,
  plan_id uuid,
  plan_row_id uuid,
  week integer,
  difficulty smallint,
  body text
)
language sql stable
set search_path = ''
as $$
  with clients as (
    select ta.athlete_id from public.trainer_athletes ta where ta.trainer_id = (select auth.uid())
  ),
  items as (
    select 'exercise'::text as kind, we.feedback_at as created_at, w.athlete_id, we.feedback_by as author_id,
           w.id as workout_id, we.exercise_id, w.plan_id, we.plan_row_id, w.plan_week as week,
           we.difficulty, we.athlete_feedback as body
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.feedback_at is not null and w.athlete_id in (select athlete_id from clients)
    union all
    select 'plan', pc.created_at, p.athlete_id, pc.author_id,
           null, r.exercise_id, pc.plan_id, pc.plan_row_id, pc.week, null, pc.body
    from public.plan_comments pc
    join public.plans p on p.id = pc.plan_id
    left join public.plan_rows r on r.id = pc.plan_row_id
    where p.athlete_id in (select athlete_id from clients)
    union all
    select 'workout', wc.created_at, w.athlete_id, wc.author_id,
           w.id, null, w.plan_id, null, w.plan_week, null, wc.body
    from public.workout_comments wc
    join public.workouts w on w.id = wc.workout_id
    where w.athlete_id in (select athlete_id from clients)
  )
  select i.kind, i.created_at, i.athlete_id, a.display_name, pr.display_name,
         i.workout_id, i.exercise_id, i.plan_id, i.plan_row_id, i.week, i.difficulty, i.body
  from items i
  join public.athletes a on a.id = i.athlete_id
  left join public.profiles pr on pr.id = i.author_id
  where i.author_id is distinct from (select auth.uid())
  order by i.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

revoke execute on function public.trainer_feedback_feed(integer) from anon, public;
grant execute on function public.trainer_feedback_feed(integer) to authenticated;
