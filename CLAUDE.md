# CLAUDE.md — Life Planner

Guidance for any AI agent (or human) working in this repo. Read this first.

## Git — never auto-commit or push
Do not run `git commit`, `git push`, or `git add` toward a commit unless the
user explicitly asks for it **in that same turn**. This repo is routinely
edited by more than one agent session at once — an unprompted commit can
silently sweep up and push another session's in-progress, unreviewed changes
together with yours. GitHub Pages deploys straight from `main` (see
`.github/workflows/deploy.yml`), so an unwanted commit can also mean an
unwanted production deploy. Build, typecheck, and test freely; leave the
working tree uncommitted for the user to review and push themselves. Being
asked to commit once does not carry over to later turns — ask again each time.

## Version control — always keep the version number real and visible
The app must always show a version number that actually reflects what's
deployed — no hardcoded placeholder strings, ever (a past bug had the Settings
footer hardcoded to a static `"v1.0"` that never changed).
- Version comes from `src/lib/config.ts`: `APP_VERSION` (from `package.json`'s
  `version` field, baked in via `__APP_VERSION__` in `vite.config.ts`) and
  `BUILD_SHA` (CI's `VITE_COMMIT_SHA` when set, else the local git HEAD via
  `__LOCAL_COMMIT_SHA__` in `vite.config.ts` — so the footer always shows a
  real, changing commit sha, even in local dev where `APP_VERSION` alone
  never moves).
- It's displayed in three places, all must stay wired to the real values:
  Settings screen footer, desktop `Sidebar.tsx` footer, and `PrivacyScreen.tsx`.
  If you add another place the version could show, pull from `config.ts` —
  never hardcode a version string anywhere.
- `.github/workflows/deploy.yml` auto-bumps the patch version to that run's
  `$GITHUB_RUN_NUMBER` before building (ephemeral, not committed back to the
  repo) so every real deploy shows a version number that visibly changed —
  don't remove that step.
- `main.tsx` actively checks the service worker for updates whenever the app
  regains focus (`visibilitychange`) and auto-reloads once a new worker takes
  control (`controllerchange`), so an installed/long-open PWA can't get stuck
  serving a stale cached build. Keep this behavior if you touch `sw.js` or the
  SW registration.
- Settings screen also has a manual "Check for updates" button for the user to
  force a refresh — keep it working if you touch that screen.

## What this is
A **static, phone-first PWA** that replaces the "ADHD Life Planner" spreadsheet
category sold on Etsy (reference: HeyMorning All-in-One Life Planner). It is the
*interface*; the user's own **Google Sheet is the database**. Runs fully offline
on-device (IndexedDB) and optionally syncs to Google Sheets.

## THE DATABASE IS THE USER'S GOOGLE SHEET — nothing else (must connect)
This is the product, not a nice-to-have. There is **no backend and no other
database**. The user's **Google Sheet is the single source of truth**; IndexedDB
is only an **offline cache** in front of it. Any persisted field must roundtrip
through `schema.ts` to a Sheet column, or it does not really exist.

**Connection is REQUIRED and currently NOT done.** As of this writing the app is
Sheet-disconnected:
- `src/lib/config.ts` → `LOCAL_MODE = true` (Google fully disabled), and
- there is **no `.env`** with `VITE_GOOGLE_CLIENT_ID`.

To actually connect (owner-only step — needs a real Google OAuth **Web** client ID
from Google Cloud Console; an AI agent cannot mint one):
1. Create the OAuth client, add authorized origins, copy the client ID.
2. `cp .env.example .env` and set `VITE_GOOGLE_CLIENT_ID=…`.
3. Flip `LOCAL_MODE = false` in `config.ts`, restart dev/build.
4. In-app: Settings → Connect Google → sync creates the sheet + pushes local data.
Until step 1–3 are done, treat local IndexedDB data as unbacked (a browser wipe
loses it). Connecting is a top-priority open task.

**Product principles (do not violate):**
1. No backend of ours — static hosting only (Netlify/Pages). No server code.
2. User data lives in the user's Google Drive via Sheets API (`drive.file` scope only).
3. Offline-first: everything works from the IndexedDB cache; sync when online.
4. Phone-first, designed at 390px — **but dashboard-first**, so desktop (≥900px,
   sidebar layout) must also look great. Many buyers use it on a computer.
5. ADHD-friendly = a design requirement: progress rings everywhere, low-friction
   capture, gentle overdue language ("N tasks need your love"), no notification firehose.
6. **Zero friction for buyers:** the app opens straight to the Dashboard (no
   onboarding gate) and auto-seeds sample data on first run so it looks alive.

## Owner preferences (learned — honor these)
- **No emojis in the UI.** Use icons only (lucide-react via `src/components/icons.tsx`).
- **Charts must be CSS/JS, not SVG and not a chart library.** Rings/donuts use CSS
  `conic-gradient`; bars/columns use flex divs. See `src/components/{ProgressRing,Charts}.tsx`.
  (recharts is in package.json but intentionally NOT imported — do not add it.)
- Icons should be a clean, simple standard set (lucide), not hand-drawn SVG paths.
- **Never use the native `window.confirm()`/`window.alert()`.** They render as the
  browser's raw unstyled system popup — on an installed PWA that looks like the app
  is broken, and it can't be themed for dark mode or match the rest of the UI. Use
  `confirmDialog({ title, message, confirmLabel?, danger? })` from
  `src/stores/useConfirm.ts` instead (`await`s a boolean, same call shape as
  `confirm()`) — it renders through the existing `BottomSheet` via `ConfirmHost`
  (mounted once in `App.tsx`). For non-blocking confirmations ("Task added"), use
  `useToast` (`src/stores/useToast.ts` + `<Toaster/>`) instead of `alert()`.

## Tech stack (fixed — do not substitute)
- Vite + React 18 + TypeScript, SPA, hash router (no react-router), deploys as static files.
- Hand-written CSS with design tokens (`src/styles/tokens.css`). No Tailwind, no UI kit.
- **Zustand** for state (one store per domain). **date-fns** for dates (all date math
  goes through `src/lib/dates.ts`). **idb** for IndexedDB. **lucide-react** for icons.
- Google: raw REST + Google Identity Services (no gapi client).
- Vitest for the pure logic (recurrence, budget, debt, schema). 34 tests currently green.

## Architecture map
```
src/
  lib/
    types.ts        domain types (v1 + v2)
    schema.ts       SINGLE SOURCE OF TRUTH for Sheet tabs/columns + row (de)serializers
    dates.ts        ALL date math (plain ISO yyyy-mm-dd; no times except Calendar events)
    recurrence.ts   THE recurrence engine — lazy materialization (see below)
    budget.ts       budget summary + carry-over math
    debt.ts         snowball/avalanche payoff simulation
    db.ts           IndexedDB (one object store per collection) + offline queue
    sync.ts         Sheets pull / push-all / debounced flush / connect
    google/
      auth.ts       GIS token client (drive.file scope)
      sheets.ts     REST wrapper: create / batchGet / writeTab (clear+update)
    ui.ts           category colors, priority colors, money/pct formatters
    sample.ts       first-run sample data (v1 + v2)
    config.ts       DB_NAME/VERSION, LOCAL_MODE flag
  stores/           zustand: useTasks, useHabits, useBudget, useSettings, useSync,
                    crud.ts (factory), v2.ts (goals/funds/debts/meals/grocery/
                    workouts/weight/hydration), bootstrap.ts (hydrate + seed + migrate)
  components/        ProgressRing, Charts, BottomSheet, Chip, Segmented, Checkbox,
                    HabitGrid, EmptyState, CountUp, TabBar, Sidebar, Header, icons.tsx
  features/<module>/ one folder per screen
  nav.tsx           SINGLE nav config consumed by Sidebar + More hub + TabBar
  router.ts         tiny hash router (Route union type lists every route)
  App.tsx           shell: Sidebar (desktop) + Header + <main> + TabBar (mobile)
tests/              recurrence / budget / debt / schema
```

## The recurrence engine (most important module)
`src/lib/recurrence.ts` — **lazy materialization**:
- `Recurrences` are templates; occurrences are computed, never pre-stored.
- `expandOccurrences(rec, windowStart, windowEnd)` is a PURE function.
- An occurrence becomes a real `Tasks` row only when it needs identity (completed,
  edited, reminder toggled). Materialized rows override the computed ones at that date.
- Editing one occurrence = materialize + edit that row only. Editing the series edits
  the `Recurrences` row; already-materialized past rows are never changed retroactively.
- Rules: month-end clamps (31→28/30), Feb 29→Feb 28, DST-safe (plain dates).
- **Any change here MUST keep `tests/recurrence.test.ts` green.**

