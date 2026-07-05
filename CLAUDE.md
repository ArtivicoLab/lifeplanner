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
  `BUILD_SHA` (from `VITE_COMMIT_SHA`, only set by CI — blank in local dev,
  that's expected).
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
- Sync (`sync.ts`): pull = batchGet all tabs → replace IndexedDB + stores. Push = full-tab
  overwrite (clear + write) per collection, debounced 2s after any mutation. Single-user
  last-write-wins. `connect()` creates the sheet + pushes local data on first link.

## Data flow for a mutation
store action → update in-memory state → `db.put(...)` (IndexedDB) → `useSync.touch()`
→ if connected, debounced `pushAll()` to Sheets; else flash "Saved".

## Conventions
- Match the surrounding code's style. New screens: `features/<name>/<Name>Screen.tsx`,
  add the `Route` to `router.ts`, an entry to `nav.tsx`, and a case in `App.tsx`.
- New persisted collection: add to `types.ts`, `schema.ts` (headers + serializers),
  `db.ts` (object store + `ALL_COLLECTIONS`, bump `DB_VERSION`), a store, `bootstrap.ts`
  (load + seed), and `sync.ts` (tabValues + pull).
- Icons: import from `components/icons.tsx`. Pickable icons live in `NAMED_ICONS`.
- Money via `ui.ts` `money()`. Category colors via `categoryColor()`.

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
