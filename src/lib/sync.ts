// Sync layer (spec §8). Bridges the local IndexedDB stores and the user's Google
// Sheet. v1 is single-user: we mirror each collection to its own tab. Reads pull
// the whole sheet; writes are local-first, then a debounced full-tab push
// (last-write-wins by the device that saved most recently — safe for one user).

import * as db from "./db";
import {
  HEADERS,
  SPREADSHEET_TITLE,
  TAB,
  V2_TABS,
  debtToRow,
  fundToRow,
  goalToRow,
  groceryToRow,
  habitLogToRow,
  habitToRow,
  hydrationToRow,
  mealToRow,
  moneyToRow,
  periodToRow,
  recipeToRow,
  recurrenceToRow,
  rowToDebt,
  rowToFund,
  rowToGoal,
  rowToGrocery,
  rowToHabit,
  rowToHabitLog,
  rowToHydration,
  rowToMeal,
  rowToMoney,
  rowToPeriod,
  rowToRecipe,
  rowToRecurrence,
  rowToTask,
  rowToTimeBlock,
  rowToWeight,
  rowToWorkout,
  taskToRow,
  timeBlockToRow,
  weightToRow,
  workoutToRow,
} from "./schema";
import {
  batchGet,
  createSpreadsheet,
  ensureTabs,
  ReauthRequiredError,
  SheetNotFoundError,
  SheetPermissionDeniedError,
  writeTab,
} from "./google/sheets";
export { ReauthRequiredError, SheetPermissionDeniedError };
import { forgetToken, requestToken, SCOPE_SHEETS, SCOPE_SHEETS_AND_CALENDAR, tokenTimeLeftMs } from "./google/auth";
import { isValidAccessCode } from "./access";
import { isDemo } from "./demo";
import { useSettings } from "../stores/useSettings";
import { useTasks } from "../stores/useTasks";
import { useHabits } from "../stores/useHabits";
import { useBudget } from "../stores/useBudget";
import {
  useGoals,
  useFunds,
  useDebts,
  useMeals,
  useGrocery,
  useWorkouts,
  useWeight,
  useHydration,
  useRecipes,
  useTimeBlocks,
} from "../stores/v2";
import type {
  BudgetPeriod,
  Debt,
  Fund,
  Goal,
  GroceryItem,
  Habit,
  HabitLogEntry,
  HydrationEntry,
  Meal,
  MoneyRow,
  Recipe,
  Recurrence,
  Task,
  TimeBlock,
  WeightEntry,
  Workout,
} from "./types";

const LS_ID = "lp.spreadsheetId";
// Separate from LS_ID on purpose: LS_ID is kept forever once a sheet exists (so
// a later connect() always relinks to the SAME sheet — see connect()'s doc
// comment). LS_DISCONNECTED is the only thing disconnect() sets. Without this
// split, disconnect() used to delete LS_ID outright, so the next Connect click
// found no "existing" id and created a BRAND NEW spreadsheet instead of
// relinking — a buyer's data ended up scattered across several sheets on
// repeated disconnect/reconnect. Never remove LS_ID in disconnect() again.
//
// This is an opt-OUT flag (absence = connected), not opt-in, on purpose: an
// opt-in flag that only gets set inside connect() silently broke syncing for
// anyone already connected before that flag was introduced — isConnected()
// started returning false for them with zero error, because nothing had ever
// set the new flag for an existing session. Opt-out is migration-safe: an
// already-connected user with no flag at all is correctly still connected.
const LS_DISCONNECTED = "lp.disconnected";