## Google Sheet as database
- `schema.ts` defines every tab + column order. Row 1 is an app-written header.
- Records keyed by `id` (col A, nanoid) — NEVER by row position. Tolerate extra
  user columns, reordered/blank rows.
- v1 tabs: Tasks, Recurrences, Habits, HabitLog, BudgetPeriods, Money.
- v2 tabs (now built): Goals, Funds, Debts, Meals, Grocery, Workouts, WeightLog, Hydration.
- **Never use raw ASCII control characters (0x00-0x1F) as delimiters in anything that gets
  written to a Sheet cell — Google Sheets does not reliably preserve them.** `schema.ts`'s
  Goal `steps` checklist packs multiple steps into one cell and used to delimit them with the
  real Unit/Record Separator control chars (0x1F/0x1E) on the theory that a human never types
  them, so they're "safe." True for avoiding collisions with real step text, but Sheets
  silently strips them on write — confirmed 2026-07-13 by looking at an actual synced row: every
  step's id/text/done, and every step, were concatenated with nothing between them at all, an
  unreadable blob. This was invisible from inside the app because `pushDirty()`/tests only ever
  round-trip through IndexedDB, never actually through Sheets, so the corruption only shows up
  if you look at the raw cell content or `pull()` fresh from it after IndexedDB is gone (new
  device, cleared storage). Fixed by switching `STEP_FIELD_SEP`/`STEP_SEP` to the printable
  Unicode "control picture" glyphs (␟ U+241F / ␞ U+241E) instead — ordinary text Sheets stores
  byte-for-byte like anything else, while still being something nobody types by hand. Added
  `tests/schema.test.ts`'s "packed steps never contain a raw ASCII control character" test as a
  guard. **Any existing goal that already synced under the old encoding has corrupted step data
  sitting in the user's Sheet right now** — the new code only fixes future writes; it doesn't
  and can't retroactively repair already-mangled cells (the original field boundaries are
  unrecoverable once concatenated). **General rule: never assume a value round-tripping
  correctly through your own code proves it survives a THIRD PARTY'S storage layer** — test
  against what the external system (here, Sheets) actually returns, not just your own
  serialize/deserialize pair reversing cleanly in isolation.
- Sync (`sync.ts`): pull = batchGet all tabs → replace IndexedDB + stores. Push is
  **per-tab dirty tracking**, not a blind full-tab rewrite: every store's `touch(collection)`
  call marks only that collection's tab dirty (`COLLECTION_TAB` map), and the debounced
  `pushDirty()` (2s after the last mutation) writes only the dirty tabs, clearing each off
  the dirty set only once its write actually succeeds — a failed/rate-limited write leaves
  it dirty for the next flush instead of silently dropping it. `pushAll()` (all 16 tabs) is
  reserved for `connect()`'s first seed and the manual "Sync now" button. **Do not regress
  this to a blanket full-tab push on every touch** — a single edit doing 16 tabs × 2 calls
  (clear+write) trips Google's per-minute write quota during any busy session, and whichever
  tab sits late in `SYNC_TABS` (Workouts was 12th of 16) silently never gets written with no
  retry. This was a real bug that shipped and lost a buyer's data — see `touch()` call sites
  in `useTasks.ts`/`useHabits.ts`/`useBudget.ts`/`crud.ts` for the pattern when adding a new
  collection: always pass the collection so its tab, and only its tab, gets marked dirty.
  Single-user last-write-wins. `connect()` creates the sheet + pushes local data on first link.
- **`connect()`/`disconnect()` — the remembered spreadsheet ID (`lp.spreadsheetId`) must
  survive disconnect forever.** `disconnect()` used to delete it outright, so the next
  Connect click found nothing to relink to and silently created a BRAND NEW spreadsheet —
  a buyer's data ended up scattered across several sheets from repeated disconnect/
  reconnect (confirmed via 4 `CreateSpreadsheet` calls in the Cloud Console API metrics for
  one test account). Never remove `lp.spreadsheetId` in `disconnect()`. Instead there's a
  SEPARATE, opt-OUT flag (`lp.disconnected` — absence means connected) that disconnect sets
  and connect clears; see the next bullet for why it's opt-out and not opt-in.
- **Any new "are we in state X" flag must default to the OLD behavior for users who
  existed before the flag did.** An opt-in "active" flag (must be explicitly set to be
  true) that's only ever set inside `connect()` broke syncing for every already-connected
  session the moment it shipped — `isConnected()` started returning false for them with
  zero error, because nothing had ever set the new flag for their existing connection.
  Fixed by flipping it to opt-out (`lp.disconnected`, absence = connected) so an
  already-connected user with no flag at all is still correctly read as connected. Apply
  this to every future flag: ask "what happens to someone already mid-flow when this ships"
  before picking opt-in vs opt-out.
- **Mark irreversible/critical local state changes SYNCHRONOUSLY, before any slow async
  step, not after.** `disconnectAndClearDevice()` originally did a full Sheets push (up to
  16 tabs, several seconds) BEFORE flipping the "disconnected" flag. A page refresh during
  that window killed the whole async function before it ever reached the flag flip — the
  user correctly reported "disconnect just doesn't work if I refresh." Fixed by calling
  `sync.markDisconnected()` (a synchronous, first-line operation) before any `await`, so a
  refresh at any point afterward still leaves the device correctly disconnected, even if
  the trailing best-effort sync-then-wipe never finishes. General rule: whatever a user
  would consider "the actual action" must complete before the first `await` in its handler,
  everything after that is best-effort cleanup, not the action itself.
- **Google API errors need typed handling per status code, never a raw dumped message.**
  `sheets.ts`'s `ok()` throws different error CLASSES for 404 (`SheetNotFoundError` — the
  remembered sheet was deleted, safe to fall through and create a new one) vs 403
  (`SheetPermissionDeniedError` — the signed-in Google account has no access to the
  remembered sheet, almost always means the buyer picked a DIFFERENT Google account than
  the one that made their original sheet). A 403 must never be silently treated like a 404
  (would auto-create ANOTHER new sheet and hide the account mix-up) and must never just be
  displayed as raw `Sheets API 403: {...}` JSON (dead end, no recovery path — this is
  exactly what shipped before it was caught). Give the user an explicit choice instead: see
  `useSync.wrongAccount` + `useThisAccountInstead()` in `useSync.ts` and its rendering in
  `SettingsScreen.tsx`.
- The spreadsheet the app creates is always titled exactly `SPREADSHEET_TITLE` in
  `schema.ts` — keep this an EXACT match with the app's own brand name shown in the page
  title/manifest/header. A generic title like "Life Planner Data (app-managed)" reads as a
  mismatch to a buyer who expects to find a file called exactly what the app is called.
- **NEVER let background/unattended code fall back to an interactive (popup) Google token
  request.** `authedFetch`'s original fallback — silent refresh fails → automatically try
  `requestToken(scope, true)` — is fine for a click handler but a real bug for the debounced
  background push: a tab left open long enough for the ~1hr token to expire, then a silent
  refresh fails (e.g. no fresh Google session), triggers a popup with zero user gesture
  behind it. Browsers block that popup, GIS's callback then never fires, and the Promise
  just hangs forever with no error — background sync goes silently and permanently dead
  until the page is reloaded. Fixed via an `allowInteractive` flag threaded through
  `authedFetch`/`writeTab`: the background flush (`pushDirty`) always passes `false`, so a
  failed silent refresh throws `ReauthRequiredError` fast instead of hanging, `useSync`
  tracks `needsReauth`, and the Header's sync pill becomes a real "Tap to reconnect" button
  — only THAT click is allowed to open the popup. Any new code path that calls the Sheets
  API from a timer, retry loop, or other non-click context must pass `allowInteractive:
  false` and handle `ReauthRequiredError` the same way; never assume a background call can
  safely pop a Google sign-in window.
- **Nothing in the Sheets/auth chain may await unbounded.** Fixing the popup fallback above
  wasn't the whole fix — the sync pill could still get stuck on "Syncing…" forever from two
  OTHER unbounded awaits, found the same day: (1) the raw `fetch()` in `authedFetch` had no
  timeout, so a dropped connection or unresponsive server just hung with nothing to catch
  it — fixed with an `AbortController` + `FETCH_TIMEOUT_MS` (20s). (2) `requestToken()` in
  `auth.ts` had no timeout either — GIS's callback is not actually guaranteed to fire (a
  silent `prompt:"none"` request can just go silent forever under strict third-party
  cookie/storage blocking, not error, literally nothing) — fixed with
  `SILENT_TOKEN_TIMEOUT_MS` (10s) and `INTERACTIVE_TOKEN_TIMEOUT_MS` (45s — real sign-in
  with an existing Google session normally takes under 15s; kept well under a minute so a
  dead-end surfaces a clear message quickly instead of two minutes of silent "Syncing…").
  **General rule:** any `await` on a browser API, third-party SDK callback, or network call
  that doesn't document a guaranteed settle — especially anything reachable from a
  background/debounced path — needs an explicit timeout. Don't assume "it'll either resolve
  or reject eventually"; several of today's real, user-reported bugs were exactly a promise
  that did neither.
