-- ============================================================================
-- Harbour Care Centre — Visitor Check-In System
-- 0001_init.sql — core schema, constraints, RLS, kiosk RPCs, realtime
--
-- Run via `supabase db push`, or paste into the Supabase SQL Editor.
-- Idempotent: safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Types
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'visit_status' and n.nspname = 'public'
  ) then
    create type public.visit_status as enum ('IN', 'OUT');
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- visitors
--
-- fob_id is NULLABLE on purpose: "Unlink Fob" sets it to NULL so the physical
-- fob can be handed to the next visitor. Postgres UNIQUE allows many NULLs,
-- so any number of visitors can sit fob-less without colliding.
-- ----------------------------------------------------------------------------
create table if not exists public.visitors (
  id                  uuid primary key default gen_random_uuid(),
  fob_id              text unique,
  full_name           text not null,
  company_or_relation text,
  visiting_who        text,
  created_at          timestamptz not null default now(),

  constraint visitors_full_name_not_blank check (length(btrim(full_name)) > 0),
  constraint visitors_fob_id_not_blank    check (fob_id is null or length(btrim(fob_id)) > 0)
);

comment on column public.visitors.fob_id is
  '10-digit code emitted by the 125kHz RFID reader. NULL = no fob assigned (unlinked).';


-- ----------------------------------------------------------------------------
-- visit_logs
--
-- One row per visit. status/check_out_time are kept consistent by constraint,
-- and a partial unique index guarantees a visitor can never have two open
-- sessions — which is what makes the fire roster trustworthy.
-- ----------------------------------------------------------------------------
create table if not exists public.visit_logs (
  id             uuid primary key default gen_random_uuid(),
  visitor_id     uuid not null references public.visitors(id) on delete cascade,
  check_in_time  timestamptz not null default now(),
  check_out_time timestamptz,
  status         public.visit_status not null default 'IN',

  constraint visit_logs_status_consistent check (
    (status = 'IN'  and check_out_time is null) or
    (status = 'OUT' and check_out_time is not null)
  ),
  constraint visit_logs_time_order check (
    check_out_time is null or check_out_time >= check_in_time
  )
);

-- At most one open ('IN') session per visitor.
create unique index if not exists visit_logs_one_open_session_per_visitor
  on public.visit_logs (visitor_id)
  where status = 'IN';

-- Fire roster: "everyone currently IN, oldest first".
create index if not exists visit_logs_open_sessions_idx
  on public.visit_logs (check_in_time)
  where status = 'IN';

-- Per-visitor history for the admin drill-down.
create index if not exists visit_logs_visitor_history_idx
  on public.visit_logs (visitor_id, check_in_time desc);


-- ----------------------------------------------------------------------------
-- live_roster — the fire evacuation list
--
-- security_invoker so the caller's RLS applies rather than the view owner's.
-- NOTE: Supabase Realtime publishes tables, not views. The admin dashboard
-- subscribes to public.visit_logs and re-reads this view on each event.
-- ----------------------------------------------------------------------------
create or replace view public.live_roster
with (security_invoker = true) as
select
  l.id            as log_id,
  v.id            as visitor_id,
  v.full_name,
  v.company_or_relation,
  v.visiting_who,
  l.check_in_time
from public.visit_logs l
join public.visitors v on v.id = l.visitor_id
where l.status = 'IN';


-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- Posture: the tablet in the lobby is physically reachable by the public, so
-- it never gets direct table access. Kiosk writes go through Next.js route
-- handlers using the service_role key (which bypasses RLS) and the SECURITY
-- DEFINER functions below. The anon key can read nothing.
--
-- Authenticated = signed-in staff = full access, for the admin dashboard.
-- ----------------------------------------------------------------------------
alter table public.visitors   enable row level security;
alter table public.visit_logs enable row level security;

drop policy if exists staff_all_visitors on public.visitors;
create policy staff_all_visitors on public.visitors
  for all to authenticated
  using (true) with check (true);

drop policy if exists staff_all_visit_logs on public.visit_logs;
create policy staff_all_visit_logs on public.visit_logs
  for all to authenticated
  using (true) with check (true);

revoke all on public.visitors, public.visit_logs, public.live_roster from anon;
grant select on public.live_roster to authenticated;


