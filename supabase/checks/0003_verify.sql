-- ============================================================================
-- 0003_verify.sql — exercises the keyfob audit trail against a real database.
--
-- NOT a migration. Deliberately outside supabase/migrations/ so `db push`
-- never runs it.
--
-- Paste the whole file into the Supabase SQL Editor and run it. It creates
-- test rows prefixed "ZZ CHECK", asserts the trigger behaves, then deletes
-- them. If any step raises, Postgres rolls the whole block back and nothing is
-- left behind either way.
--
-- Send me the result table.
-- ============================================================================

create temp table if not exists fob_check (step text, outcome text);
truncate fob_check;

do $$
declare
  v_alpha uuid;
  v_bravo uuid;
  v_open  int;
  v_shut  int;
begin
  -- 1 -----------------------------------------------------------------------
  insert into public.visitors (full_name, visiting_who, fob_id)
  values ('ZZ CHECK ALPHA', 'ZZ CHECK RESIDENT', 'ZZCHECK-A1')
  returning id into v_alpha;

  select count(*) into v_open
  from public.fob_assignments
  where visitor_id = v_alpha and fob_id = 'ZZCHECK-A1' and unassigned_at is null;

  insert into fob_check values (
    '1. assigning a fob opens an assignment',
    case when v_open = 1 then 'PASS' else 'FAIL (' || v_open || ' open rows)' end);

  -- 2 -----------------------------------------------------------------------
  update public.visitors set fob_id = 'ZZCHECK-A2' where id = v_alpha;

  select count(*) into v_shut
  from public.fob_assignments
  where visitor_id = v_alpha and fob_id = 'ZZCHECK-A1' and unassigned_at is not null;

  select count(*) into v_open
  from public.fob_assignments
  where visitor_id = v_alpha and fob_id = 'ZZCHECK-A2' and unassigned_at is null;

  insert into fob_check values (
    '2. swapping the fob closes the old row and opens a new one',
    case when v_shut = 1 and v_open = 1 then 'PASS'
         else 'FAIL (closed=' || v_shut || ' open=' || v_open || ')' end);

  -- 3 -----------------------------------------------------------------------
  update public.visitors set fob_id = null where id = v_alpha;

  select count(*) into v_open
  from public.fob_assignments
  where visitor_id = v_alpha and unassigned_at is null;

  insert into fob_check values (
    '3. unlinking closes the assignment',
    case when v_open = 0 then 'PASS' else 'FAIL (' || v_open || ' still open)' end);

  -- 4 -----------------------------------------------------------------------
  insert into public.visitors (full_name, visiting_who, fob_id)
  values ('ZZ CHECK BRAVO', 'ZZ CHECK RESIDENT', 'ZZCHECK-B1')
  returning id into v_bravo;

  begin
    insert into public.visitors (full_name, visiting_who, fob_id)
    values ('ZZ CHECK CHARLIE', 'ZZ CHECK RESIDENT', 'ZZCHECK-B1');
    insert into fob_check values ('4. one fob cannot be held by two people', 'FAIL (allowed)');
  exception when unique_violation then
    insert into fob_check values ('4. one fob cannot be held by two people', 'PASS');
  end;

  -- 5 -----------------------------------------------------------------------
  begin
    delete from public.visitors where id = v_bravo;
    insert into fob_check values ('5. deletion refused while a fob is attached', 'FAIL (allowed)');
  exception when others then
    insert into fob_check values (
      '5. deletion refused while a fob is attached', 'PASS (' || sqlerrm || ')');
  end;

  -- 6 -----------------------------------------------------------------------
  update public.visitors set fob_id = null where id = v_bravo;
  delete from public.visitors where id = v_bravo;

  select count(*) into v_shut
  from public.fob_assignments
  where fob_id = 'ZZCHECK-B1'
    and visitor_id is null
    and visitor_name = 'ZZ CHECK BRAVO';

  insert into fob_check values (
    '6. history outlives the deleted visitor, name intact',
    case when v_shut = 1 then 'PASS' else 'FAIL (' || v_shut || ' rows)' end);

  -- 7 -----------------------------------------------------------------------
  select count(*) into v_open
  from information_schema.columns
  where table_schema = 'public' and table_name = 'live_roster'
    and column_name = 'car_registration';

  insert into fob_check values (
    '7. live_roster exposes car_registration',
    case when v_open = 1 then 'PASS' else 'FAIL' end);

  select count(*) into v_open
  from information_schema.columns
  where table_schema = 'public' and table_name = 'visitors_admin'
    and column_name in ('currently_in', 'visit_count');

  insert into fob_check values (
    '8. visitors_admin exposes currently_in and visit_count',
    case when v_open = 2 then 'PASS' else 'FAIL (' || v_open || ' of 2)' end);

  -- cleanup ------------------------------------------------------------------
  update public.visitors set fob_id = null where full_name like 'ZZ CHECK %';
  delete from public.visitors where full_name like 'ZZ CHECK %';
  delete from public.fob_assignments where fob_id like 'ZZCHECK-%';
end $$;

select * from fob_check;

-- Confirms the cleanup: both should be 0.
select
  (select count(*) from public.visitors where full_name like 'ZZ CHECK %') as leftover_visitors,
  (select count(*) from public.fob_assignments where fob_id like 'ZZCHECK-%') as leftover_history;