- **A blocked browser popup is a real, CONFIRMED cause in production (2026-07-13), not just
  a theoretical one.** Even a genuine, user-initiated click's interactive `requestAccessToken()`
  can get silently blocked by the browser (or the user dismissing an earlier blocked-popup
  notification, which some browsers remember as "always block" for that site) — GIS's
  callback then never fires, which is exactly what `INTERACTIVE_TOKEN_TIMEOUT_MS` bounds.
  When that timeout fires, the error message must name the actual likely cause, not just
  say "try again" — see the message in `requestToken()`'s timeout branch: *"Google sign-in
  didn't open — your browser may have blocked the popup. Look for a blocked-popup icon in
  the address bar, allow it for this site, then try again."* This is the single most useful
  line in the whole chain for a real buyer to self-diagnose without contacting support.
  It must also be SURFACED somewhere the user will actually see it, not just logged into
  `useSync.error` and left for someone to notice on the Settings screen — see
  `useSync.tapToRetry()`, which both Header's and Sidebar's sync pill call on click, and
  which shows a toast with the failure right where the user clicked.
- **`allowInteractive` must have NO default anywhere in the Sheets/Calendar/auth chain —
  every call site must consciously decide.** `pushAll()` originally had no `allowInteractive`
  param at all, so it silently always allowed a popup. It's reachable from the browser's
  `online` event (network reconnects) via `syncNow()`, which has nothing to do with a user
  click and can fire while the tab isn't even focused — that's exactly what surfaced as a
  Google popup appearing "while the window is not used" (confirmed 2026-07-13). Fixed by
  making `pushAll(allowInteractive: boolean)` a required param with no default, forcing
  every one of its 3 call sites to explicitly decide: `true` from `connect()` (real click,
  token's already fresh from an explicit interactive request earlier in that same chain),
  `false` from `disconnectAndClearDevice()` (a trailing best-effort backup must never
  surprise-popup after the user already confirmed disconnect), `false` from the `online`
  listener. **General rule:** never give an `allowInteractive`-style safety parameter a
  default value anywhere in this chain — an unnoticed default is exactly how this bug (and
  bug 5 above, the original `authedFetch` fallback) both shipped. Also: `calendar.ts`'s
  `authedFetch` had its OWN separate, never-fixed copy of the same interactive-popup
  fallback (reminders.ts's own doc comment calls reminder sync "fire-and-forget... never a
  reason to fail the save" — it must NEVER interactively prompt) — fixed to silent-only,
  always. And Sheets/Calendar shared ONE cached token slot for two DIFFERENT scopes, so
  requesting a Calendar token silently evicted a still-valid Sheets token and vice versa —
  any task/bill save with a reminder on ping-ponged between scopes, needing a fresh token
  (and thus a popup) on every single save. Fixed with a scope-keyed token cache
  (`tokenCache: Map<string, TokenState>` in `auth.ts`) instead of one shared slot. Finally,
  nothing stopped two pushes from running concurrently — a slow push plus more edits
  arriving mid-flight could start a second `attemptPush` racing the first, each
  independently requesting its own token — fixed with a `pushInFlight` guard in `sync.ts`.
- **Reauth must be checked PROACTIVELY, between edits, not only reactively at the moment a
  save needs a token.** Even with every bug above fixed, the reconnect prompt still only
  ever surfaced at the exact instant a push actually needed a fresh token — which is
  whenever a save happens to land, i.e. potentially mid-edit. Made worse by rapid editing:
  the debounced save timer (`scheduleFlush`, 2s) keeps getting pushed back by each new
  edit, so nothing was even checked until the user finally paused, at which point a
  backlog of queued work fired all at once — reported as "the popup seems to be lagging
  and just starts firing" (confirmed 2026-07-13). Fixed with `keepTokenWarm()` in
  `sync.ts`: a `setInterval` in `useSync.ts` (every 5 min) silently tops up the Sheets
  token whenever it has under `TOKEN_REFRESH_MARGIN_MS` (10 min) of life left — silent
  only, never opens a popup itself (see `tokenTimeLeftMs()` in `auth.ts`) — so a needed
  reconnect surfaces calmly on the sync pill BETWEEN actions instead of ambushing an
  in-progress save. **General rule:** for anything with a time-limited credential/session
  reachable from a critical user flow, don't just handle expiry reactively where it's
  needed — poll proactively so the failure mode is "surfaced calmly with notice" instead
  of "blocks the user at the worst possible moment."
- **The likely ROOT CAUSE behind most of the "popup all the time" reports above: the token
  cache was ONLY ever an in-memory `Map`, never persisted anywhere.** A page reload for
  ANY reason — the app's own service-worker auto-update reload on a new deploy (very
  frequent during an active dev session), a manual refresh, a backgrounded tab getting
  reclaimed — wiped a token that might still have had 40+ minutes of genuine validity
  left, forcing a full fresh sign-in from zero every time, even though the real Google
  token wasn't actually expiring that fast (confirmed 2026-07-13, after multiple earlier
  "fixes" to the failure UX didn't address this because the token really was being thrown
  away, not just handled badly on expiry). Fixed by mirroring `auth.ts`'s token cache into
  `sessionStorage` (`persistToken`/`getCached`/`forgetPersistedToken`) — survives a reload
  within the same tab/session, gone when the tab closes, same practical exposure as
  keeping it in a JS variable, but now a reload revives a still-valid token instead of
  discarding it. **General rule:** an in-memory-only cache for anything that legitimately
  outlives a single page load (a token, a session, warm computed state worth keeping) will
  get silently wiped by reloads more often than you'd expect, especially during active
  development with frequent deploys — if the reload frequency is unusually high some
  other reason (like today's deploy cadence), question whether the "expiry" you're
  debugging is real expiry or just a reload discarding something that didn't need to die.
- **REAL DATA LOSS BUG (confirmed 2026-07-13, fixed same day): `connect()`'s reconnect-to-
  an-existing-sheet branch called `pull()` with no push first.** `pull()` unconditionally
  REPLACES local IndexedDB with whatever's currently in the Sheet. If this device kept
  working (safely, in IndexedDB) through any stretch where the connection was stuck
  needing reauth, the Sheet is the STALE side, not the device — background pushes were
  failing that whole time. The moment reconnect finally succeeded, that `pull()` silently
  overwrote every change made while disconnected with the old Sheet content. Reported
  directly by a user: "once I signed back in everything was cleared although everything
  was still there while I was disconnected" — genuine, unrecoverable data loss (there is
  no backup/undo; `pull()`'s `replaceStore()` just clears and rewrites). Fixed: `connect()`
  now does `await pushAll(true)` BEFORE `await pull()` when relinking to an existing sheet
  — the fresh interactive token from earlier in the same function makes this push
  reliable, and it means local changes reach the Sheet first so the subsequent pull reads
  back a Sheet that already reflects this device's latest state instead of clobbering it.
  **General rule: any reconnect/resync path that can overwrite local state with remote
  state must push local's pending changes first** — a "sync" that only ever pulls is a
  data-loss bug waiting for the exact window where local raced ahead of remote, which a
  broken-then-restored connection makes far more likely, not less. `relink()` is the one
  legitimate exception — it's explicitly for a genuinely new device with nothing local to
  lose (see its own doc comment) — don't add a push there. Confirmed as the same live,
  unfixed bug in TrackerB and TrackerC's `connect()` too — see both apps' own CLAUDE.md.
- **The "no default on `allowInteractive`" rule (see the bullet above) had a second,
  quieter violation: `sheets.ts`'s `authedFetch`/`writeTab`, and everything built on top of
  them (`createSpreadsheet`, `getMeta`, `ensureTabs`, `batchGet`, plus `sync.ts`'s `pull()`,
  `writeMetaKey()`, `syncAccessCode()`), all defaulted the parameter to `true` instead of
  requiring it** (found 2026-07-13 while investigating a reported "Budget shows a popup,
  Calendar doesn't" — traced the full save path for both screens and found them byte-for-
  byte identical; this default was the one real loose end, though every current call site
  happens to sit inside `connect()`/`relink()` right after a genuine click, so it wasn't
  actively firing an unattended popup yet). Fixed by making `allowInteractive` a required
  param all the way down that chain, so TypeScript itself forces every future call site to
  decide instead of silently inheriting a popup-allowed default. **General rule: when you
  fix one function's dangerous default (see `pushAll` above), grep for every OTHER function
  in the same call chain that takes the same-shaped flag** — a partial fix leaves a
  same-species landmine one function away, just not triggered yet.
- **"Tap to reconnect" (the sync pill) didn't actually fix anything, while Settings' plain
  "Sync now" button did** (confirmed 2026-07-13, reported directly: "it only works with the
  syncing in the settings"). Root cause: `tapToRetry()`'s `needsReauth` branch called the
  full `connect()` chain (`requestToken` → `ensureTabs`/`getMeta` → `pushAll` → `pull` →
  `syncAccessCode`, four sequential API calls) — the right amount of work for a genuine
  first link or relinking after being disconnected a long time, but wildly overkill for the
  common "token just expired, tab sat open a while" case that `needsReauth` actually
  represents. Each of those four steps is its own independent chance to fail on something
  totally unrelated to auth (a blip, a rate limit, a slow response) and leave `needsReauth`
  stuck `true` with the UI still saying "tap to reconnect" for a reason that has nothing to
  do with reconnecting anymore. Settings' "Sync now" button, by contrast, only ever calls
  `syncNow()` → a single `pushAll(true)` — much less surface area, so it kept working even
  when the pill's heavier path didn't. Fixed with a new, deliberately minimal `reauth()` in
  `sync.ts` (`requestToken(SCOPE_SHEETS_AND_CALENDAR, true)` then `pushAll(true)`, nothing
  else) that `tapToRetry()` now calls instead of `connect()` for the `needsReauth` case;
  `connect()` itself is untouched and still used for Settings' actual "Connect Google" flow
  and real reconnects. **General rule: match the recovery action's weight to what actually
  broke.** A flag like `needsReauth` describes ONE specific failure (a stale token) — routing
  its retry through the same heavy multi-step function used for "connect from scratch" means
  every unrelated failure in steps 2–4 gets misattributed to step 1 and reported back as the
  same generic "tap to reconnect," which is genuinely hard to debug from the outside since
  the pill *looks* like it's doing the right thing and just silently doesn't work.
- **The `reauth()` fix for the bug directly above was ITSELF buggy (confirmed 2026-07-13, same
  day): it forced an interactive Google popup UNCONDITIONALLY, upfront, on every single "tap
  to reconnect" click, instead of trying a silent refresh first.** `reauth()` called
  `requestToken(SCOPE_SHEETS_AND_CALENDAR, true)` directly, bypassing the silent-first fallback
  that `authedFetch` (used by every OTHER successful path, including Settings' "Sync now") already
  does correctly. Reported directly: the sidebar/header pill's reconnect failed with "Google
  sign-in didn't complete. If a popup was blocked..." while Settings' plain "Sync now" kept
  working right next to it — because Settings has only ever called `syncNow()` → `pushAll(true)`,
  which tries silent first and only escalates to a popup if silent genuinely fails, so a still
  valid-but-uncached Google session reconnects with ZERO popup via that path, while `reauth()`'s
  path forced one every time regardless. Fixed by deleting `reauth()` entirely and having
  `tapToRetry()` just call `syncNow(true)` for BOTH the needsReauth and non-needsReauth cases —
  `syncNow` already resets `needsReauth` on success and already has the correct silent-first
  behavior, so the needsReauth branch was never actually necessary once `connect()`'s heavy
  chain was removed from it. **General rule: when replacing a buggy heavy path with a new
  lighter one, don't reflexively carry over that heavy path's OWN assumptions (like
  connect()'s deliberate "always interactive, upfront" pattern, which is correct ONLY for a
  genuine first-time connect where no valid token could possibly exist yet) — re-derive what
  the lighter path actually needs from first principles instead of copy-adapting the old one.**
  Also added: a one-time explanatory toast ("Your Google connection needs a quick refresh after
  being idle a while. Tap to reconnect, nothing was lost.") the FIRST time `needsReauth` flips
  true from a background/silent path (`flagNeedsReauth()` in `useSync.ts`, guarded to fire once
  per episode, not on every retry) — reported directly that buyers with no context "wont
  understand a thing" when the pill just silently changes to "tap to reconnect." Deliberately
  NOT fired from `syncNow()`'s own catch block, since that path is always a direct click and
  `tapToRetry()` already shows its own error toast right there — a second toast on top would be
  redundant noise at the exact moment the user is already looking at the failure.
- **Also found while investigating the bug above: a purely `setInterval`-based proactive
  check (`keepTokenWarm`, see the bullet above) is not reliable on its own for "left the tab
  open in the background for a while," which is exactly the scenario users described.**
  Browsers throttle timers in a backgrounded/hidden tab — a 5-minute interval can silently
  fire far less often than every 5 minutes once hidden, so a token can slip past
  `TOKEN_REFRESH_MARGIN_MS` with no proactive check ever catching it before the user returns
  and tries to do something. Fixed by also calling the same warm-up check on
  `visibilitychange` whenever the tab regains focus (`useSync.ts`), the same pattern
  `main.tsx` already uses for its service-worker update check — this catches up on whatever
  the throttled interval missed the instant the tab is actually usable again, before any
  save needs the token. **General rule: never rely on `setInterval` alone for anything that
  needs to happen close to on-time in a tab that might be backgrounded** — pair it with a
  `visibilitychange` (or `focus`) listener that does an immediate catch-up check.
- **`attemptPush()`'s retry-with-backoff loop kept retrying a `ReauthRequiredError` forever,
  every up-to-2-minutes, even though a silent retry can never succeed there — inconsistent
  with `keepTokenWarm()`'s OWN "don't re-hammer a known failure" rule (see its
  `alreadyNeedsReauth` guard, a few bullets up) which the retry loop never got the same
  treatment for.** Visible symptom: the sync pill flickering syncing → offline every couple
  minutes, indefinitely, while the tab just sat open and idle. Reported directly: "the app
  keeps trying to reconnect all the time while left alone for a while, let the user reconnect
  when disconnected." Root cause: the catch block rescheduled `retryTimer` unconditionally for
  EVERY failure type, including `ReauthRequiredError` — but unlike a genuinely transient
  failure (offline, rate limit, a blip, which really can self-resolve and are worth retrying),
  a failed silent token refresh will keep failing IDENTICALLY every time until the user
  actually does something; nothing about the underlying auth state changes just by waiting.
  Fixed by returning immediately after calling `onReauthRequired()` for that specific error
  type, without rescheduling — the next real push attempt now only ever comes from the user's
  own action: a new edit (`scheduleFlush()` already calls `clearRetry()` and starts a fresh
  attempt) or tapping "reconnect" (`tapToRetry()` → `syncNow()`, a fully separate call path).
  Every OTHER error type still retries with backoff as before. **General rule: when you fix
  "don't re-hammer a known failure" in one place (`keepTokenWarm`), grep for every OTHER
  automatic-retry loop touching the same failure state** — the exact same fix logically
  applies anywhere a retry can hit the identical un-recoverable-without-the-user condition,
  and missing one spot means the nagging just moves, it doesn't go away.
- **REAL DATA LOSS, second kind (confirmed 2026-07-13, same day as bug 12 above but a
  different mechanism): `pushAll()`'s trailing `dirtyTabs.clear()` could silently discard a
  dirty flag set by an edit that landed WHILE `pushAll()` was still mid-flight.** `pushAll()`
  writes all 16 tabs sequentially — for real accounts this can take several seconds. If the
  user edits something (confirmed with a Fund) while an earlier tab in that same sequence has
  already been written, the edit's `touch()` correctly re-marks its tab dirty — but then
  `pushAll()` finishes the whole loop and called a blanket `dirtyTabs.clear()`, wiping that
  fresh dirty flag even though `pushAll()` never actually wrote that specific change (its tab
  had already been written earlier in the pass, before the edit happened). The edit then
  vanishes from dirty-tracking entirely: nothing pushes it again until some unrelated later
  edit happens to touch the same tab, while the sync pill keeps reporting "Synced" the whole
  time. Reported directly: a Fund ("paycheck") existed correctly in the app and IndexedDB,
  sync showed "Synced," but the Sheet's actual Funds tab never got the row — only a
  differently-timed Fund ("Emergency Fund") made it through. Root-caused by reading
  `pushAll()`'s code, not by reproducing live. Fixed by moving `dirtyTabs.delete(tab)` INSIDE
  the loop, immediately after each tab's own write succeeds — matching `pushDirty()`'s
  already-correct per-tab-immediately-after-write pattern — instead of one blanket clear
  after all 16 finish. The only unsafe window this leaves is between a single tab's write
  resolving and its own delete running, which has no `await` in between, so nothing can race
  it in JS's single-threaded execution. **Immediate recovery for anyone hitting this before
  the fix ships:** a manual "Sync now" (Settings) does a full `pushAll` from current in-memory
  state regardless of stale dirty flags, so it picks up anything this bug silently dropped, as
  long as the data is still sitting in the local store (it doesn't fix data that's ALSO been
  lost locally). **General rule: any "clear all pending work" step at the end of a
  multi-step/multi-await operation must scope itself to exactly what it just did, not
  everything of that kind that exists** — a blanket clear silently swallows anything that
  became newly true again during the operation's own runtime, and the longer that operation
  runs (here: 16 sequential network calls), the wider and more likely-to-be-hit that window
  gets.
- **The Savings screen reused the "repeats every period" icon (the same `IconRepeat` used on
  Budget/Task rows) to mean something completely different: "this fund is linked to a Budget
  savings line."** Reported directly: a linked fund's badge read as "it has a recurring
  label" — exactly the confusion you'd expect from the same icon meaning two unrelated things
  in two places the user can see back to back. Fixed: a distinct `IconLink` (new export in
  `icons.tsx`, `Link2` from lucide) replaces it, and the card now also names the specific
  Budget line feeding it ("Fed by "X" in Budget") instead of an icon alone with no text.
  **General rule: never reuse an icon that already has an established meaning elsewhere in
  the app for a different meaning on another screen** — a user who's seen the icon mean one
  thing will read it that way everywhere, regardless of a differing `aria-label`/tooltip only
  a screen reader or hover ever surfaces.
- **Separately, a Fund and the Budget "saving" row linked to it (`fundId`) are two genuinely
  independent records with independent names by design** — the Budget row's name (e.g.
  "Vacation fund") does not have to match, and often won't match, the Fund's own name (e.g.
  "paycheck") shown everywhere on the Savings screen. This is not a bug, but it reads as one
  to a new user who expects one label to describe both the budget line and the goal card —
  worth explaining plainly if it comes up again, and worth remembering when designing any
  future UI here: always show which record you're looking at, don't assume the name alone
  disambiguates.
- **A Budget "debt" line had NO connection to a Debt Payoff entry at all — unlike "saving"
  rows, which already had `fundId`.** Reported directly: "we added debt in the budget but not
  showing in the debt payoff." `MoneyRow` simply had no field to link a debt-kind row to a
  `Debt`. Fixed by mirroring the exact `fundId`/Fund pattern: added `MoneyRow.debtId` (new
  Money tab column, `schema.ts`), a "Sync to a debt" picker in `AddMoneySheet` (only shown
  once at least one `Debt` exists, same gating `funds.length > 0` already used), and
  `syncDebtBalance()` in `useBudget.ts` alongside the existing `syncFundBalance()` — called
  from both `addMoney` and `updateMoney` whenever `actual` changes. **Direction matters and is
  the one real difference from funds: a debt payment REDUCES `currentBalance`
  (`Math.max(0, debt.currentBalance - actualDelta)`), the opposite of a savings contribution
  increasing a fund's balance** — get this backwards and a "payment" would make the debt grow.
  Also added the same "Fed by 'X' in Budget" link indicator (with `IconLink`, not
  `IconRepeat` — see the bullet above) to both `BudgetScreen.tsx`'s row subtitle and
  `DebtScreen.tsx`'s debt cards, so the connection is visible on both sides, not just
  functional. **General rule: when one Budget "kind" gets a Sheet-linking feature (`saving` ↔
  Fund), check every other kind with an equivalent standalone entity (`debt` ↔ Debt) for the
  same gap** — the two are structurally identical asks (a budget line vs. a tracked
  balance/goal) and users will reasonably expect the same capability on both once they've
  found it on one.
- **Once a Fund/Debt has a linked Budget line, its "Saved"/"Current" balance had TWO
  independent, silently coexisting write paths to the same number** — reported directly:
  "the emergency fund saved can be increased or decreased which does not even take into
  account the saving we entered in the budget." Path 1: `syncFundBalance()`/
  `syncDebtBalance()` (`useBudget.ts`) auto-adjusts the balance additively whenever the
  linked row's `actual` changes. Path 2: `FundSheet`/`DebtSheet`'s own "Saved"/"Current"
  input let you type ANY absolute value directly, completely bypassing path 1 with zero
  indication anywhere that the field was linked at all. Neither path knows about the other;
  nothing reconciles them. Fixed by locking that field (`disabled`, greyed out) plus an
  explanatory note ("Linked to 'X' in Budget... Log the amount on that line instead")
  whenever at least one Budget line links to that Fund/Debt — same lock applied to Debt
  Payoff's quick "− Payment"/"+ $50" chip buttons on the card itself, which were an even
  faster way to create the same silent divergence. A fund/debt with NO link stays freely
  editable (the legitimate case: an initial baseline, or savings/debt tracked outside
  Budget entirely). On save, the locked field's value is omitted from the patch entirely
  (not just disabled in the UI) so a stale snapshot from when the sheet opened can never
  overwrite a newer balance that synced in from Budget while the sheet was still open.
  **General rule: once two features are allowed to write the same value independently, that
  value needs either one single source of truth enforced in the UI (this fix), or an
  explicit, visible reconciliation step** — an editable field that "also happens to get
  updated elsewhere" with no visible connection is exactly how a live financial number
  quietly drifts from what a user actually logged, and it's very hard to notice until the
  numbers visibly disagree.
- **The Fund/Debt linking above was opt-in only (pick from a dropdown that only shows once a
  Fund/Debt already exists, created separately first) — which meant it did nothing for a real
  buyer's ALREADY-EXISTING Budget debt line.** Reported directly: "our first user still see
  this even when they have debt entered under budget," referring to Debt Payoff's "No debts
  tracked" empty state. Fixed two ways. (1) **Forward:** `addMoney()` now auto-creates AND
  links a matching Fund/Debt whenever a "saving"/"debt" row is added with no explicit link
  chosen and a non-blank name — no separate manual step needed; picking an existing one from
  the dropdown still works and skips the auto-create. (2) **Retroactive:** `backfillMoneyLinks()`
  in `bootstrap.ts`, run once per boot for real (non-demo) users right after `loadStores()`.
  Groups every unlinked "saving"/"debt" row by trimmed name (so the SAME recurring debt/goal
  spread across many past periods gets ONE Fund/Debt, not a duplicate per period), creates one
  matching entity per unique name, links every row in that group. Naturally idempotent — only
  ever touches rows where the link is still empty. Fund balances are seeded with the SUM of
  every linked row's `actual` (a reasonable "already saved" reading); Debt balances
  deliberately start at $0/0% APR since a payment total alone doesn't reveal the original
  amount owed — the backfill only guarantees the record EXISTS and is linked, the user still
  needs to fill in the real balance/APR for the payoff simulation to be meaningful. Verified
  live by seeding a raw unlinked row directly into IndexedDB (bypassing the app, simulating
  genuinely pre-existing data) and confirming it appeared correctly linked after a reload.
  **General rule: an opt-in linking feature does nothing for data that already existed before
  it shipped** — any fix of the shape "this record should have been connected to that one"
  needs a paired, correctly-deduped backfill, or existing users stay broken forever while only
  new data benefits.
- **The "lock Current once linked" fix (two bullets up) had NO escape hatch — a debt
  auto-created from Budget starts at `startBalance: 0`, and once linked, `currentBalance` was
  omitted from every save unconditionally, so there was literally no way to ever enter what's
  actually owed.** Reported directly: "when we add debt to the budget it all get[s] messed up
  in the debt payoff since we cant edit it there." Budget's `actual` only ever SUBTRACTS a
  payment delta (`syncDebtBalance`), it can never set an absolute starting amount, so a locked,
  never-initialized $0 debt was a genuine dead end, worse than the original silent-divergence
  bug the lock was fixing. Fixed with a one-time exception: while `startBalance` is still 0 (an
  untouched auto-created stub), editing "Start balance" also sets Current to match, live as you
  type, with the sheet explaining why. Once a real balance exists (`startBalance > 0`), it goes
  back to fully locked, so a later edit (fixing a name typo, say) never retroactively resets
  Current and erases tracked payments. **General rule: before locking a field to close ONE gap,
  check there's still at least one path left to reach every legitimate state** — a lock with no
  escape hatch just relocates the bug from "silently wrong" to "permanently stuck," which is
  worse, not better.
- **Separately, and more serious: the auto-created Debt's `minPayment` was a raw, unconverted
  copy of the Budget row's `budgeted` amount — but Debt Payoff's `simulatePayoff()` always
  treats `minPayment` as MONTHLY** (interest compounds once per loop iteration = one month).
  Budget periods can be Weekly, Biweekly, Monthly, Paycheck, or Custom. Reported directly: "the
  current balance in debt payoff is the monthly payment in budget or weekly it depends." A real
  $50/WEEK payment was silently fed in as if it were $50/MONTH, understating the true monthly
  commitment (~$217) by more than 4x, throwing off the projected payoff date and total interest
  with no warning anywhere. Fixed with `toMonthlyAmount(amount, cadence)` (new, pure, tested
  export in `budget.ts`): exact conversions for Monthly (×1), Biweekly (×26/12), and Weekly
  (×52/12), rounded to cents. Applied at both auto-create sites (`useBudget.ts`'s `addMoney()`
  and `bootstrap.ts`'s `backfillMoneyLinks()`), looking up the SPECIFIC period each row belongs
  to for its cadence, not just whatever period happens to be open right now. Paycheck and
  Custom are NOT converted; per `computePeriodRange()` (`budget.ts`) both are stored as a
  single placeholder day with no real recurring length to convert from, so guessing would be
  worse than leaving it as-is — the "Payment this period" tooltip for debt rows now says so
  explicitly, telling the user to double check the minimum for those two cadences. **General
  rule: any value that flows from a user-chosen-cadence Budget period into a strictly-monthly
  calculation (or vice versa) needs an explicit conversion at the boundary, keyed off THAT
  row's own period, not assumed to already be in the right unit** — this is exactly the kind
  of silent unit mismatch that produces numbers which are wrong but never throw an error.

- **`tabValues()` (the function that builds what gets written to a Sheet tab) used to read
  straight from this tab/window's in-memory Zustand store — which is a real, silent data-loss
  bug the moment the app is open in TWO tabs/windows on one device at once** (a normal
  pattern for an offline-first, no-login-gate app — e.g. the installed PWA icon plus a
  leftover browser tab, or two desktop tabs). Each tab hydrates its own in-memory copy once
  at boot and never learns about a sibling's edits (no `BroadcastChannel`/storage-event
  coordination anywhere). Since a push does a full `clear()` + rewrite of the whole tab,
  whichever tab happened to push LAST simply overwrote the Sheet with its own stale snapshot
  — silently erasing rows a sibling tab had already gotten onto the Sheet, with the sync pill
  showing "Synced" in both tabs the whole time and no error anywhere (confirmed 2026-07-14).
  Fixed by making `tabValues()` async and reading straight from IndexedDB (`db.all(collection)`)
  instead of the Zustand store. IndexedDB is genuinely shared across every tab/window on the
  same origin, so whichever tab happens to push now always pushes the current UNION of
  everyone's committed writes, with no cross-tab locking or messaging needed. This works
  because the 2s debounce (`scheduleFlush`) already gives a same-tab edit's fire-and-forget
  `db.put()` (see `crud.ts`) ample time to land before a push reads it back out. **General
  rule: for any state that must be correct across multiple tabs/windows of the same app, build
  the "what do I actually have" read off the shared durable store (IndexedDB, here), never off
  a single tab's own in-memory cache** — in-memory state is inherently per-tab and silently
  stale the moment a second tab exists, even with no bug in either tab's own logic.
- **The debounced background push resumed on boot RACED AHEAD of the store hydration it
  depended on.** `useSync.ts` used to resume a pending push (see `hasPendingPush()`/
  `LS_DIRTY_TABS` below) with a plain top-level `if (...) sync.attemptPush(...)` at that
  module's own eval time. But `useSync.ts` is imported (directly or transitively) by
  `bootstrap.ts`, so this synchronous code runs during the page's initial script evaluation —
  well before `bootstrap()`'s own async IndexedDB reads even start, since those only begin
  inside a `useEffect` in `App.tsx`, which only fires after React's first render. The resumed
  push read `tabValues()` off the stores' still-empty defaults and clear+overwrote the real
  Sheet tab with nothing but a header row — even though the real data was sitting untouched in
  IndexedDB the whole time, and it never got re-pushed once the (successful, but wrong) empty
  write cleared the dirty flag (confirmed 2026-07-14, real data loss). Fixed by moving the
  resume logic into an exported `resumePendingPush()` function in `useSync.ts` that is no
  longer called at module-eval time — `bootstrap.ts`'s `runBootstrap()` now calls it as the
  LAST line, after every store's `setAll()` has actually run. **General rule: a module's
  synchronous top-level code always runs before ANY `useEffect` anywhere in the app, no matter
  how "early" that effect looks in the source** — never let boot-time side effects that depend
  on async hydration live at module scope; gate them behind the same promise/callback the
  hydration itself resolves through.
- **Replaying the Coach Tour on a real (non-demo, connected) user swaps every store's data for
  fake sample rows via `loadSampleIntoStores()` WITHOUT ever flipping `isDemo()` true** — so
  `pushDirty()`/`pushAll()`'s existing `if (isDemo()) return` guard did nothing to protect
  against it. If a debounced push happened to be pending (or retrying) from an edit made just
  before opening the tour, it read the tour's temporary fake data and clear+overwrote the
  user's real, connected Sheet tab with sample rows — silently corrupting it, with no dirty
  flag left afterward to ever self-correct (confirmed 2026-07-14). Fixed with a new, separate,
  purely in-memory (never persisted) `syncSuspended` flag in `sync.ts` — `suspendSync()`/
  `resumeSync()` — checked alongside `isDemo()` in both push functions. `CoachTour.tsx` calls
  `suspendSync()` at every point it swaps in sample data for a real user and `resumeSync()` at
  every point it restores their real data, including its unmount cleanup (which React
  guarantees always runs). Deliberately a SEPARATE flag from `isDemo()`, not a reuse of it —
  `isDemo()` is a durable, persisted, per-account mode with its own lifecycle; this only needs
  to survive the current tab's runtime and exists purely to gate the push, not to change
  anything else the demo flag controls. **General rule: "temporarily show fake data in the
  stores" and "don't push what's in the stores right now" are two DIFFERENT concerns that
  happen to often go together — don't assume flipping one persistent flag (like `isDemo`)
  automatically covers a NEW, narrower case that only needs one of the two behaviors.**
- **A tab that doesn't exist yet on an already-connected user's spreadsheet (e.g. a collection
  added to `SYNC_TABS` in a later release than when they first connected) failed every write
  forever, AND — because the write loop had no per-tab isolation — that one broken tab
  starved every OTHER pending edit queued behind it in the same pass too**, since a thrown
  error aborted the whole loop instead of just that one tab (confirmed 2026-07-14). Fixed two
  ways: (1) both `pushAll`/`pushDirty` now call `ensureTabs()` on whatever tabs they're about
  to write, creating anything missing BEFORE the write loop — fixing the root cause, not just
  the symptom. (2) The shared write loop (`writeAllTabs()`) now isolates each tab in its own
  `try/catch`; a non-auth failure on one tab is remembered and re-thrown only after every OTHER
  tab in the pass has been attempted, so everything that CAN succeed still does, and only the
  genuinely broken tab stays dirty for the next retry. A `ReauthRequiredError` on ANY tab still
  aborts the whole pass immediately (the same token backs every call in the loop, so if the
  first one is dead, they all are, identically — no point burning through the rest). **General
  rule: a write loop over N independent things must isolate each item's failure from the
  others** — one bad item silently starving N-1 good ones is a much worse failure mode than
  the one bad item failing repeatedly on its own.
- **Nothing prevented `pushAll()` (Sync Now / `connect()` / `disconnectAndClearDevice()`) from
  running CONCURRENTLY with a background `pushDirty()` — the existing `pushInFlight` guard
  only ever wrapped `attemptPush()`'s own chain, so it did nothing for `pushAll()` called
  directly from anywhere else.** Two independent clear+write cycles against the same tab can
  resolve out of request order — whichever finishes SECOND can silently overwrite a NEWER
  write with an OLDER snapshot, and both sides independently clear the tab from `dirtyTabs`
  after their own "successful" write, so the newer edit is permanently dropped with no retry
  and no error (confirmed 2026-07-14). Fixed with a simple promise-chain mutex
  (`serialized()` in `sync.ts`) that both `pushAll` and `pushDirty` now go through — every
  call, regardless of which function or how many callers, waits for whatever's already running
  to fully settle before it starts. **General rule: a boolean "in flight" guard checked inside
  ONE function only protects that function's own re-entrancy — it does nothing for a sibling
  function that does the same underlying work through a different call path.** Any two
  functions that can both mutate the same external resource (here: a Sheet tab) need to share
  ONE serialization point, not each get their own separate guard.
- **`relink()` (the cross-device "paste a Sheet link/id" recovery path) never left demo mode
  before pulling — so on a brand-new device (which defaults to demo mode ON, exactly
  `relink()`'s own target scenario), the real Sheet data it pulled down showed in the UI for
  that session only and never actually persisted, then got silently wiped back to the fake
  sample on the very next reload, while the app still said "Connected" the whole time**
  (confirmed 2026-07-14). Root cause: `pull()`'s writes to IndexedDB are gated off while demo
  mode is on (see `db.ts`'s `demoMode` flag) — `connect()` already knew to flip demo off
  first; `relink()` was simply missing the same one-line fix. Fixed by mirroring `connect()`'s
  pattern exactly: `relink()` now checks `isDemo()` and calls `setDemoMode(false)` before
  `pull()`. **General rule: when two functions share the same precondition for correctness
  (here: "must not be in demo mode before touching IndexedDB"), a fix applied to one of them
  must be checked against every OTHER function with the same precondition** — `connect()` and
  `relink()` are structurally sibling entry points into the same sync system, and a fix to one
  is not automatically a fix to the other just because they call the same underlying `pull()`.

## Known bug patterns — watch for these (found in a full-app QA pass, 2026-07-14)
A dedicated end-to-end scan of every module surfaced 16 more confirmed bugs beyond the sync
layer above, now fixed. Grouped by the reusable PATTERN each one represents, since the same
shape of mistake is worth watching for anywhere similar code gets added later — not just in
the specific files listed.

- **A shared animation component (`CountUp.tsx`, `ProgressRing.tsx`) that hardcodes "animate
  FROM 0" instead of "animate from whatever is currently displayed" looks fine on first mount
  and is silently wrong on every update after that.** Both components' tween effects re-ran on
  every `value` change but always started the ease from a literal `0`, so bumping a number by
  a small amount (e.g. logging +250ml of water) visibly snapped the whole ring/counter back
  toward empty before re-animating up — on `ProgressRing` specifically, this hits nearly every
  screen (Hydration, Habits, Dashboard, Goals, Fitness, Savings, Debt). Fixed by tracking the
  currently-displayed value in a `ref` and animating FROM that ref's value TO the new target,
  only ever seeding the ref with a literal `0` on the component's initial mount. **General
  rule: any "animate to a new value" effect must capture the value actually on screen right
  now as its start point — re-deriving "from" as a constant inside an effect that re-runs on
  every value change is the same footgun twice, and it'll look identical in any THIRD chart/
  meter component built the same way later.**
- **An "Add X" `BottomSheet` form rendered unconditionally (no `if (!open) return null` guard,
  no reset effect keyed on `open`) silently carries its last-typed values into the next time
  it's reopened.** Found independently in `WeightScreen.tsx`'s `AddWeight` (a backfilled past
  date stuck around for the next real entry) and `FitnessScreen.tsx`'s `AddExercise` (a stale
  exercise name/muscle group saved a new entry under the wrong category) — same root cause,
  two different screens. `GroceryItemSheet` already had the correct pattern
  (`useMemo(() => { if (!open) return; setX(defaultValue); ... }, [open])`) and was the
  reference both fixes copied. **General rule: any bottom-sheet "Add" form needs its fields
  reset on the transition to `open`, not just at first mount** — check this explicitly for
  every existing Add sheet in the app (not just the two caught here) and for every new one.
- **`rec.active === false` means "fully paused, generate nothing, ever" in
  `expandOccurrences()` (`recurrence.ts`) — conflating that with "ended as of a date" silently
  destroys history, not just future occurrences.** `deleteRecurrence(id, "future")` ("End
  future occurrences, keep past") set BOTH `endDate` (correct) AND `active: false` (wrong) —
  since `expandOccurrences` early-returns `[]` the instant `active` is false, regardless of
  `endDate`, every already-materialized-but-uncompleted PAST occurrence vanished immediately
  too, contradicting the button's own label. Fixed by only setting `endDate`; `active` stays
  true, and `endDate`'s own windowing already correctly stops future generation on its own.
  **General rule: when a boolean flag and a date field can both express "this is ending," know
  exactly which one a given caller actually means before touching both** — `active` here means
  "does this series exist at all," `endDate` means "past this date, stop"; they are not
  interchangeable ways to say the same thing.
- **A falsy-zero bug: `Number(input) || fallback` treats a legitimately-entered `"0"` as if the
  field were empty.** `DebtScreen.tsx`'s `DebtSheet.save()` used exactly this pattern for
  Current balance — paying a debt down to exactly $0 and typing "0" silently reset it back to
  the full Start balance instead of saving 0, since `Number("0") || start` evaluates the
  fallback (0 is falsy in JS). Fixed by checking the raw input string for blank explicitly
  (`currentBalance.trim() === "" ? start : Number(currentBalance) || 0`) instead of relying on
  the parsed number's truthiness. **General rule: `x || fallback` is only safe when `0` (or
  `""`, `NaN`) is never a legitimate value for `x`** — for any numeric input where 0 is a real,
  meaningful answer (a paid-off balance, an empty inventory, a zeroed-out budget line), check
  the SOURCE string for blank, never the parsed number for falsiness.
- **`deleteMoney()` (a Budget line) removed the row without ever reversing the balance it had
  already applied to a linked Fund/Debt — `updateMoney()` correctly reverses/reapplies the
  delta on every `actual` change, but `deleteMoney()` was never given the same treatment.**
  Deleting a $200 linked "saving" line left the Fund permanently showing $200 saved for
  nothing, open to double-counting if a new line later links to the same Fund; same in reverse
  for a deleted debt-payment line understating what's owed. Fixed by calling
  `syncFundBalance(existing, -existing.actual)` / `syncDebtBalance(existing, -existing.actual)`
  before removing the row, mirroring the reversal `updateMoney()` already does. **General
  rule: whenever a mutation function (`update`) has to reverse-then-reapply a side effect on
  every change, its sibling deletion function needs the reverse half of that SAME logic** —
  `delete` is not exempt just because there's no "new value" to reapply.
- **A materialized recurring occurrence's `Due date` field in `TaskSheet.tsx` was editable but
  had NO visible effect (the app always displays the occurrence on its recurrence-computed
  `occurrenceDate`, never on `Task.dueDate`) — yet editing it still silently wrote `dueDate`
  and re-triggered a Calendar reminder sync at that invisible date.** Separately, converting a
  due-dateless task into a recurring series correctly fell back `anchorDate`/`occurrenceDate`
  to today, but forgot to apply that same fallback to the Task patch's own `dueDate`, leaving
  it blank and silently breaking its reminder (`reminders.ts` requires both `remind` AND
  `dueDate` truthy). Both fixed by keeping `dueDate` and `occurrenceDate` in sync at every
  write site instead of letting one silently diverge from the other. **General rule: when two
  fields on the same record are supposed to represent the same date in different contexts
  (display vs. reminder-sync, here), any code path that touches one must be checked for
  whether it also needs to touch the other** — a field a screen doesn't render is easy to
  forget still has OTHER consumers (a Calendar API call, in this case) reading it.
- **Category rename/remove in Settings only cascaded to Tasks/Recurrences — Budget (Money)
  rows use the exact same `settings.categories` list for their own picker and were never
  touched, so a renamed/removed category left Money rows permanently tagged with a stale,
  unpickable string** (no per-row category editor exists in `BudgetScreen.tsx` to fix it
  manually). Separately, removing the LAST category stamped orphaned rows with the literal
  string `"Other"` without ever adding `"Other"` back into the categories list itself, so it
  became an unpickable label too. Both fixed: `reassignTaskCategory` now also walks Money rows
  via `useBudget`, and the last-category fallback is saved into `categories` as a real entry,
  not just stamped onto rows. **General rule: when N different record types all read from ONE
  shared settings list (here: `categories`, consumed by Tasks, Recurrences, AND Money), a
  cascade/migration triggered by editing that list must be checked against EVERY consumer, not
  just the first one that comes to mind** — it's easy to fix the cascade for the type you're
  looking at and forget a sibling type reads the exact same source list.
- **Quick-capture's keyword/fuzzy matching was two separate bugs, both "too eager to match a
  weaker signal than intended."** (1) The grocery-detection regex's negative lookbehind (meant
  to stop "I ate the eggs" from being misfiled as a shopping-list add) only blocked the verb
  being IMMEDIATELY adjacent to the noun — any intervening word ("the", "my", "some") defeated
  it, so the exact phrasing the surrounding comment said was fixed still misfired. Fixed by
  widening the lookbehind to also skip an optional article/possessive. (2) An existing habit
  was matched by raw substring containment once the shorter name hit 3+ characters, so
  quick-capturing "habit: Run errands" silently toggled an unrelated pre-existing "Run" habit
  instead of creating a new one. Fixed by requiring an exact trimmed/lowercased match instead.
  **General rule: a fuzzy-match/regex heuristic meant to catch "close enough" input is exactly
  as dangerous as it is convenient — test it against the FULL space of phrasings a real user
  would type (articles, possessives, partial names), not just the one example in the comment
  explaining why it exists.**
- **Every open `BottomSheet` bound its own independent `document`-level Escape listener and
  independently set/cleared `document.body.style.overflow`, with zero awareness of another
  `BottomSheet` mounted underneath it** (e.g. a confirm dialog, via `useConfirm.ts`'s
  `ConfirmHost`, opened on top of an already-open edit sheet). Pressing Escape fired BOTH
  sheets' `onClose` at once (silently discarding an unsaved edit in the sheet underneath), and
  the inner sheet's cleanup unconditionally cleared body scroll lock even with the outer sheet
  still open. Fixed with a module-level stack of open-sheet ids: only the topmost sheet's
  Escape handler acts, and body scroll only unlocks once the stack is fully empty. **General
  rule: any global-scope side effect (a `document`-level listener, a `document.body` style
  mutation) registered by a component that can legitimately be NESTED inside another instance
  of itself needs to be stack-aware, not "one listener/lock per mounted instance, independently
  set and cleared."**
- **`useDueToday`'s memo omitted "what day is it" from its own dependency array** — it called
  `todayISO()` once inside the factory, so the memo never recomputed across a real midnight
  rollover unless `tasks`/`recurrences`/`goals`/`money` also happened to change, leaving
  Sidebar/TabBar/tab-title "due today" badges stuck on yesterday for a tab left open overnight
  (an explicitly-designed-for usage pattern — see `main.tsx`'s focus/visibilitychange
  handling). Fixed by making "today" reactive state, included in the memo's deps, refreshed on
  `visibilitychange` (the same trigger point `main.tsx` already uses for its own stale-tab
  problem). **General rule: "the current date/time" is an implicit, easy-to-forget dependency
  of ANY memoized calculation that's supposed to change at midnight with no other trigger** —
  if nothing else in the deps array changes at midnight, nothing will re-run at midnight either.
- **The daily-digest recurring Calendar event (`calendar.ts`) can silently fail to create
  whenever the configured digest time falls in the last 15 minutes of the day.** `addMinutes()`
  only wraps the hour-of-day modulo 24 and never advances the DATE, so a digest time like
  23:50 produced an `end.dateTime` of 00:05 on the SAME calendar date as `start` — an invalid
  (`end` before `start`) event body that Google's API rejects, silently swallowed by
  `reminders.ts`'s intentional `guard()`. Fixed by detecting the midnight wrap (comparing the
  zero-padded `HH:mm` strings lexicographically) and advancing the end date by one day when it
  occurs. **General rule: any helper that adds a duration to a time-of-day string and returns
  just another time-of-day string has silently dropped whatever date-rollover information the
  caller needs — if the caller then reuses the SAME original date for that computed end time,
  it will be wrong exactly at the boundary, which is precisely the case nobody manually tests.**
- **`detectPlatform()` (`useInstall.ts`) only matched the substring "ipad" in the user agent,
  but iPadOS 13+ Safari's DEFAULT user agent reports as desktop macOS Safari** (no
  "ipad"/"iphone"/"ipod" substring at all, unless the user manually changes a setting) — so a
  real iPad on default settings fell through to the "desktop" branch and showed Chromium-only
  `beforeinstallprompt` install guidance that doesn't exist in Safari, instead of the correct
  "tap Share → Add to Home Screen" flow. Fixed by adding the standard heuristic for this exact
  case: `navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1` (true only for a
  touch-capable device masquerading as desktop Mac). **General rule: never trust a raw
  substring check against `navigator.userAgent` for a platform that's known to actively
  disguise itself as a different one by default** — look up the platform's specific spoofing
  behavior (iPadOS-as-Mac is a well-known, long-standing one) rather than assuming the UA
  string honestly names the device.
