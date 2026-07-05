# Life Planner

A static, phone-first PWA that replaces the "ADHD Life Planner" spreadsheet category.
Built with Vite + React + TypeScript. No backend of ours — v1 runs entirely on-device
(LOCAL_MODE, IndexedDB). Google Sheets sync + Calendar reminders are the next phase and
plug into the same store/persistence layer.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # recurrence + budget + schema unit tests
npm run build      # static output in dist/
```

## Status

**Built (v1 local build):**
- Design system — Morning (light) + Midnight (dark) themes, iOS-native shell
- Hash router, bottom tab bar, sync status pill
- IndexedDB persistence with `LOCAL_MODE` flag + sample data seeding
- Recurrence engine (lazy materialization) + Vitest tests
- Zustand stores: tasks, habits, budget, settings
- Screens: Dashboard, Tasks (Smart Task Center), Calendar, Habits, Budget, Settings
- Progress rings (hand-rolled SVG), habit heat grid, bottom sheets
- PWA: manifest + service worker (app shell precache)

**Next phase (needs your Google Cloud OAuth client):**
- `src/lib/google/{auth,sheets,calendar}.ts` — GIS token client + Sheets REST + Calendar
- Sync queue flush to Sheets (offline queue already modeled)
- Onboarding sign-in flow

## Connect Google Sheets (optional)

The app runs 100% on-device by default. To back up / sync to a spreadsheet in the
user's own Google Drive, add an OAuth client ID — a one-time, **free** Google Cloud
setup (~5 min). Then the **Settings → Google Sheets → Connect** button lights up.

### One-time Google Cloud setup
1. Go to <https://console.cloud.google.com/> and create a project (any name).
2. **APIs & Services → Library** → enable **Google Sheets API** (and **Google
   Calendar API** later, for reminders).
3. **APIs & Services → OAuth consent screen** → User type **External** → fill app
   name + your email → add yourself under **Test users** (while unverified, only
   test users can sign in).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   Application type **Web application**. Under **Authorized JavaScript origins** add:
   - `http://localhost:5508` (dev — the port this project runs on)
   - your production origin (e.g. `https://yourdomain.com`) when you deploy
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

### Wire it in
```bash
cp .env.example .env
# edit .env and paste the client ID:
# VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
npm run dev
```
Restart the dev server after editing `.env`. Open **Settings → Google Sheets →
Connect Google Sheets**. The app creates a spreadsheet titled *"Life Planner Data
(app-managed)"* in your Drive, seeds it with your current data, and mirrors changes
on every edit (debounced). "Open my sheet" links straight to it.

**Scope:** only `drive.file` — the app can touch *only the sheet it creates*, nothing
else in your Drive. Going live for all users (not just test users) later needs Google's
consent-screen verification; not required to build or self-use.
