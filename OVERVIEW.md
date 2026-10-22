# Harbour Kiosk — what it is and how it works

An orientation document for someone encountering this repository for the first
time. It covers what the system is for, the shape of the code, how a visitor
tap travels from a plastic fob to a printed evacuation list, and the decisions
that are load-bearing enough that changing them would break something
important.

`README.md` is the quick-start; `DEPLOYMENT.md` is the go-live checklist. This
document is the explanation that sits underneath both.

---

## 1. The problem

Harbour Care Centre is a care home. When a visitor is in the building, somebody
has to know. Not for hospitality — for fire safety. If the alarm goes off, a
warden needs a sheet of paper naming every non-staff person inside, so they can
be accounted for in the car park.

The traditional answer is a paper book at reception, which fails in the usual
ways: people forget to sign out, handwriting is unreadable at 3am in the rain,
and the book itself may be inside the building you just evacuated.

This system replaces the book with a tablet in the lobby and a 125kHz RFID
keyfob per visitor. The visitor taps their fob on a reader to sign in, taps it
again on the way out, and the roster maintains itself. Staff get a live list in
a browser and a one-click print of it.

**Scope boundary:** this tracks *visitors*, not staff and not residents.
Visitors do not register themselves — a member of staff creates their profile
at the desk and hands them a fob.

---

## 2. The pieces

| Piece | What it is |
| --- | --- |
| **Lobby tablet** | An Android tablet in kiosk mode, browser auto-launched at `/`, never touched by anyone |
| **Fob reader** | A 125kHz EM4100-style USB/Bluetooth reader that behaves as a **keyboard** — on tap it types ~10 characters and presses Enter |
| **Keyfobs** | Dumb plastic tokens. Each carries a fixed code. They are reusable: unlink from one visitor, hand to the next |
| **The app** | Next.js 16 / React 19, running as a single Node process on a Windows machine |
| **The database** | A hosted Supabase (Postgres) project — tables, views, stored procedures, row-level security, realtime, and staff authentication |
| **Cloudflare Tunnel** | Publishes the app at `kiosk.harbourcare.co.uk`. Every route is reachable from the open internet |

The single most important thing to understand about the hardware: **the reader
is a keyboard.** There is no device driver, no serial port, no WebUSB. A fob
tap is indistinguishable from someone typing ten digits very fast and hitting
Enter. A large share of the client-side code exists to tell those two things
apart reliably — see §6.

---

## 3. The two faces of the app

### The kiosk — `/`

The whole hostname is the kiosk. The root route is the visitor-facing screen;
there is no navigation, no login, and nothing to tap other than a fob.

It is a four-state machine (`src/app/(kiosk-shell)/KioskClient.tsx`):

```
                 ┌──────── 4s ────────┐
                 │                    │
  idle ──tap──► working ──► result ───┘   "Welcome, Jane Smith"
   ▲             │   │                     "Signed out — goodbye"
   │             │   └────► unrecognised ──┘   red, "see reception"
   │             │
   │             └────────► error ──────────┘  7s, "could not record that"
   │
   └── offline screen replaces everything while the service is unreachable
```

Notes on the behaviour that aren't obvious from the diagram:

- **The scanner stays armed on every screen except `working`.** A second
  visitor walking up behind the first is not ignored while a confirmation
  counts down, and someone who tapped the wrong fob can immediately tap the
  right one.
- **An unrecognised fob is a dead end, not a form.** Earlier versions let
  visitors register themselves at the kiosk; that was removed. The kiosk now
  shows a red notice for four seconds and returns to idle.
- **Offline unmounts the whole flow** rather than showing a banner over it.
  Restoring the connection remounts a clean idle screen, so recovery needs
  nobody to walk over and touch the tablet, and there is no reset path to get
  wrong.
- **There is deliberately no offline queue.** A tap recorded locally and synced
  later could contradict the fire roster, and a roster that is confidently
  wrong is more dangerous than one that is honestly unavailable.

Supporting kiosk routes, all under `/kiosk/`:

| Route | Access | Purpose |
| --- | --- | --- |
| `/kiosk/setup` | Open (needs the setup code) | One-time device pairing |
| `/kiosk/diagnostics` | Staff login | Reader validation bench — raw keystrokes, buffer decisions, DB round trip |
| `/kiosk/preview` | Staff login | Design walkthrough with stand-in data; `DEPLOYMENT.md` says to delete it before go-live |

