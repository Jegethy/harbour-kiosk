# Deployment checklist — Harbour Care Centre visitor check-in

Work through this before the kiosk goes live in the lobby.

## Must do before go-live

- [ ] **Remove the fob hardware simulator.** It exists only because the reader
      was on order, and it can create check-ins without a physical fob.
      1. `rm -rf src/dev/`
      2. Delete the four `// DEV ONLY` lines it leaves behind:
         `grep -rn "@/dev" src/` finds both call sites.
      3. Remove `NEXT_PUBLIC_ENABLE_FOB_SIMULATOR` from every environment.
      4. `npm run build` — a clean build confirms nothing else referenced it.

      Setting the variable to `false` is enough to stop it **rendering** — the
      value is baked in at build time and every entry point checks it — but it
      does **not** remove the code. Verified: with the flag off the component
      and its strings are still in the client bundle. Deletion is the only
      thing that actually removes it.
- [ ] **Delete the `/kiosk/preview` route** (`src/app/kiosk/preview/`). It is a
      design walkthrough with stand-in data, kept for review only. It is
      unauthenticated and has no place in the lobby.
- [ ] **Add `public/logo.png`.** Until it exists the idle screen falls back to
      the wordmark set in type. The fallback is on brand, so this is easy to
      forget — check the real logo is showing.
- [ ] **Apply every migration in `supabase/migrations/`** in filename order
      (`supabase db push`, or paste each into the SQL Editor). All are
      idempotent and safe to re-run.
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
- [ ] An unrecognised fob shows the red "see reception" screen for 4 seconds and
      returns to idle. It must never prompt for registration.
- [ ] "Add new visitor" at `/admin/visitors` creates a profile, and tapping a
      blank fob into the Keyfob ID field fills it without submitting the form.
- [ ] A newly added visitor does **not** appear on the roster until they tap in.
- [ ] Adding a visitor with a fob already assigned to someone else is refused,
      and the message names the current holder.
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

`/api/kiosk/scan` is currently **unauthenticated**.
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

- Signing in requires the network. This is deliberate: a tap recorded locally
  and synced later could contradict the fire roster, and a roster that is
  confidently wrong is worse than one that is honestly unavailable. The kiosk
  detects the outage and shows "System offline — please see reception", then
  recovers on its own.
- The printed evacuation list does not include car registrations. Say if you
  want them — it is a column on the view and the print table.
- Nothing prunes old visitor records; see the retention item above.
