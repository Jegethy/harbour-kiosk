-- ============================================================================
-- 0002_car_registration.sql
--
-- Visitors are now created by staff in the admin panel rather than registering
-- themselves at the kiosk.
--
-- Idempotent: safe to re-run.
-- ============================================================================

alter table public.visitors
  add column if not exists car_registration text;

comment on column public.visitors.car_registration is
  'Vehicle registration plate, if the visitor drove. Optional — many do not.';

-- ----------------------------------------------------------------------------
-- Retire kiosk self-registration.
--
-- register_visitor() was only ever called by /api/kiosk/register, which no
-- longer exists. Dropping it rather than leaving it in place: it is SECURITY
-- DEFINER, so an uncalled copy is standing privilege with no purpose. Staff
-- creating a visitor now insert directly, under RLS, as themselves.
--
-- handle_fob_scan() and unlink_fob() are unchanged and still in use.
-- ----------------------------------------------------------------------------
drop function if exists public.register_visitor(text, text, text, text);
