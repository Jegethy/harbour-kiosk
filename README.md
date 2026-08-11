# Harbour Care Centre — Visitor Check-In

A visitor sign-in/sign-out system built around a 125kHz RFID fob reader.

| Route | Access | Purpose |
| --- | --- | --- |
| `/kiosk` | Open | Idle screen, sign in/out confirmations, first-time registration |
| `/kiosk/diagnostics` | Open | Reader validation: keystroke timings, buffer decisions, DB round trip |
| `/kiosk/preview` | Open | Design walkthrough with stand-in data — **delete before go-live** |
| `/admin` | Staff | Live fire roster, updated over realtime |
| `/admin/visitors` | Staff | All registered visitors, with Unlink Fob |
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

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run check:scanner` | Verify the fob scan timing rules (15 assertions, no browser needed) |

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

The kiosk endpoints under `/api/kiosk` are **not yet authenticated**. A
`KIOSK_DEVICE_TOKEN` check exists server-side, but the tablet has no way to send
the header — the kiosk fetches run in the browser, so the token would have to
ship in the JS bundle. **Setting that variable today makes every fob tap fail
with a 401.** See the open security item in [DEPLOYMENT.md](DEPLOYMENT.md) for
the two ways to close this properly.

## Fob capture

The reader is a keyboard emulator: on tap it types ~10 characters in a burst and
sends Enter. `src/lib/kiosk/scanner.ts` holds the buffering rules as pure logic
(no DOM), and `src/hooks/useFobScanner.ts` wires it to the page.

Point the real reader at **`/kiosk/diagnostics`** to validate hardware before
trusting it. That page shows the raw keystroke stream with inter-key timings,
what the buffer made of it, and optionally the database round trip.

After testing, pin `minLength`/`maxLength` in `DEFAULT_SCAN_CONFIG` to the exact
code width this reader emits. A tolerant range means a dropped character can
still pass validation and be looked up as the wrong fob.