/** Accepts a raw spreadsheet id or a full Google Sheets URL and returns the id. */
export function extractSpreadsheetId(idOrUrl: string): string {
  const trimmed = idOrUrl.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export function getSpreadsheetId(): string {
  return localStorage.getItem(LS_ID) ?? "";
}
export function isConnected(): boolean {
  return getSpreadsheetId().length > 0 && localStorage.getItem(LS_DISCONNECTED) !== "1";
}
function setSpreadsheetId(id: string) {
  localStorage.setItem(LS_ID, id);
  localStorage.removeItem(LS_DISCONNECTED);
}

const SYNC_TABS = [
  TAB.Tasks,
  TAB.Recurrences,
  TAB.Habits,
  TAB.HabitLog,
  TAB.BudgetPeriods,
  TAB.Money,
  TAB.Goals,
  TAB.Funds,
  TAB.Debts,
  TAB.Meals,
  TAB.Grocery,
  TAB.Workouts,
  TAB.WeightLog,
  TAB.Hydration,
  TAB.MealSetup,
  TAB.TimeBlocks,
];
const ALL_TABS = [...SYNC_TABS, ...V2_TABS];

// Maps an IndexedDB collection to the single Sheet tab it lives in — lets a
// mutation push just its own tab instead of rewriting all 16 on every edit
// (see COLLECTION_TAB usage in touch/markDirty below).
export const COLLECTION_TAB: Record<db.Collection, string> = {
  tasks: TAB.Tasks,
  recurrences: TAB.Recurrences,
  habits: TAB.Habits,
  habitLog: TAB.HabitLog,
  periods: TAB.BudgetPeriods,
  money: TAB.Money,
  goals: TAB.Goals,
  funds: TAB.Funds,
  debts: TAB.Debts,
  meals: TAB.Meals,
  grocery: TAB.Grocery,
  workouts: TAB.Workouts,
  weight: TAB.WeightLog,
  hydration: TAB.Hydration,
  recipes: TAB.MealSetup,
  timeblocks: TAB.TimeBlocks,
};

// Tabs pending a push. A mutation adds its tab here; a successful push clears
// only the tabs it wrote, so a failed/rate-limited push (e.g. a 429 mid-way)
// leaves the rest dirty for the next attempt instead of silently dropping them.
let dirtyTabs = new Set<string>();
export function markDirty(tab?: string): void {
  if (tab) dirtyTabs.add(tab);
  else SYNC_TABS.forEach((t) => dirtyTabs.add(t)); // no tab given: fall back to a full push
}

// ---- push: build a full tab (header + current rows) from the live stores ----
function tabValues(tab: string): string[][] {
  const header = HEADERS[tab] ?? [];
  let rows: string[][] = [];
  switch (tab) {
    case TAB.Tasks: rows = useTasks.getState().tasks.map(taskToRow); break;
    case TAB.Recurrences: rows = useTasks.getState().recurrences.map(recurrenceToRow); break;
    case TAB.Habits: rows = useHabits.getState().habits.map(habitToRow); break;
    case TAB.HabitLog: rows = useHabits.getState().log.map(habitLogToRow); break;
    case TAB.BudgetPeriods: rows = useBudget.getState().periods.map(periodToRow); break;
    case TAB.Money: rows = useBudget.getState().money.map(moneyToRow); break;
    case TAB.Goals: rows = useGoals.getState().items.map(goalToRow); break;
    case TAB.Funds: rows = useFunds.getState().items.map(fundToRow); break;
    case TAB.Debts: rows = useDebts.getState().items.map(debtToRow); break;
    case TAB.Meals: rows = useMeals.getState().items.map(mealToRow); break;
    case TAB.Grocery: rows = useGrocery.getState().items.map(groceryToRow); break;
    case TAB.Workouts: rows = useWorkouts.getState().items.map(workoutToRow); break;
    case TAB.WeightLog: rows = useWeight.getState().items.map(weightToRow); break;
    case TAB.Hydration: rows = useHydration.getState().items.map(hydrationToRow); break;
    case TAB.MealSetup: rows = useRecipes.getState().items.map(recipeToRow); break;
    case TAB.TimeBlocks: rows = useTimeBlocks.getState().items.map(timeBlockToRow); break;
  }
  return [header, ...rows];
}

/**
 * `allowInteractive` has NO default on purpose — every caller must consciously
 * decide. This used to silently default to allowing a popup, and pushAll() is
 * reachable from the `online` browser event (network reconnects), which has
 * nothing to do with a user click and can fire while the tab isn't even
 * focused — that's exactly what surfaced as a Google popup appearing "while
 * the window is not used" (confirmed 2026-07-13). Pass `true` only from a
 * genuine, current click handler (Connect, Sync now button); `false` from
 * anything automatic.
 */
export async function pushAll(allowInteractive: boolean): Promise<void> {
  // Hard stop: never write the in-memory sample to a real Sheet. Demo mode
  // should always be off by the time anyone is connected (connect() clears it),
  // but this guarantees the sample can never leak upward even if it isn't.
  if (isDemo()) return;
  const id = getSpreadsheetId();
  if (!id) return;
  // Sequential to stay well under rate limits for personal data volumes.
  for (const tab of SYNC_TABS) {
    await writeTab(id, tab, tabValues(tab), allowInteractive);
  }
  dirtyTabs.clear(); // every tab is now current — no need to re-push any of it
}

/**
 * Push only the tabs a mutation actually touched (see markDirty). Cuts a
 * single-field edit from 16 tabs/32 requests down to 1 tab/2 requests, which
 * is what was tripping Google's per-minute write quota during busy sessions
 * and silently dropping whichever tab hadn't been reached yet (e.g. Workouts,
 * which sits late in SYNC_TABS). A tab is only cleared from the dirty set
 * once it's actually written, so a rate-limited/failed push retries it next time.
 */
export async function pushDirty(): Promise<void> {
  if (isDemo()) return;
  const id = getSpreadsheetId();
  if (!id) return;
  const tabs = [...dirtyTabs];
  if (tabs.length === 0) return;
  for (const tab of tabs) {
    // allowInteractive=false: this runs from the unattended background flush,
    // possibly long after the tab was last touched by the user — if the token
    // has expired, this must fail fast with ReauthRequiredError, never try to
    // pop up a Google sign-in with no click behind it (browsers block that,
    // and it can hang forever with no error). See ReauthRequiredError.
    await writeTab(id, tab, tabValues(tab), false);
    dirtyTabs.delete(tab);
  }
}

// Silent tokens are normally requested reactively, only at the moment a push
// actually needs one — so if the token happened to be near/past expiry, the
// reauth prompt landed exactly when the user was mid-edit trying to save
// something, which is what made "tap to reconnect" feel like it kept
// interrupting active work (confirmed 2026-07-13). This checks proactively,
// between edits, so a needed reconnect surfaces calmly on the sync pill
// BEFORE it's blocking anything, not the moment someone hits save.
const TOKEN_REFRESH_MARGIN_MS = 10 * 60_000; // top up once under 10 min of life left
export async function keepTokenWarm(
  alreadyNeedsReauth: boolean,
  onReauthRequired: () => void
): Promise<void> {
  if (isDemo() || !isConnected() || !navigator.onLine) return;
  // Already known broken and waiting on the user to click "tap to reconnect"
  // — retrying the same silent request every 5 minutes just re-confirms the
  // same failure over and over with nothing new to learn from it, and reads
  // as the reconnect prompt "getting ridiculous" (confirmed 2026-07-13). The
  // reactive retry-with-backoff in attemptPush already covers this state;
  // this proactive check's whole job is catching a token that's ABOUT to
  // expire, not repeatedly re-poking one that already failed.
  if (alreadyNeedsReauth) return;
  if (tokenTimeLeftMs(SCOPE_SHEETS) > TOKEN_REFRESH_MARGIN_MS) return; // still plenty of runway
  try {
    await requestToken(SCOPE_SHEETS, false); // silent only — never pop a window from a timer
  } catch {
    onReauthRequired();
  }
}

// ---- pull: replace local data from the sheet ----
function parseRows<T>(rows: string[][], fromRow: (r: string[]) => T): T[] {
  // rows[0] is the header written by the app; skip it. Skip blank rows (no id).
  return rows
    .slice(1)
    .filter((r) => (r[0] ?? "").trim().length > 0)
    .map(fromRow);
}

export async function pull(allowInteractive: boolean): Promise<void> {
  const id = getSpreadsheetId();
  if (!id) return;
  const data = await batchGet(id, SYNC_TABS, allowInteractive);

  const tasks = parseRows<Task>(data[TAB.Tasks] ?? [], rowToTask);
  const recurrences = parseRows<Recurrence>(data[TAB.Recurrences] ?? [], rowToRecurrence);
  const habits = parseRows<Habit>(data[TAB.Habits] ?? [], rowToHabit);
  const habitLog = parseRows<HabitLogEntry>(data[TAB.HabitLog] ?? [], rowToHabitLog);
  const periods = parseRows<BudgetPeriod>(data[TAB.BudgetPeriods] ?? [], rowToPeriod);
  const money = parseRows<MoneyRow>(data[TAB.Money] ?? [], rowToMoney);
  const goals = parseRows<Goal>(data[TAB.Goals] ?? [], rowToGoal);
  const funds = parseRows<Fund>(data[TAB.Funds] ?? [], rowToFund);
  const debts = parseRows<Debt>(data[TAB.Debts] ?? [], rowToDebt);
  const meals = parseRows<Meal>(data[TAB.Meals] ?? [], rowToMeal);
  const grocery = parseRows<GroceryItem>(data[TAB.Grocery] ?? [], rowToGrocery);
  const workouts = parseRows<Workout>(data[TAB.Workouts] ?? [], rowToWorkout);
  const weight = parseRows<WeightEntry>(data[TAB.WeightLog] ?? [], rowToWeight);
  const hydration = parseRows<HydrationEntry>(data[TAB.Hydration] ?? [], rowToHydration);
  const recipes = parseRows<Recipe>(data[TAB.MealSetup] ?? [], rowToRecipe);
  const timeblocks = parseRows<TimeBlock>(data[TAB.TimeBlocks] ?? [], rowToTimeBlock);

  await Promise.all([
    replaceStore("tasks", tasks),
    replaceStore("recurrences", recurrences),
    replaceStore("habits", habits),
    replaceStore("habitLog", habitLog),
    replaceStore("periods", periods),
    replaceStore("money", money),
    replaceStore("goals", goals),
    replaceStore("funds", funds),
    replaceStore("debts", debts),
    replaceStore("meals", meals),
    replaceStore("grocery", grocery),
    replaceStore("workouts", workouts),
    replaceStore("weight", weight),
    replaceStore("hydration", hydration),
    replaceStore("recipes", recipes),
    replaceStore("timeblocks", timeblocks),
  ]);

  useTasks.getState().setAll(tasks, recurrences);
  useHabits.getState().setAll(habits, habitLog);
  useBudget.getState().setAll(periods, money);
  useGoals.getState().setAll(goals);
  useFunds.getState().setAll(funds);
  useDebts.getState().setAll(debts);
  useMeals.getState().setAll(meals);
  useGrocery.getState().setAll(grocery);
  useWorkouts.getState().setAll(workouts);
  useWeight.getState().setAll(weight);
  useHydration.getState().setAll(hydration);
  useRecipes.getState().setAll(recipes);
  useTimeBlocks.getState().setAll(timeblocks);
}

async function replaceStore<T extends { id: string }>(
  store: db.Collection,
  values: T[]
) {
  await db.clearStore(store);
  if (values.length) await db.putMany(store, values);
}

// ---- Meta tab: a tiny key/value store carried inside the user's own Sheet ----
async function readMetaTab(id: string, allowInteractive: boolean): Promise<Map<string, string>> {
  const data = await batchGet(id, [TAB.Meta], allowInteractive).catch(() => ({}) as Record<string, string[][]>);
  const rows = (data[TAB.Meta] ?? []).slice(1); // skip header
  return new Map(rows.filter((r) => (r[0] ?? "").trim()).map((r) => [r[0], r[1] ?? ""]));
}

async function writeMetaKey(id: string, key: string, value: string, allowInteractive: boolean): Promise<void> {
  const map = await readMetaTab(id, allowInteractive);
  map.set(key, value);
  await writeTab(id, TAB.Meta, [["key", "value"], ...map.entries()], allowInteractive);
}

const ACCESS_CODE_META_KEY = "accessCode";

/**
 * Keep the buyer's Etsy access code and the Sheet in sync, both directions:
 * - Already activated locally → push our code up (so a second device that
 *   later connects to this same Sheet inherits it).
 * - Not yet activated, but this Sheet already carries a code from a previous
 *   device → adopt it locally. No local wipe here — pull() already brought
 *   down the real data for this Sheet, unlike a fresh manual code entry.
 */
async function syncAccessCode(id: string, allowInteractive: boolean): Promise<void> {
  const settings = useSettings.getState();
  if (settings.activated && settings.accessCode) {
    await writeMetaKey(id, ACCESS_CODE_META_KEY, settings.accessCode, allowInteractive).catch(() => {});
    return;
  }
  const map = await readMetaTab(id, allowInteractive).catch(() => new Map<string, string>());
  const remoteCode = map.get(ACCESS_CODE_META_KEY) ?? "";
  if (remoteCode && isValidAccessCode(remoteCode)) {
    settings.update({ activated: true, accessCode: remoteCode });
  }
}

/**
 * Connect a Google account. If a sheet id is remembered we relink + pull;
 * otherwise we create a fresh app-managed spreadsheet and push local data up.
 * Returns the spreadsheet id.
 */
export async function connect(): Promise<string> {
  // Ask for an interactive token FIRST, straight off the click — every other
  // Sheets call below tries a silent refresh before falling back to a popup,
  // which works for background sync but would delay the very first popup here
  // past the click's window for the browser to treat it as user-initiated.
  // Combined scope so this one consent screen also covers Calendar — see
  // SCOPE_SHEETS_AND_CALENDAR's doc comment; nothing else in the app is ever
  // allowed to ask for calendar.events interactively.
  await requestToken(SCOPE_SHEETS_AND_CALENDAR, true);

  // Leaving demo BEFORE any push/pull: setDemoMode reloads the stores from the
  // user's real (blank for a new buyer) IndexedDB, so pushAll below seeds the
  // new sheet with THAT — never the in-memory sample. Dynamic import avoids the
  // sync ⇄ bootstrap ⇄ useSync require cycle.
  if (isDemo()) {
    const { setDemoMode } = await import("../stores/bootstrap");
    await setDemoMode(false);
  }

  const existing = getSpreadsheetId();
  if (existing) {
    try {
      await ensureTabs(existing, ALL_TABS, true);
      localStorage.removeItem(LS_DISCONNECTED);
      // Push local changes UP before pulling the sheet down. This device may
      // have kept working (safely, in IndexedDB) through a stretch where the
      // connection was stuck needing reauth — background pushes were failing
      // that whole time, so the SHEET is the stale side here, not the
      // device. A pull()-only reconnect used to blindly overwrite local data
      // with that stale sheet content, silently erasing everything typed
      // while disconnected (confirmed 2026-07-13 — real data loss, reported
      // directly: "once I signed back in everything was cleared"). We just
      // got a fresh interactive token above, so this push is reliable; pull()
      // afterward then just reads back a sheet that already reflects this
      // device's latest state, instead of clobbering it.
      await pushAll(true);
      await pull(true);
      await syncAccessCode(existing, true);
      return existing;
    } catch (err) {
      if (err instanceof SheetNotFoundError) {
        localStorage.removeItem(LS_ID);
        // fall through to create a new one
      } else {
        // A SheetPermissionDeniedError lands here too — the signed-in account
        // isn't the one that owns the remembered sheet (wrong Google account
        // picked, or a genuine account switch). Deliberately NOT auto-abandoning
        // the old link or auto-creating a new sheet here: that could silently
        // hide a simple "picked the wrong account" mistake behind what looks
        // like a fresh, empty planner. Propagate the typed error so the UI can
        // offer an explicit choice instead (see abandonRememberedSheet below
        // and SettingsScreen's handling of SheetPermissionDeniedError).
        throw err;
      }
    }
  }
  const id = await createSpreadsheet(SPREADSHEET_TITLE, ALL_TABS, true);
  setSpreadsheetId(id);
  // connect() already forced a fresh interactive token synchronously at the
  // top of this function (straight off the click), so this token is already
  // valid — true here just documents that a popup is safe in this call chain.
  await pushAll(true); // seed the new sheet with whatever is on-device now
  await syncAccessCode(id, true);
  return id;
}

/**
 * Relink to a spreadsheet id (or full Sheets URL) the user pasted in — the
 * genuine cross-device path: a brand-new browser has no remembered id and no
 * local access code, so this is how it recovers both the real data AND the
 * activation state from an already-connected device's Sheet, with no re-typed
 * code and no wipe. Available even before local activation, since that's
 * exactly what it's for.
 */
export async function relink(idOrUrl: string): Promise<void> {
  const id = extractSpreadsheetId(idOrUrl);
  if (!id) throw new Error("That doesn't look like a Google Sheet link or ID.");
  await requestToken(SCOPE_SHEETS_AND_CALENDAR, true);
  await ensureTabs(id, ALL_TABS, true);
  setSpreadsheetId(id);
  await pull(true);
  await syncAccessCode(id, true);
}

/**
 * The durable, synchronous half of disconnecting: mark this device as
 * disconnected and stop the background sync loop. Deliberately kept separate
 * from forgetting the token (see disconnect()) so a caller can call this
 * FIRST, before any slower async step like a final best-effort push — a page
 * refresh at any point after this line still leaves the app correctly
 * "disconnected," instead of the whole operation silently reverting because
 * a slow network call never got the chance to finish.
 */
export function markDisconnected(): void {
  // Deliberately keep LS_ID — see the comment on its declaration. Only mark
  // "disconnected" so the next Connect click relinks to this same sheet
  // instead of minting a new one.
  localStorage.setItem(LS_DISCONNECTED, "1");
  if (timer) clearTimeout(timer);
  clearRetry(); // no point quietly retrying a push once the user has disconnected
}

export function disconnect() {
  markDisconnected();
  forgetToken();
}

/**
 * The explicit "yes, really use a different Google account" recovery step for
 * a SheetPermissionDeniedError: forgets the remembered sheet id so the next
 * connect() call creates a brand-new spreadsheet for whichever account is
 * currently signed in, instead of retrying against the one it has no access
 * to. Never called automatically — see the comment in connect()'s catch block.
 */
export function abandonRememberedSheet(): void {
  localStorage.removeItem(LS_ID);
}

// ---- debounced flush on every mutation, with background retry on failure ----
// Local writes (IndexedDB) always succeed instantly — a mutation is never lost.
// This only governs getting a dirty tab up to the Sheet; a transient failure
// (rate limit, blip) must never need the user to notice and manually hit
// "Sync now" — we keep quietly retrying with backoff until it lands, so a fast
// editor's later edits aren't the only thing that happens to retry it.
let timer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 120_000;
let retryDelay = RETRY_BASE_MS;
// Nothing previously stopped two pushes from running at once: a slow push
// (several dirty tabs, slow network) plus more edits arriving in the
// meantime could fire a second attemptPush before the first had finished —
// each independently deciding it needed a token and each requesting one,
// which is exactly the shape of "multiple popups at once" (confirmed
// 2026-07-13). One flush in flight at a time now; anything that comes in
// during it just waits for the current one to finish instead of racing it.
let pushInFlight = false;

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryDelay = RETRY_BASE_MS;
}

