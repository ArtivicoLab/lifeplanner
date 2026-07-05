# TODO — Life Planner

Running status board for AI agents / humans. Keep this current.
Last updated: 2026-07-03.

## ✅ Done
- Scaffold: Vite + React 18 + TS, hash router, PWA (manifest + service worker + icons).
- Design system: tokens (Morning light / Midnight dark), HeyMorning pink→periwinkle
  gradient, iOS-native shell. Responsive: bottom tabs on phone, **left sidebar ≥900px**.
- Icons: lucide-react set (`components/icons.tsx`). **No emojis anywhere.**
- Charts: CSS only — `ProgressRing` (conic-gradient), `Charts.tsx` (Donut/Bars/Columns).
  No SVG charts, no chart library.
- Persistence: IndexedDB (`db.ts`, DB_VERSION=3), one store per collection, offline queue.
- Zero-friction boot: opens on Dashboard, auto-seeds sample data (v1 + v2), `seedV2IfMissing`
  migration tops up v2 samples for pre-v2 users.
- **Recurrence engine** + tests (lazy materialization, clamps, leap year, DST). 18 tests.
- Stores: tasks, habits, budget, settings, sync + CRUD factory + v2 stores.
- **v1 screens:** Dashboard, Tasks (Smart Task Center), Calendar (month/week), Habits, Budget.
- **v2 screens (full 19-tab parity):** Goals, Savings/Sinking Funds, Debt Payoff
  (snowball/avalanche), Meal Planner, Grocery (auto-generated + categorized), Fitness,
  Weight (imperial/metric + BMI + trend), Hydration, Time Blocking, More hub.
- **Meal Setup** (recipe library — plan meals from saved recipes) + library picker in Meal Planner.
- **Recurring Task Schedule** screen — every series with its upcoming occurrences,
  "edited" badges on materialized variations, per-occurrence edit, pause/resume, delete future/all.
- Multi-participant `assignee` field on tasks/recurrences (owner added).
- Budget math + Debt payoff math + schema roundtrip tests. **34 tests total, green.**
- Google Sheets sync layer: `google/auth.ts`, `google/sheets.ts`, `sync.ts` (pull/push/
  connect/disconnect) + Settings UI. Mirrors all 15 collections to their tabs.
- **Customizable mobile bottom bar**: pin/unpin/reorder tabs in Settings ("Bottom bar"
  section), persisted as `settings.tabBarRoutes`; More is always the fixed catch-all.
  The bar scrolls on the x-axis so it isn't capped at a handful of items, and now shows
  the PWA icon as a brand mark, both in the tab bar (mobile) and the sidebar (≥900px).
- Docs: README (incl. Google Cloud setup), CLAUDE.md, this file.
- **Calendar reminders**: `google/calendar.ts` (all-day event create/update/delete + daily
  digest RRULE, mirrors `sheets.ts`'s fetch/retry style) + `reminders.ts` (pure
  `decideReminderAction` + best-effort `syncTaskReminder`/`syncBillReminder`/`syncDailyDigest`,
  no-op when not connected, errors swallowed). Wired into `useTasks`/`useBudget`
  `add*`/`update*` via a loop-safe `setCalendarEventId` setter; daily digest wired into
  `useSettings.update` on `digestTime` change only (keeps the `calendar.events` scope
  request lazy — never fired at boot or at Sheets-connect time). New `settings.digestEventId`
  field (local-only, not a synced Sheet tab). **`tests/reminders.test.ts`, 17 tests.**

## 🔧 Needs the owner (not a code task)
- **GitHub source URL for the Privacy screen.** The Privacy tab has a "Check the
  source on GitHub" button that's disabled until the repo is public. Once the repo is
  live, set `GITHUB_URL` in `src/lib/config.ts` (and optionally `COPYRIGHT_HOLDER`) —
  the button then activates automatically. Owner will provide the link.
- **Google OAuth client ID.** Create it in Google Cloud (Sheets API + OAuth consent,
  test users, Web client with origin `http://localhost:5508`). Put it in `.env` as
  `VITE_GOOGLE_CLIENT_ID=…`, restart dev. Then Settings → Connect Google Sheets works.
  Sync code is done and type-clean but UNTESTED against live Google (no client ID yet).
- To sell to the public (not just test users), publish/verify the OAuth consent screen.

## 🔜 Next / backlog (prioritized)
1. **Verify Google sync end-to-end** once a client ID exists (create sheet, push, pull,
   401 refresh, offline queue, 404 relink). Add smoke coverage.
2. **Charts on Dashboard/Task tracker**: status/category/priority donuts + priority-by-
   category bars using `Charts.tsx` (CSS) to match the reference's "money shot."
3. **Swipe gestures** on mobile task rows (right = complete, left = edit/delete).
4. **Coach-mark tour** (3 steps, dismiss forever) — spec §6.7; currently skipped.
5. **Multi-participant / household** (reference shows "up to 9 users"): assignee field on
   tasks, participant switcher already partly in Weight. v2.5 per spec (needs Drive sharing).
6. **Meal→time granularity, Time Blocking with real time slots** (tasks currently have no
   time field; add optional `startTime` if we want true blocking).
7. **Debt schedule chart** (months-to-debt-free column chart) + per-debt payoff dates UI.
8. Lighthouse pass: Perf ≥90, A11y ≥95, PWA installable. Screen-reader labels on rings/grids.
9. Playwright smoke test for the offline kill-switch scenario (spec §10.5).
10. **Reminder cleanup on delete**: `deleteTask`/`deleteMoney`/`deleteRecurrence` don't yet
    cancel a lingering Calendar event (calendar reminders only wired into add/update).
    Low risk (orphaned event, no crash) but worth closing.

## ⚠️ Gotchas / notes
- `recharts` is in package.json but MUST NOT be imported (owner wants CSS/JS charts).
- Charts must not use SVG (owner preference). Rings/donuts = conic-gradient.
- Push is full-tab overwrite (simple + safe for single user). If multi-device sync is
  added later, move to row-granular `updatedAt` merge (schema already stores `updatedAt`).
- DB_VERSION is 2. Adding a collection = bump it + add the object store in `db.ts` upgrade().
- Dashboard-first: always check the ≥900px sidebar layout, not just 390px.
- Dev server runs on **5508** for this project (not Vite's default 5173).
