# Harbour Care Centre — Visitor Check-In

A visitor sign-in/sign-out system built around a 125kHz RFID fob reader.

- `/kiosk` — unauthenticated, runs full-screen on a lobby tablet in kiosk mode.
- `/admin` — staff-only, Supabase Auth. Live fire roster and visitor management.

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

Set `KIOSK_DEVICE_TOKEN` in the environment to require an `x-kiosk-token`
header on kiosk endpoints. Without it those endpoints are reachable by anyone
who can reach the app, who could then enumerate fob IDs and sign people in and
out — which corrupts the fire roster. Leave it unset in development.

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