function attemptPush(
  onState: (s: "syncing" | "synced" | "offline") => void,
  onReauthRequired: () => void
) {
  if (pushInFlight) {
    // A push is already running — don't start a second one racing it, but
    // don't just drop this either: a tab dirtied WHILE the in-flight push is
    // running isn't in its snapshot, so check back shortly after it should
    // be done rather than silently waiting for the next unrelated edit.
    retryTimer = setTimeout(() => attemptPush(onState, onReauthRequired), 3000);
    return;
  }
  if (!navigator.onLine) {
    onState("offline");
    retryTimer = setTimeout(() => attemptPush(onState, onReauthRequired), retryDelay);
    return;
  }
  onState("syncing");
  pushInFlight = true;
  pushDirty()
    .then(() => {
      clearRetry();
      onState("synced");
    })
    .catch((err) => {
      onState("offline");
      // The token expired and a silent refresh failed (e.g. the tab sat open
      // for a long while) — surface it so the UI can offer a real "tap to
      // reconnect" button. Never opened a popup for this ourselves; see
      // ReauthRequiredError. Keep retrying silently in the background too —
      // it can self-heal (e.g. the browser's Google session refreshing) even
      // without the user doing anything.
      if (err instanceof ReauthRequiredError) onReauthRequired();
      retryTimer = setTimeout(() => attemptPush(onState, onReauthRequired), retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    })
    .finally(() => {
      pushInFlight = false;
    });
}

export function scheduleFlush(
  onState: (s: "syncing" | "synced" | "offline") => void,
  onReauthRequired: () => void
) {
  if (!isConnected()) return;
  if (!navigator.onLine) {
    onState("offline");
    return;
  }
  if (timer) clearTimeout(timer);
  clearRetry(); // a fresh edit supersedes any pending backoff retry
  onState("syncing");
  timer = setTimeout(() => attemptPush(onState, onReauthRequired), 2000);
}