### The admin panel — `/admin`

Staff-facing, behind Supabase email/password auth.

- **`/admin` — the live roster.** Everyone currently signed in, oldest first,
  with who they are visiting, their car registration, and how long they have
  been here. A "Print evacuation list" button, and a connection pill that says
  whether the data is live.
- **`/admin/visitors` — visitor management.** Search, add a visitor, assign a
  fob by tapping it on a reader at the desk, unlink a fob, delete a profile.
- **`/admin/login`.**

---

## 4. Data model

Four objects matter. The full definitions, with reasoning, are in
`supabase/migrations/`.

### `visitors`

One row per person ever registered. `fob_id` is **nullable and unique** — the
combination is deliberate. Unlinking a fob sets it to `NULL` so the physical
token can be handed to the next visitor, and Postgres permits unlimited `NULL`s
under a unique constraint, so any number of visitors can sit fob-less without
colliding. Also carries `visiting_who` (which resident) and an optional
`car_registration`.

### `visit_logs`

One row per visit: `check_in_time`, `check_out_time`, and a status of `IN` or
`OUT`. Two guarantees are enforced in the schema rather than in application
code:

- A `CHECK` constraint keeps `status` and `check_out_time` consistent — `IN`
  implies no checkout time, `OUT` requires one.
- A **partial unique index** on `(visitor_id) WHERE status = 'IN'` makes two
  simultaneous open sessions for one person impossible. This is what makes the
  roster trustworthy: nobody can be in the building twice.

### `fob_assignments`

The audit trail of who held which physical token, and between which dates.
Maintained by a database **trigger** on `visitors`, not by application code —
`fob_id` changes through several paths (staff registration, the Register Fob
dialog, Unlink Fob, someone editing a row directly in the Supabase dashboard)
and a trigger is the only place that catches all of them.

Two details make it survive the thing it exists to record:

- `visitor_id` is `ON DELETE SET NULL`, not `CASCADE`.
- `visitor_name` is a **snapshot** taken at assignment time.

So after a visitor profile is deleted, the row still reads "this fob was held
by this person between these dates". A cascade would erase exactly the history
the table exists for.

The same trigger also refuses to delete a visitor who still holds a fob —
otherwise the physical token is left unaccounted for, with nobody recorded as
having it. That rule lives in the database, so it holds for the Supabase
dashboard too, not just the UI.

### Views

- **`live_roster`** — the evacuation list: open `visit_logs` joined to
  `visitors`.
- **`visitors_admin`** — `visitors` plus two derived facts the management table
  needs: `currently_in` (does Unlink also need to sign them out?) and
  `visit_count` (how much history a deletion would take with it).

Both are `security_invoker`, so the caller's row-level security applies rather
than the view owner's.

---

## 5. Security model

The threat model has two distinct attackers: **anyone standing in the lobby**
(the tablet is physically reachable by the public), and **anyone on the
internet** (every route is published through the tunnel).

### The tablet holds no database credentials

Row-level security denies the `anon` role every table. Nothing the tablet could
leak gives direct access to data. Instead, kiosk writes go through a Next.js
route handler at `/api/kiosk/scan`, which runs server-side with the
**service-role key** (which bypasses RLS) and exposes exactly one operation:
"here is a fob code, do the right thing".

Staff (`authenticated`) get full table access, which is what the dashboard
runs on.

### The kiosk endpoint is closed by device pairing

`/api/kiosk/scan` is a public write endpoint that alters the fire roster and
answers a valid fob with a visitor's name and the resident they are visiting.
It cannot stay open.

A shared secret header would have to ship in the JavaScript bundle to be usable
from a browser, which is no secret at all. Instead:

1. The tablet is set up once at `/kiosk/setup`, where staff type
   `KIOSK_SETUP_TOKEN`.
2. The server returns a long-lived (one year) **`httpOnly` cookie** that the
   browser then sends automatically. The secret never reaches client JS.
3. The cookie is an HMAC-signed, self-describing token — **not** a database row,
   so there is no lookup on the hot path.
4. `KIOSK_SETUP_TOKEN` doubles as the HMAC key. **Rotating it revokes every
   paired device at once**, which is the revocation mechanism.