- **Dashboard's Fitness card header badge and body could show contradictory information for
  the same day, because `restDay` and real workout entries are NOT mutually exclusive in the
  data model** — `FitnessScreen.tsx`'s `toggleRest()` lets a user mark today a rest day even
  when real workouts are already logged for that date, with no guard against it. The body
  already gave rest-day status priority (hides the workout list, shows only "Rest day"), but
  the header badge (`{done}/{total}`) was gated only on `todayWorkouts.length > 0`, independent
  of `todayIsRestDay` — so a "2/3" badge could sit directly above a body saying "Rest day"
  with the actual workouts nowhere visible. Fixed by also gating the badge on
  `!todayIsRestDay`, matching the precedence the body already established. **General rule:
  when two different pieces of UI derive from the same underlying state but were written at
  different times, check that they agree on which state takes priority when more than one
  condition can be true simultaneously** — the data model allowing a combination doesn't mean
  every place that reads it agreed on how to prioritize it.

## Data flow for a mutation
store action → update in-memory state → `db.put(...)` (IndexedDB) → `useSync.touch(collection)`
→ if connected, debounced `pushDirty()` pushes just that tab to Sheets; else flash "Saved".

## Conventions
- Match the surrounding code's style. New screens: `features/<name>/<Name>Screen.tsx`,
  add the `Route` to `router.ts`, an entry to `nav.tsx`, and a case in `App.tsx`.
