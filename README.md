# Harbour Care Centre — Visitor Check-In

A visitor sign-in/sign-out system built around a 125kHz RFID fob reader.

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | Paired device | Idle screen, sign in/out confirmations, unrecognised-fob notice |
| `/kiosk/setup` | Open | One-time device pairing |
| `/kiosk/diagnostics` | Staff | Reader validation: keystroke timings, buffer decisions, DB round trip |
| `/kiosk/preview` | Staff | Design walkthrough with stand-in data — **delete before go-live** |
| `/admin` | Staff | Live fire roster, updated over realtime |
| `/admin/visitors` | Staff | Add new visitors, assign fobs, Unlink Fob |
| `/admin/login` | Open | Supabase Auth sign in |

See [DEPLOYMENT.md](DEPLOYMENT.md) before going live.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in from Supabase project settings
npm run dev
```

Apply the schema by pasting `supabase/migrations/0001_init.sql` into the Supabase
SQL Editor, or with `supabase db push`. It is idempotent.

In Supabase Auth settings, **disable public signups** — `/admin` accounts should
be created by invite only.

### Reaching the dev server through the tunnel

Next blocks cross-origin requests to dev-only assets, so `next dev` reached via
`kiosk.harbourcare.co.uk` refuses the client bundle and pages never hydrate.
`allowedDevOrigins` in `next.config.ts` permits that hostname; override with
`ALLOWED_DEV_ORIGINS` (comma-separated) for any other. It affects `next dev`
only — `next start` serves no dev resources.

For realistic tunnel testing prefer a production build:

```bash
npm run build && npm start
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run check:scanner` | Verify the fob scan timing rules (16 assertions, no browser needed) |
| `npm run check:logo` | Verify `public/logo.png` format, size and background match |

## Security model

The tablet sits in a public lobby, so it holds no database credentials. RLS
denies `anon` every table. Kiosk writes go through server route handlers under
`/api/kiosk` that use the service-role key, exposing exactly the operations a
kiosk needs. Staff (`authenticated`) get full access for the dashboard.

Admin auth is enforced in two places. `src/proxy.ts` (Next 16 renamed the
`middleware` convention to `proxy`) refreshes the session and handles the
signed-in/signed-out redirects, but it is not the boundary — a matcher change
or a moved route can silently drop its coverage, and server actions are
reachable by anyone who can post to their endpoint. So every admin page and
every action calls `requireStaff()` for itself.

The kiosk endpoints are protected by **device pairing**. The tablet is set up
once at `/kiosk/setup` with `KIOSK_SETUP_TOKEN`, and the server returns a
long-lived `httpOnly` cookie that the browser sends automatically — the secret
never reaches client JavaScript. `/api/kiosk/scan` requires it, or a staff
session.

The cookie is an HMAC-signed token rather than a database row, keyed on
`KIOSK_SETUP_TOKEN` itself. Rotating that variable revokes every paired device
at once, which is the revocation mechanism.

Pairing **fails closed in production**: if `KIOSK_SETUP_TOKEN` is missing, kiosk
endpoints return 503 rather than quietly serving an open endpoint. In
development an unset token leaves the kiosk open so a fresh clone just runs.

## Fob capture

Visitors do not register themselves. Staff create profiles at
`/admin/visitors`, assigning a fob by tapping it on a reader at the desk — the
same capture logic as the kiosk, scoped to one form field
(`src/components/admin/FobIdField.tsx`). An unrecognised fob at the kiosk shows
a red "see reception" notice and returns to idle.

The reader is a keyboard emulator: on tap it types ~10 characters in a burst and
sends Enter. `src/lib/kiosk/scanner.ts` holds the buffering rules as pure logic
(no DOM), and `src/hooks/useFobScanner.ts` wires it to the page.

Point the real reader at **`/kiosk/diagnostics`** to validate hardware before
trusting it. That page shows the raw keystroke stream with inter-key timings,
what the buffer made of it, and optionally the database round trip.

After testing, pin `minLength`/`maxLength` in `DEFAULT_SCAN_CONFIG` to the exact
code width this reader emits. A tolerant range means a dropped character can
still pass validation and be looked up as the wrong fob.