-- ----------------------------------------------------------------------------
-- handle_fob_scan(fob_id) — the whole kiosk tap, in one atomic round trip.
--
-- Returns one of:
--   {"outcome":"SIGNED_IN",   "visitor_id":…, "full_name":…, "at":…}
--   {"outcome":"SIGNED_OUT",  "visitor_id":…, "full_name":…, "at":…}
--   {"outcome":"UNKNOWN_FOB", "fob_id":…}          -> kiosk routes to registration
--   {"outcome":"INVALID"}                          -> ignore, stay idle
-- ----------------------------------------------------------------------------
create or replace function public.handle_fob_scan(p_fob_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor public.visitors%rowtype;
  v_open_id uuid;
  v_now     timestamptz := now();
begin
  p_fob_id := nullif(btrim(p_fob_id), '');
  if p_fob_id is null then
    return jsonb_build_object('outcome', 'INVALID');
  end if;

  select * into v_visitor
  from public.visitors
  where fob_id = p_fob_id;

  if not found then
    return jsonb_build_object('outcome', 'UNKNOWN_FOB', 'fob_id', p_fob_id);
  end if;

  -- Lock the open session (if any) so a double-tap can't produce two writes.
  select id into v_open_id
  from public.visit_logs
  where visitor_id = v_visitor.id and status = 'IN'
  for update;

  if found then
    update public.visit_logs
    set check_out_time = v_now,
        status         = 'OUT'
    where id = v_open_id;

    return jsonb_build_object(
      'outcome', 'SIGNED_OUT',
      'visitor_id', v_visitor.id,
      'full_name', v_visitor.full_name,
      'at', v_now
    );
  end if;

  insert into public.visit_logs (visitor_id, check_in_time)
  values (v_visitor.id, v_now);

  return jsonb_build_object(
    'outcome', 'SIGNED_IN',
    'visitor_id', v_visitor.id,
    'full_name', v_visitor.full_name,
    'visiting_who', v_visitor.visiting_who,
    'at', v_now
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- register_visitor(...) — Scenario B: create the visitor and sign them IN.
--
-- Returns {"outcome":"REGISTERED", …} or {"outcome":"FOB_TAKEN"} if the fob
-- was claimed between the scan and the form submission.
-- ----------------------------------------------------------------------------
create or replace function public.register_visitor(
  p_fob_id              text,
  p_full_name           text,
  p_company_or_relation text default null,
  p_visiting_who        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor public.visitors%rowtype;
  v_now     timestamptz := now();
begin
  p_fob_id    := nullif(btrim(p_fob_id), '');
  p_full_name := nullif(btrim(p_full_name), '');

  if p_fob_id is null or p_full_name is null then
    return jsonb_build_object('outcome', 'INVALID');
  end if;

  if exists (select 1 from public.visitors where fob_id = p_fob_id) then
    return jsonb_build_object('outcome', 'FOB_TAKEN');
  end if;

  insert into public.visitors (fob_id, full_name, company_or_relation, visiting_who)
  values (
    p_fob_id,
    p_full_name,
    nullif(btrim(p_company_or_relation), ''),
    nullif(btrim(p_visiting_who), '')
  )
  returning * into v_visitor;

  insert into public.visit_logs (visitor_id, check_in_time)
  values (v_visitor.id, v_now);

  return jsonb_build_object(
    'outcome', 'REGISTERED',
    'visitor_id', v_visitor.id,
    'full_name', v_visitor.full_name,
    'at', v_now
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- unlink_fob(visitor_id) — free the physical fob for reassignment.
--
-- Signs the visitor out first by default. Without this, unlinking someone who
-- is still 'IN' would strand them on the fire roster with no fob to tap out.
-- ----------------------------------------------------------------------------
create or replace function public.unlink_fob(
  p_visitor_id     uuid,
  p_force_sign_out boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signed_out boolean := false;
  v_now        timestamptz := now();
begin
  if p_force_sign_out then
    update public.visit_logs
    set check_out_time = v_now,
        status         = 'OUT'
    where visitor_id = p_visitor_id and status = 'IN';

    v_signed_out := found;
  end if;

  update public.visitors
  set fob_id = null
  where id = p_visitor_id;

  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND');
  end if;

  return jsonb_build_object('outcome', 'UNLINKED', 'signed_out', v_signed_out);
end;
$$;


-- ----------------------------------------------------------------------------
-- Function grants
--
-- Kiosk functions are called server-side with the service_role key only.
-- unlink_fob is an admin action, so staff may call it directly.
-- ----------------------------------------------------------------------------
revoke all on function public.handle_fob_scan(text)                        from public, anon, authenticated;
revoke all on function public.register_visitor(text, text, text, text)     from public, anon, authenticated;
revoke all on function public.unlink_fob(uuid, boolean)                    from public, anon;

grant execute on function public.handle_fob_scan(text)                     to service_role;
grant execute on function public.register_visitor(text, text, text, text)  to service_role;
grant execute on function public.unlink_fob(uuid, boolean)                 to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- Realtime — admin dashboard subscribes to visit_logs for the live roster.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'visit_logs'
  ) then
    alter publication supabase_realtime add table public.visit_logs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'visitors'
  ) then
    alter publication supabase_realtime add table public.visitors;
  end if;
end $$;