- New persisted collection: add to `types.ts`, `schema.ts` (headers + serializers),
  `db.ts` (object store + `ALL_COLLECTIONS`, bump `DB_VERSION`), a store, `bootstrap.ts`
  (load + seed), and `sync.ts` (tabValues + pull).
- Icons: import from `components/icons.tsx`. Pickable icons live in `NAMED_ICONS`.
- Money via `ui.ts` `money()`. Category colors via `categoryColor()`.
- **Any "take the user to the thing they just did X to" action must carry that thing's id,
  not just a screen name.** Landing on a screen with no id/date context looks like it
  "didn't work" the moment there's more than one thing on that screen — e.g. the Calendar's
  quick-add toast's "View" button, or clicking an existing calendar entry, used to just
  `navigate("goals")`/`navigate("budget")` with nothing else; a task created for a future
  date landed on today's segment instead of the task itself. Pattern: pass `{ id }` (and
  `{ date }` when the target screen is day-based) via `navigate(route, query)`, then have
  the target screen check `routeQuery().get("id")` in a mount-only `useEffect` and open that
  exact item's editor (or switch to the right period/date + scroll + briefly flash the row
  if there's no modal editor — see `BudgetScreen.tsx`'s `.row--flash` for a screen with
  inline-only editing). See `capture.ts`'s `CommitResult.id` and `CalendarScreen.tsx`'s
  `openItem()` for the full pattern.