Pairing **fails closed in production**: if `KIOSK_SETUP_TOKEN` is missing,
kiosk endpoints return 503 rather than quietly serving an open endpoint. In
development an unset token leaves the kiosk open so a fresh clone just runs.

A signed-in staff session is also accepted as a stronger credential than a
paired tablet — without that, the diagnostics page could not post a test scan
from a support laptop.

### Admin auth is enforced twice, on purpose

`src/proxy.ts` (Next 16 renamed the `middleware` convention to `proxy`)
refreshes the Supabase session and handles signed-in/signed-out redirects for
`/admin/*`. **It is not the authorisation boundary.** A matcher change or a
moved route can silently drop its coverage, and server actions are reachable by
anyone who can post to their endpoint, whatever form rendered them.

So every admin page and every server action calls `requireStaff()` for itself
(`src/lib/auth.ts`), which uses `getUser()` — revalidating the token with
Supabase rather than trusting a cookie.

### Other deliberate choices

- The login form returns an identical message for a wrong password and an
  unknown address, so it cannot be used to enumerate staff emails.
- `safeNext()` prevents the post-login `?next=` parameter becoming an open
  redirect.
- Baseline security headers (`frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.ts`. There is
  deliberately **no full CSP** yet — Next's inline bootstrap needs nonce
  plumbing, and a half-configured CSP that silently breaks the kiosk is worse
  than none.
- `/api/kiosk/pair` is rate-limited in memory (10 attempts / 15 min / IP).
  `DEPLOYMENT.md` recommends doing it properly at the Cloudflare edge as well.
- `src/lib/supabase/admin.ts` imports `server-only`, so any accidental import of
  the service-role client from a client component is a **build error** rather
  than a leaked key.

---

## 6. The scanner — the hard part

`src/lib/kiosk/scanner.ts` is pure logic: no DOM, no React, no browser APIs. It
turns a keystroke stream into discrete validated scan codes, and it is
deliberately isolated so the timing rules can be reasoned about and unit tested
(`npm run check:scanner`, 16 assertions, no browser needed).

It defends against four real failure modes:

| Failure | Defence |
| --- | --- |
| A partial read (fob dragged past the coil) leaves junk that would corrupt the *next* scan | **Burst splitting** — a gap longer than `maxInterKeyMs` starts a fresh burst and discards what was half-collected |
| A reader configured without an Enter suffix | **Quiet-flush** — a complete-looking buffer flushes after silence |
| A double-fire: a bouncy read, or the same tap arriving down two capture paths | **Dedupe window**, per-code |
| Stray human typing, if a keyboard is attached for support work | **Burst-duration ceiling** — ten keys at ~15ms is ~150ms; a human cannot approach that |

One decision is worth calling out because it was a real bug: **length is
validated only at flush time, never mid-burst.** An earlier version emitted as
soon as the buffer reached `maxLength`, which meant a garbled 16-character read
was accepted as its own first 12 characters — a valid-looking code belonging to
nobody, or worse, to someone else. A burst is now judged once complete, and an
over-long one is rejected whole.

Two relationships in `DEFAULT_SCAN_CONFIG` matter more than the absolute
numbers:

- `quietFlushMs > maxInterKeyMs`, otherwise a reader that stalls mid-burst gets
  flushed early and the tail of the code is lost — silently turning a known fob
  into an unknown one.
- `dedupeMs` matches how long a confirmation stays on screen (4s), so a visitor
  who taps again because they weren't sure it worked is not signed straight
  back out while their own "Signed in" message is still showing.

### Wiring it to the browser

`src/hooks/useFobScanner.ts` handles the parts that are specific to a tablet:

- **Two capture paths**, because either alone drops scans on real hardware. A
  window-level `keydown` listener in the capture phase is primary; the hidden
  input's `input` event is the fallback for Android routing a hardware keyboard
  through the IME (keydown arrives with `keyCode 229` and no usable `key`).
  They cannot double-count — the keydown path calls `preventDefault()`.
- **A focus watchdog.** The hidden input is kept focused through re-renders,
  screen wake, and stray taps, with retries because Android restores WebView
  focus asynchronously.
- **`inputMode="none"`** on that input, which holds focus *without* summoning
  Android's on-screen keyboard. A plain hidden input still raises it on some
  ROMs, and a keyboard covering the idle screen is what makes a kiosk look
  broken.

The same `ScanBuffer` is reused at the admin desk in
`src/components/admin/FobIdField.tsx`, scoped to one form field. There the
reader's digits simply type themselves in — what the buffer adds is swallowing
the trailing Enter (which would submit a half-filled form) and confirming on
screen that a genuine reader burst, not hand-typing, produced the value.

**Before go-live**, `DEPLOYMENT.md` requires pinning `minLength`/`maxLength` to
the exact code width the real reader emits, using `/kiosk/diagnostics`. A
tolerant range means a dropped character can still pass validation and be looked
up as a *different visitor's* fob.

---

## 7. A tap, end to end

1. A visitor taps a fob. The reader types `0012345678` and Enter.
2. `useFobScanner` captures the keystrokes; `ScanBuffer` judges the finished
   burst and emits an accepted code.
3. `submitScan()` POSTs `{ fob_id }` to `/api/kiosk/scan` with an 8-second
   timeout. **It never throws** — every failure path resolves to an `ERROR`
   outcome, so the kiosk always has something to show rather than a dead screen.
4. The route handler checks the device cookie (or a staff session), validates
   the field, and calls the Postgres function `handle_fob_scan(fob_id)` with the
   service-role key.
5. `handle_fob_scan` does the whole decision in **one atomic round trip**: look
   up the fob; if unknown return `UNKNOWN_FOB`; otherwise `SELECT ... FOR UPDATE`
   the open session so a double-tap cannot produce two writes; if one exists
   close it and return `SIGNED_OUT`, otherwise open one and return `SIGNED_IN`
   with the visitor's name and who they are visiting.
6. The route handler validates the shape of the reply and passes it through.
   Database detail is logged server-side; the tablet gets a message a visitor
   can act on.
7. The kiosk switches to the result screen, which shows the timestamp **the
   database recorded**, not the tablet's clock.
8. Supabase Realtime publishes the `visit_logs` change. The admin dashboard
   re-reads `live_roster` and the new row appears within a second or two.

The shared contract between the SQL function, the route handler and the UI
lives in one file (`src/lib/kiosk/outcomes.ts`) so the three cannot drift.

---

## 8. Reliability behaviour

This is a safety system, and much of the code is about being honest when things
are broken rather than looking fine.

**Connectivity** (`src/hooks/useConnectivity.ts`) uses two signals, because
neither is sufficient alone. `navigator.onLine` flips instantly when wifi drops
but only reports whether an interface exists — a tablet associated with an
access point that has lost its uplink reports online forever, which is exactly
the failure a care home actually sees. So there is also a heartbeat against
`/api/kiosk/health`, which checks Supabase rather than just answering 200;
from a visitor's point of view "the tablet lost wifi" and "the database is down"
are the same event. The poll tightens from 20s to 5s once degraded.

**The live roster** treats realtime as the primary path but never trusts it
alone. A dropped websocket on care-home wifi is ordinary, and a roster that has
quietly stopped updating is worse than no roster. So there is always a polling
backstop (60s healthy, 15s after a drop), and the connection state is displayed
on screen rather than hidden.

**The printed evacuation list** carries that honesty onto paper. The print
stylesheet strips every background, tint and shadow — this sheet may be carried
out of a burning building and read in poor light by someone who did not
generate it — and adds a masthead with the count and the print time. If the live
connection was lost, the printout says so in bold, with the time the data was
last confirmed. Column headings repeat on every page. Car registrations are
styled as number plates, because a warden is matching them against physical
vehicles in a car park.

---

## 9. Codebase map

```
src/
  app/
    (kiosk-shell)/          Route group: shared kiosk chrome without "kiosk" in the URL
      page.tsx              "/" — device gate, then KioskClient
      KioskClient.tsx       The kiosk state machine
      kiosk/setup/          Pairing — a plain HTML form, no hydration required
      kiosk/diagnostics/    Reader validation bench (staff)
      kiosk/preview/        Design walkthrough with stand-in data (staff)
    admin/
      (dashboard)/          Roster + visitor management, behind requireStaff()
      login/
      actions.ts            Every server action; each calls requireStaff() itself
    api/kiosk/
      scan/                 The one write endpoint the tablet uses
      pair/                 Exchange the setup token for a device cookie
      health/               Can we actually record a visit right now?
  components/kiosk/         Idle, result, notice, offline screens; logo
  components/admin/         Roster table, visitor table, dialogs, fob field
  hooks/                    useFobScanner, useConnectivity, useClock
  lib/
    kiosk/scanner.ts        Pure buffering logic — the heart of the reader handling
    kiosk/device.ts         HMAC device tokens
    kiosk/guard.ts          The API-route guard
    kiosk/outcomes.ts       Shared scan-outcome contract
    auth.ts                 requireStaff() — the authorisation boundary
    supabase/               Browser / server / service-role / session clients
  dev/                      DEV ONLY fob simulator — must be deleted before go-live
  proxy.ts                  Session refresh + /admin redirects (not the boundary)

supabase/
  migrations/               0001 schema+RLS+RPCs, 0002 car reg, 0003 fob history
  checks/0003_verify.sql    Self-cleaning assertions against a real database

scripts/
  check-scanner.ts          16 assertions on the timing rules, no browser
  check-logo.ts             Validates the logo file against the code that draws it
```

### Conventions worth knowing before you edit

- **Next 16.** The `middleware` convention is now `proxy`. Pages use the
  generated `PageProps<"/route">` / `LayoutProps<"/route">` types. `AGENTS.md`
  warns that this version differs from older Next and points at the docs bundled
  in `node_modules/next/dist/docs/`.
- **Tailwind v4, configured in CSS.** There is no `tailwind.config.ts`; the
  palette lives in an `@theme` block in `src/app/globals.css`, with measured
  contrast ratios recorded in the comment. One pair is documented as *failing* —
  brand red on brand maroon is 1.8:1 — which is why the idle screen's call to
  action is a cream disc holding a red icon rather than a red disc.
- **Comments carry reasoning, not description.** The existing code explains
  *why* a thing is the way it is, usually because the alternative was tried and
  broke something. Match that register.
- **Environment access is via functions, not module constants**
  (`src/lib/env.ts`), so `next build` does not throw on a machine without
  credentials.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | ESLint |
| `npm run check:scanner` | Verify the fob timing rules |
| `npm run check:logo` | Verify the logo file matches the brand colour and the crop constants |

`check-logo` is unusually thorough because the asset has gone wrong five
separate times — missing, a JPEG under a `.png` name, a background that had to
match the canvas, `next/image` re-encoding that background, and transparent
export margins that silently became layout. All five were invisible in the
source file and obvious on the screen.

---

## 10. Operating it

Full detail is in `DEPLOYMENT.md`; the headlines:

- **Environment:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server only, never `NEXT_PUBLIC_`),
  `KIOSK_SETUP_TOKEN` (server only, required in production).
