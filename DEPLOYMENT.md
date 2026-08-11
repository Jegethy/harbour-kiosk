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
- [ ] **Delete the `/kiosk/preview` route** (`src/app/(kiosk-shell)/kiosk/preview/`). It is a
      design walkthrough with stand-in data, kept for review only. It is
      unauthenticated and has no place in the lobby.
- [ ] **`public/logo.png` must be a real PNG with transparency.** The idle
      screen is a light canvas and the logo sits directly on it, so a JPEG
      saved under a `.png` name renders as a solid rectangle. Check with:
      ```
      node -e "console.log(require('fs').readFileSync('public/logo.png').subarray(0,4).toString('hex'))"
      ```
      `89504e47` is PNG. `ffd8ffe0` is JPEG — re-export it.
      If the file is missing the screen falls back to the wordmark in type,
      which is on brand and therefore easy to mistake for the real thing.
- [ ] **Apply every migration in `supabase/migrations/`** in filename order
      (`supabase db push`, or paste each into the SQL Editor). All are
      idempotent and safe to re-run.
- [ ] **Disable public signups** in Supabase → Authentication → Providers.
      Otherwise anyone can create themselves a staff account at `/admin`.
- [ ] **Create staff accounts by invite** in the Supabase dashboard.
- [ ] **Set `KIOSK_SETUP_TOKEN`** to a long random value:
      `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
      Required — kiosk endpoints refuse every request without it in production.
- [ ] **Pair the tablet** by opening `/kiosk/setup` on it once and entering that
      code. `/` redirects there automatically until it is paired.
- [ ] **Pin the fob code width.** Open `/kiosk/diagnostics`, tap several fobs,
      note the exact character count, then set `minLength` and `maxLength` in
      `DEFAULT_SCAN_CONFIG` (`src/lib/kiosk/scanner.ts`) to that value. A
      tolerant range means a dropped character can still pass validation and be
      looked up as a different visitor's fob.
- [ ] **Serve over HTTPS.** Supabase Auth cookies and the realtime websocket
      both depend on it.

## Verify after deploying

- [ ] `/` reaches the idle screen with the logo and a ticking clock.
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

- [ ] Lock the orientation so the idle screen cannot reflow unexpectedly.
      Either works now that registration has moved to the admin panel — the
      kiosk is a single centred column.
- [ ] Android kiosk / lock-task mode, with the status and navigation bars hidden.
- [ ] Disable the system keyboard if the launcher allows it — the app never
      needs it, and its microphone and settings buttons are a breakout route.
- [ ] Display sleep off, or long enough to cover the quietest part of the day.
- [ ] Auto-launch the browser at `/` on boot, so a power cut does not leave
      reception without sign-in.

## Ongoing

- [ ] Confirm Supabase automated backups are on. `visit_logs` is the record of
      who was in the building, and may be needed after an incident.
- [ ] Agree a retention period for visitor records with whoever owns data
      protection, and schedule deletion accordingly. Nothing prunes old rows today.

## Public hosting (Cloudflare Tunnel)

Deployed on a Windows server at home, published to `kiosk.harbourcare.co.uk`
through a Cloudflare Tunnel. Every route is reachable from the open internet, so
the checks below are not optional.

- [ ] **Confirm `/api/kiosk/scan` is closed.** From a machine that has never been
      paired:
      ```
      curl -si https://kiosk.harbourcare.co.uk/api/kiosk/scan \
        -H "Content-Type: application/json" -d '{"fob_id":"1234567890"}' | head -1
      ```
      Must be `401`. A `200` means anyone with the URL can alter the fire roster
      and read visitor names back out of it.
- [ ] **Put Cloudflare Access in front of `/admin`.** Free at this user count.
      Supabase Auth stays as the layer behind it; the point is that the login
      form is not reachable from the open internet at all.
- [ ] **Rate-limit `/api/kiosk/pair` and `/admin/login`** at the Cloudflare edge.
      The app limits pairing attempts in memory, but the edge is the better place.
- [ ] **The tablet's browser must persist cookies.** Pairing stores an `httpOnly`
      cookie; a kiosk browser set to clear data on exit will need re-pairing
      after every reboot.
- [ ] **Never expose the service-role key to the tunnel.** Server-side only, and
      never in a `NEXT_PUBLIC_` variable.
- [ ] Run the app as a Windows service so it survives reboot, and make sure the
      tunnel and the app come back in the right order.

Security headers (`frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`) are set in `next.config.ts`. There is deliberately **no
full Content-Security-Policy** yet: Next's inline bootstrap needs nonce
plumbing, and a half-configured CSP that silently breaks the kiosk is worse than
none. Worth adding as a follow-up, with the kiosk retested afterwards.

### Data protection

Visitor names, the resident they are visiting, and car registrations are personal
data, and the roster records who was in the building and when. Now that this is
internet-facing, agree a retention period with whoever owns data protection for
the home, and check the Supabase project region suits your obligations.

## Known gaps

- Signing in requires the network. This is deliberate: a tap recorded locally
  and synced later could contradict the fire roster, and a roster that is
  confidently wrong is worse than one that is honestly unavailable. The kiosk
  detects the outage and shows "System offline — please see reception", then
  recovers on its own.
- The printed evacuation list does not include car registrations. Say if you
  want them — it is a column on the view and the print table.
- Nothing prunes old visitor records; see the retention item above.
