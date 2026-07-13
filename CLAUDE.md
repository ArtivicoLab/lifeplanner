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