- **Schema:** apply everything in `supabase/migrations/` in filename order. All
  migrations are idempotent and safe to re-run.
- **Supabase Auth:** disable public signups, create staff accounts by invite.
  Otherwise anyone can give themselves a staff account at `/admin`.
- **Pair the tablet once** at `/kiosk/setup`. `/` redirects there until it is.
- **Before go-live:** delete `src/dev/` (the fob simulator can create check-ins
  with no physical fob, and setting its flag to `false` only stops it
  *rendering* — the code is still in the client bundle), delete
  `/kiosk/preview`, and pin the scanner's code width.
- **Tablet:** Android lock-task mode, system keyboard disabled, display sleep
  off, browser auto-launching at `/` on boot, cookies persisted across reboots
  (clearing them means re-pairing).

### Known gaps, as recorded by the authors

- Signing in requires the network. Deliberate — see §3.
- Nothing prunes old visitor records. A retention period needs agreeing with
  whoever owns data protection: visitor names, who they visited, car
  registrations and a timestamped record of presence are all personal data, and
  the service is internet-facing.
- Deleting a visitor also deletes their visit history, which is the record of
  when they were in the building. The dialog says how many records will go.
  Their fob history survives.
- `fob_assignments` has no screen of its own. Query it directly for now.
- No full Content-Security-Policy yet.

### One documentation discrepancy

`DEPLOYMENT.md` describes `/kiosk/preview` as "unauthenticated". It is not —
`src/app/(kiosk-shell)/kiosk/preview/page.tsx` calls `requireStaff()`, matching
the table in `README.md`. The instruction to delete the route before go-live
still stands; only the stated reason is stale.