- **Never use the native `window.confirm()`/`window.alert()`** — see "Owner preferences"
  above. Use `confirmDialog()` (`src/stores/useConfirm.ts`) for yes/no gates and `useToast`
  (`src/stores/useToast.ts`) for non-blocking confirmations — both already built, reuse them.
- **`.btn--stack` (`base.css`) is `margin-bottom: 10px` — put it on the button ABOVE the gap
  you want, never on the button below.** It creates space AFTER itself, not before. Putting
  it on the second/lower button (e.g. a "Delete" button under "Save changes") does nothing
  visible, since there's nothing below it for that margin to push against — the two buttons
  end up touching with no gap (confirmed 2026-07-13, `HabitsScreen.tsx`'s edit sheet). When
  stacking two full-width buttons in a `BottomSheet` (a primary action + a secondary/danger
  one below it), the class goes on the FIRST button.

## Commands
```
npm install
npm run dev        # dev server (this project runs on port 5508)
npm test           # vitest — keep green before finishing a phase
npm run build      # static output in dist/; gzip budget ≤ 250KB (currently ~88KB)
npx tsc --noEmit   # typecheck (must be clean)
```

## Quality gates before calling a phase done
1. `npm test` green (recurrence, budget, debt, schema). 2. `tsc --noEmit` clean.
3. `npm run build` succeeds, initial JS ≤ 250KB gz. 4. No emojis in UI, no SVG/library charts.

## Status / roadmap
See `TODO.md`. Google Sheets sync code is complete but the app is **not connected
yet** — `LOCAL_MODE=true` and no `VITE_GOOGLE_CLIENT_ID`. Connecting is the
top-priority open task (see "THE DATABASE IS THE USER'S GOOGLE SHEET" above + README).
