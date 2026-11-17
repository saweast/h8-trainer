-- h8-trainer: merging clients.
-- A trainer often ends up with the same person twice: an offline client they created, and the
-- person's own account (invited later, or linked some other way). Now the trainer can:
-- 1. Merge an offline client into another of their clients (with or without an account) at once:
--    they already have full access to both.
-- 2. Ask the owner of an email address to take over an offline client's history. Nothing moves
--    until that person accepts in the app, and the trainer is not told whether the email has an
--    account, so emails can't be probed.
-- The move itself is shared with claim_invite, which also stops losing the offline client's plans
-- (they were cascade-deleted with the offline athlete row before).

-- Moving history ---------------------------------------------------------------------------

-- Everything that belongs to p_from moves to p_into, then p_from is deleted. Callers check access.
create function private.merge_athlete(p_from uuid, p_into uuid) returns void
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

-- Same as before, with the move delegated (and plans now included).
create or replace function public.claim_invite(p_code text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.invites;
  v_me uuid;
  v_offline uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.invites where code = p_code for update;
  if not found or v_invite.used_at is not null or v_invite.expires_at < now() then
    raise exception 'invite is invalid or expired' using errcode = 'P0002';
  end if;
  if v_invite.trainer_id = v_uid then
    raise exception 'you cannot accept your own invite' using errcode = '22023';
  end if;

  select id into v_me from public.athletes where user_id = v_uid;
  if v_me is null then
    raise exception 'athlete profile missing' using errcode = 'P0002';
  end if;

  v_offline := v_invite.athlete_id;
  if v_offline is not null
    and exists (select 1 from public.athletes where id = v_offline and user_id is not null)
  then
    raise exception 'invite is invalid or expired' using errcode = 'P0002';
  end if;

  -- marked used first: the move deletes the offline client's other open invites
  update public.invites set used_at = now(), used_by = v_uid where code = p_code;

  if v_offline is not null then
    perform private.merge_athlete(v_offline, v_me);
  end if;

  insert into public.trainer_athletes (trainer_id, athlete_id)
  values (v_invite.trainer_id, v_me)
  on conflict do nothing;

  return v_me;
end;
$$;

-- 1. Trainer merges two of their clients ----------------------------------------------------

-- Only a client without an account can be merged away: two accounts are two different people.
create function public.merge_clients(p_from uuid, p_into uuid) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_from = p_into then
    raise exception 'cannot merge a client into itself' using errcode = '22023';
  end if;
  if not private.is_trainer_of(p_from) or not private.is_trainer_of(p_into) then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  perform 1 from public.athletes where id in (p_from, p_into) for update;
  if exists (select 1 from public.athletes where id = p_from and user_id is not null) then
    raise exception 'only a client without an account can be merged into another' using errcode = '22023';
  end if;

  perform private.merge_athlete(p_from, p_into);
  return p_into;
end;
$$;

-- 2. Link requests by email ------------------------------------------------------------------

-- One open request per offline client; sending another replaces the email.
create table public.client_link_requests (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  athlete_id uuid not null unique references public.athletes (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  created_at timestamptz not null default now()
);
create index client_link_requests_email_idx on public.client_link_requests (email);
create index client_link_requests_trainer_idx on public.client_link_requests (trainer_id);

alter table public.client_link_requests enable row level security;

-- The trainer sees and cancels their own requests; created through request_client_link().
-- The invitee reads theirs through my_link_requests() (matched on their sign-in email).
create policy client_link_requests_select on public.client_link_requests for select to authenticated
  using (trainer_id = (select auth.uid()));
create policy client_link_requests_delete on public.client_link_requests for delete to authenticated
  using (trainer_id = (select auth.uid()));

revoke all on public.client_link_requests from anon, authenticated;
grant select, delete on public.client_link_requests to authenticated;

-- The caller's sign-in email, only once it is confirmed (Google sign-ins always are).
create function private.my_confirmed_email() returns text
language sql stable security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null
$$;
revoke execute on function private.my_confirmed_email() from authenticated, anon, public;

create function public.request_client_link(p_athlete uuid, p_email text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not private.is_trainer_of(p_athlete)
    or exists (select 1 from public.athletes where id = p_athlete and user_id is not null)
  then
    raise exception 'only your own clients without an account' using errcode = '42501';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if v_email = (select lower(u.email) from auth.users u where u.id = v_uid) then
    raise exception 'you cannot send a request to yourself' using errcode = '22023';
  end if;

  insert into public.client_link_requests (trainer_id, athlete_id, email)
  values (v_uid, p_athlete, v_email)
  on conflict (athlete_id) do update
    set email = excluded.email, trainer_id = excluded.trainer_id, created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Requests waiting for the caller, with what would move.
create function public.my_link_requests()
returns table (
  id uuid,
  trainer_name text,
  trainer_avatar_url text,
  athlete_name text,
  workouts_count integer,
  created_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select
    r.id,
    p.display_name,
    p.avatar_url,
    a.display_name,
    (select count(*)::integer from public.workouts w where w.athlete_id = a.id and w.finished_at is not null),
    r.created_at
  from public.client_link_requests r
  join public.profiles p on p.id = r.trainer_id
  join public.athletes a on a.id = r.athlete_id and a.user_id is null
  where r.email = private.my_confirmed_email()
    and r.trainer_id <> (select auth.uid())
  order by r.created_at desc
$$;

-- Accepting: the offline client's history moves into the caller's own athlete, the trainer is linked.
create function public.accept_link_request(p_id uuid) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.client_link_requests;
  v_me uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_req from public.client_link_requests where id = p_id for update;
  if not found or v_req.email is distinct from private.my_confirmed_email() or v_req.trainer_id = v_uid then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  select id into v_me from public.athletes where user_id = v_uid;
  if v_me is null then
    raise exception 'athlete profile missing' using errcode = 'P0002';
  end if;

  perform 1 from public.athletes where id = v_req.athlete_id for update;
  if not exists (select 1 from public.athletes where id = v_req.athlete_id and user_id is null) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  perform private.merge_athlete(v_req.athlete_id, v_me); -- also removes the request (cascade)

  insert into public.trainer_athletes (trainer_id, athlete_id)
  values (v_req.trainer_id, v_me)
  on conflict do nothing;

  return v_me;
end;
$$;

create function public.decline_link_request(p_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.client_link_requests
  where id = p_id and email = private.my_confirmed_email();
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.merge_clients(uuid, uuid) from anon, public;
revoke execute on function public.request_client_link(uuid, text) from anon, public;
revoke execute on function public.my_link_requests() from anon, public;
revoke execute on function public.accept_link_request(uuid) from anon, public;
revoke execute on function public.decline_link_request(uuid) from anon, public;
grant execute on function public.merge_clients(uuid, uuid) to authenticated;
grant execute on function public.request_client_link(uuid, text) to authenticated;
grant execute on function public.my_link_requests() to authenticated;
grant execute on function public.accept_link_request(uuid) to authenticated;
grant execute on function public.decline_link_request(uuid) to authenticated;
