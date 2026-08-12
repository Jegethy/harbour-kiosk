-- ============================================================================
-- 0003_fob_assignments.sql
--
-- Keyfob assignment history, visitor deletion rules, and car registrations on
-- the evacuation roster.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fob_assignments — who held which fob, and when
--
-- visitor_id is ON DELETE SET NULL rather than CASCADE, and visitor_name is a
-- snapshot taken at assignment time. Together those keep the audit trail
-- readable after a visitor profile is deleted: the row still says which fob
-- was held, by whom, and between which dates. A cascade would erase exactly
-- the record this table exists to preserve.
-- ----------------------------------------------------------------------------
create table if not exists public.fob_assignments (
  id            uuid primary key default gen_random_uuid(),
  visitor_id    uuid references public.visitors(id) on delete set null,
  /** The holder's name as it was when the fob was assigned. */
  visitor_name  text not null,
  fob_id        text not null,
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz,

  constraint fob_assignments_time_order check (
    unassigned_at is null or unassigned_at >= assigned_at
  )
);

comment on table public.fob_assignments is
  'Historical record of keyfob holders. Rows are written by a trigger on visitors and survive deletion of the visitor.';

-- A physical fob is in exactly one pair of hands at a time.
create unique index if not exists fob_assignments_one_open_per_fob
  on public.fob_assignments (fob_id)
  where unassigned_at is null;

create index if not exists fob_assignments_visitor_idx
  on public.fob_assignments (visitor_id, assigned_at desc);

create index if not exists fob_assignments_fob_idx
  on public.fob_assignments (fob_id, assigned_at desc);


-- ----------------------------------------------------------------------------
-- Maintain the history from the database, not the application.
--
-- fob_id changes through several paths — staff registration, the Register Fob
-- dialog, Unlink Fob, and anyone editing a row in the Supabase dashboard. A
-- trigger is the only place that catches all of them, so the audit trail
-- cannot drift from reality by someone forgetting to call a helper.
-- ----------------------------------------------------------------------------
create or replace function public.sync_fob_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Deleting someone who still holds a fob would leave the physical token
    -- unaccounted for, so the rule is enforced here as well as in the UI.
    if old.fob_id is not null then
      raise exception 'Unlink the keyfob before deleting this visitor'
        using errcode = 'restrict_violation';
    end if;

    update public.fob_assignments
       set unassigned_at = now()
     where visitor_id = old.id and unassigned_at is null;

    return old;
  end if;

  -- Close the outgoing assignment whenever the fob changes or is cleared.
  if tg_op = 'UPDATE' and old.fob_id is not null and old.fob_id is distinct from new.fob_id then
    update public.fob_assignments
       set unassigned_at = now()
     where visitor_id = old.id
       and fob_id = old.fob_id
       and unassigned_at is null;
  end if;

  -- Open a new one when a fob arrives.
  if new.fob_id is not null and (tg_op = 'INSERT' or old.fob_id is distinct from new.fob_id) then
    insert into public.fob_assignments (visitor_id, visitor_name, fob_id)
    values (new.id, new.full_name, new.fob_id);
  end if;

  return new;
end;
$$;

drop trigger if exists visitors_fob_assignment_insert on public.visitors;
create trigger visitors_fob_assignment_insert
  after insert on public.visitors
  for each row execute function public.sync_fob_assignment();

drop trigger if exists visitors_fob_assignment_update on public.visitors;
create trigger visitors_fob_assignment_update
  after update of fob_id on public.visitors
  for each row execute function public.sync_fob_assignment();

-- BEFORE, so the open assignment can still be matched on visitor_id before the
-- foreign key sets it to null.
drop trigger if exists visitors_fob_assignment_delete on public.visitors;
create trigger visitors_fob_assignment_delete
  before delete on public.visitors
  for each row execute function public.sync_fob_assignment();


-- Backfill fobs that were already assigned before this table existed.
insert into public.fob_assignments (visitor_id, visitor_name, fob_id, assigned_at)
select v.id, v.full_name, v.fob_id, v.created_at
from public.visitors v
where v.fob_id is not null
  and not exists (
    select 1
    from public.fob_assignments a
    where a.fob_id = v.fob_id and a.unassigned_at is null
  );


-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- Writes happen only through the SECURITY DEFINER trigger above, so staff get
-- read access and nothing else. There is no path for the kiosk to touch this.
-- ----------------------------------------------------------------------------
alter table public.fob_assignments enable row level security;

drop policy if exists staff_read_fob_assignments on public.fob_assignments;
create policy staff_read_fob_assignments on public.fob_assignments
  for select to authenticated
  using (true);

revoke all on public.fob_assignments from anon;


-- ----------------------------------------------------------------------------
-- live_roster gains the car registration.
--
-- Appended rather than slotted in: CREATE OR REPLACE VIEW can only add columns
-- at the end. A fire warden reads this off paper to match people against
-- vehicles still in the car park, which is how you spot someone who left
-- without signing out.
-- ----------------------------------------------------------------------------
create or replace view public.live_roster
with (security_invoker = true) as
select
  l.id            as log_id,
  v.id            as visitor_id,
  v.full_name,
  v.company_or_relation,
  v.visiting_who,
  l.check_in_time,
  v.car_registration
from public.visit_logs l
join public.visitors v on v.id = l.visitor_id
where l.status = 'IN';


-- ----------------------------------------------------------------------------
-- visitors_admin — everything the visitor management table needs, in one read.
--
-- currently_in decides whether Unlink also signs someone out; visit_count tells
-- the delete confirmation how much history is about to go with the profile.
-- ----------------------------------------------------------------------------
create or replace view public.visitors_admin
with (security_invoker = true) as
select
  v.id,
  v.fob_id,
  v.full_name,
  v.company_or_relation,
  v.visiting_who,
  v.car_registration,
  v.created_at,
  exists (
    select 1 from public.visit_logs l
    where l.visitor_id = v.id and l.status = 'IN'
  ) as currently_in,
  (
    select count(*) from public.visit_logs l where l.visitor_id = v.id
  ) as visit_count
from public.visitors v;

grant select on public.visitors_admin to authenticated;
revoke all on public.visitors_admin from anon;
