-- h8-trainer: core schema
-- Personal data is kept minimal: display name + avatar URL from Google. Email stays in auth.users.

create type public.muscle_group as enum (
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'calves', 'core', 'full_body', 'other'
);
create type public.equipment_type as enum ('machine', 'barbell', 'dumbbell', 'cable', 'bodyweight', 'other');
create type public.membership_kind as enum ('trainer', 'gym');

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- People -----------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_url text check (char_length(avatar_url) <= 500),
  is_trainer boolean not null default false,
  locale text not null default 'uk' check (locale in ('uk', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Whose workouts are tracked. Every user gets one (user_id set); a trainer's client without an
-- account is an "offline" athlete (user_id null) until they claim it through an invite.
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Trainer ↔ client link. All trainer permissions derive from this table.
create table public.trainer_athletes (
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trainer_id, athlete_id)
);
create index trainer_athletes_athlete_idx on public.trainer_athletes (athlete_id);

create table public.invites (
  code text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  -- set → invite claims this offline athlete (history moves to the invitee)
  athlete_id uuid references public.athletes (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invites_trainer_idx on public.invites (trainer_id);

-- Exercises / machines ---------------------------------------------------------------------

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  -- global catalog rows have a slug (name translated in the app), custom rows have an owner
  slug text unique check (slug ~ '^[a-z0-9_]{2,60}$'),
  name text not null check (char_length(name) between 1 and 80),
  muscle_group public.muscle_group not null,
  equipment public.equipment_type not null,
  weight_step_kg numeric(4, 2) not null default 2.5 check (weight_step_kg > 0),
  default_rest_s integer not null default 90 check (default_rest_s between 0 and 1800),
  owner_id uuid references public.profiles (id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint exercises_global_or_custom check ((slug is null) <> (owner_id is null))
);
create index exercises_owner_idx on public.exercises (owner_id) where owner_id is not null;

-- Per-person machine setup ("seat 4, back 2") and preferred rest.
create table public.athlete_exercise_settings (
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  setup_notes text check (char_length(setup_notes) <= 200),
  rest_s integer check (rest_s between 0 and 1800),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, exercise_id)
);

-- Templates and programs -------------------------------------------------------------------

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index templates_owner_idx on public.templates (owner_id);

create table public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position integer not null check (position >= 0),
  target_sets integer not null default 3 check (target_sets between 1 and 20),
  target_reps_min integer check (target_reps_min between 1 and 100),
  target_reps_max integer check (target_reps_max between 1 and 100),
  target_weight_kg numeric(6, 2) check (target_weight_kg between 0 and 1000),
  rest_s integer check (rest_s between 0 and 1800),
  notes text check (char_length(notes) <= 300),
  check (target_reps_min is null or target_reps_max is null or target_reps_min <= target_reps_max)
);
create index template_exercises_template_idx on public.template_exercises (template_id, position);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index programs_owner_idx on public.programs (owner_id);

-- A program is an ordered cycle of templates (Day A, Day B, ...).
create table public.program_templates (
  program_id uuid not null references public.programs (id) on delete cascade,
  position integer not null check (position >= 0),
  template_id uuid not null references public.templates (id) on delete cascade,
  primary key (program_id, position)
);
create index program_templates_template_idx on public.program_templates (template_id);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  template_id uuid references public.templates (id) on delete cascade,
  program_id uuid references public.programs (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  check (num_nonnulls(template_id, program_id) = 1)
);
create unique index assignments_template_uq on public.assignments (athlete_id, template_id) where template_id is not null;
create unique index assignments_program_uq on public.assignments (athlete_id, program_id) where program_id is not null;

-- Paid trainer packages and gym memberships ------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  kind public.membership_kind not null,
  trainer_id uuid references public.profiles (id) on delete cascade,
  title text check (char_length(title) <= 80),
  starts_on date not null default current_date,
  ends_on date,
  sessions_total integer check (sessions_total between 1 and 500), -- null = unlimited
  paid_on date,
  notes text check (char_length(notes) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint memberships_trainer_kind check ((kind = 'trainer') = (trainer_id is not null)),
  constraint memberships_dates check (ends_on is null or ends_on >= starts_on)
);
create index memberships_athlete_idx on public.memberships (athlete_id);
create index memberships_trainer_idx on public.memberships (trainer_id) where trainer_id is not null;

-- Workouts ---------------------------------------------------------------------------------

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 80),
  started_at timestamptz not null default now(),
  finished_at timestamptz, -- null = in progress
  notes text check (char_length(notes) <= 1000),
  template_id uuid references public.templates (id) on delete set null,
  program_id uuid references public.programs (id) on delete set null,
  membership_id uuid references public.memberships (id) on delete set null, -- session charged to
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (finished_at is null or finished_at >= started_at)
);
create index workouts_athlete_started_idx on public.workouts (athlete_id, started_at desc);
create index workouts_membership_idx on public.workouts (membership_id) where membership_id is not null;

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position integer not null check (position >= 0),
  notes text check (char_length(notes) <= 300)
);
create index workout_exercises_workout_idx on public.workout_exercises (workout_id, position);
create index workout_exercises_exercise_idx on public.workout_exercises (exercise_id);

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  position integer not null check (position >= 0),
  weight_kg numeric(6, 2) not null default 0 check (weight_kg between 0 and 1000),
  reps integer not null default 0 check (reps between 0 and 1000),
  is_warmup boolean not null default false,
  rpe numeric(3, 1) check (rpe between 1 and 10),
  completed_at timestamptz, -- null = planned, not done yet
  created_at timestamptz not null default now()
);
create index sets_workout_exercise_idx on public.sets (workout_exercise_id, position);

create table public.workout_comments (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index workout_comments_workout_idx on public.workout_comments (workout_id, created_at);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  measured_at date not null default current_date,
  weight_kg numeric(5, 2) check (weight_kg between 20 and 400),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 1 and 70),
  chest_cm numeric(5, 1) check (chest_cm between 10 and 300),
  waist_cm numeric(5, 1) check (waist_cm between 10 and 300),
  hips_cm numeric(5, 1) check (hips_cm between 10 and 300),
  arm_cm numeric(5, 1) check (arm_cm between 10 and 300),
  thigh_cm numeric(5, 1) check (thigh_cm between 10 and 300),
  notes text check (char_length(notes) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index body_measurements_athlete_idx on public.body_measurements (athlete_id, measured_at desc);

-- updated_at bookkeeping
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();
create trigger programs_updated_at before update on public.programs
  for each row execute function public.set_updated_at();
create trigger workouts_updated_at before update on public.workouts
  for each row execute function public.set_updated_at();
create trigger athlete_exercise_settings_updated_at before update on public.athlete_exercise_settings
  for each row execute function public.set_updated_at();
