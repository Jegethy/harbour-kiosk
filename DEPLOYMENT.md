# Deployment checklist — Harbour Care Centre visitor check-in

Work through this before the kiosk goes live in the lobby.

## Must do before go-live

- [ ] **Delete the `/kiosk/preview` route** (`src/app/kiosk/preview/`). It is a
      design walkthrough with stand-in data, kept for review only. It is
      unauthenticated and has no place in the lobby.
- [ ] **Add `public/logo.png`.** Until it exists the idle screen falls back to
      the wordmark set in type. The fallback is on brand, so this is easy to
      forget — check the real logo is showing.
- [ ] **Apply `supabase/migrations/0001_init.sql`** to the production project
      (`supabase db push`, or paste into the SQL Editor). It is idempotent.
- [ ] **Disable public signups** in Supabase → Authentication → Providers.
      Otherwise anyone can create themselves a staff account at `/admin`.
- [ ] **Create staff accounts by invite** in the Supabase dashboard.
- [ ] **Set `KIOSK_DEVICE_TOKEN`** in the environment and on the tablet.
      Without it, `/api/kiosk/scan` and `/api/kiosk/register` are reachable by
      anyone who can reach the app: they could enumerate valid fob IDs and sign
      people in and out, which corrupts the fire roster.
- [ ] **Pin the fob code width.** Open `/kiosk/diagnostics`, tap several fobs,
      note the exact character count, then set `minLength` and `maxLength` in
      `DEFAULT_SCAN_CONFIG` (`src/lib/kiosk/scanner.ts`) to that value. A
      tolerant range means a dropped character can still pass validation and be
      looked up as a different visitor's fob.
- [ ] **Serve over HTTPS.** Supabase Auth cookies and the realtime websocket
      both depend on it.

## Verify after deploying

- [ ] `/kiosk` reaches the idle screen with the logo and a ticking clock.
- [ ] A registered fob signs in, then signs out on a second tap.
- [ ] An unregistered fob opens registration; the in-app keyboard works and the
      native Android keyboard never appears.
- [ ] `/admin` redirects to `/admin/login` when signed out.
- [ ] The live roster updates within a second or two of a kiosk tap, and the
      connection pill reads "Live".
- [ ] Pull the tablet's network mid-tap: the kiosk shows the error screen and
      recovers, rather than hanging.
- [ ] Unlink a fob for someone currently signed in, and confirm they disappear
      from the roster.
- [ ] Confirm the anon key cannot read data directly — RLS should deny it:
      ```
      curl "$SUPABASE_URL/rest/v1/visitors?select=*" -H "apikey: $ANON_KEY"
      ```
      This must return an empty array or a permission error, never visitor rows.

## Tablet setup

- [ ] Lock to **portrait**. In landscape there is not room for three fields plus
      a keyboard at these touch-target sizes.
- [ ] Android kiosk / lock-task mode, with the status and navigation bars hidden.
- [ ] Disable the system keyboard if the launcher allows it — the app never
      needs it, and its microphone and settings buttons are a breakout route.
- [ ] Display sleep off, or long enough to cover the quietest part of the day.
- [ ] Auto-launch the browser at `/kiosk` on boot, so a power cut does not leave
      reception without sign-in.

## Ongoing

- [ ] Confirm Supabase automated backups are on. `visit_logs` is the record of
      who was in the building, and may be needed after an incident.
- [ ] Agree a retention period for visitor records with whoever owns data
      protection, and schedule deletion accordingly. Nothing prunes old rows today.

## Known gaps

- The fire roster is screen-only. There is no print or export, so an evacuation
  depends on someone carrying the tablet or a phone. Worth deciding whether that
  is acceptable before go-live.
- Registration requires the network. A fob tap during an outage cannot be
  recorded and is not queued for later.
