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
- [ ] **Do NOT set `KIOSK_DEVICE_TOKEN` yet — it will break the kiosk.**
      The server-side check exists, but the tablet has no way to send the
      header: the kiosk fetches run in the browser, so the token would have to
      be a `NEXT_PUBLIC_` value sitting in the JS bundle, which defeats it.
      Setting the variable today means every fob tap gets a 401.
      See "Open security item" below.
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

## Open security item

`/api/kiosk/scan` and `/api/kiosk/register` are currently **unauthenticated**.
Anyone who can reach the app can enumerate valid fob IDs (an unknown fob answers
differently from a known one) and sign people in and out at will, which corrupts
the fire roster.

If the app is only reachable on the care home's internal network, that is a
reasonable interim position. If it is on the public internet, it needs closing
before go-live. Options, cheapest first:

1. **Restrict by network** at the host or reverse proxy — an IP allowlist, or
   keep the deployment off the public internet entirely.
2. **Device handshake** — a one-time setup page where staff enter the token,
   which the server exchanges for an `httpOnly` cookie. The token never reaches
   client JavaScript, and the tablet stays authorised across restarts. Roughly
   an hour's work; ask and it will be built.

## Known gaps

- Registration requires the network. This is deliberate: a tap recorded locally
  and synced later could contradict the fire roster, and a roster that is
  confidently wrong is worse than one that is honestly unavailable. The kiosk
  detects the outage and shows "System offline — please see reception", then
  recovers on its own.
- Nothing prunes old visitor records; see the retention item above.
