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
  SheetNotFoundError,
  writeTab,
} from "./google/sheets";
import { forgetToken, requestToken, SCOPE_SHEETS } from "./google/auth";
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
  return getSpreadsheetId().length > 0;
}
function setSpreadsheetId(id: string) {
  localStorage.setItem(LS_ID, id);
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

export async function pushAll(): Promise<void> {
  // Hard stop: never write the in-memory sample to a real Sheet. Demo mode
  // should always be off by the time anyone is connected (connect() clears it),
  // but this guarantees the sample can never leak upward even if it isn't.
  if (isDemo()) return;
  const id = getSpreadsheetId();
  if (!id) return;
  // Sequential to stay well under rate limits for personal data volumes.
  for (const tab of SYNC_TABS) {
    await writeTab(id, tab, tabValues(tab));
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

export async function pull(): Promise<void> {
  const id = getSpreadsheetId();
  if (!id) return;
  const data = await batchGet(id, SYNC_TABS);

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
async function readMetaTab(id: string): Promise<Map<string, string>> {
  const data = await batchGet(id, [TAB.Meta]).catch(() => ({}) as Record<string, string[][]>);
  const rows = (data[TAB.Meta] ?? []).slice(1); // skip header
  return new Map(rows.filter((r) => (r[0] ?? "").trim()).map((r) => [r[0], r[1] ?? ""]));
}

async function writeMetaKey(id: string, key: string, value: string): Promise<void> {
  const map = await readMetaTab(id);
  map.set(key, value);
  await writeTab(id, TAB.Meta, [["key", "value"], ...map.entries()]);
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
async function syncAccessCode(id: string): Promise<void> {
  const settings = useSettings.getState();
  if (settings.activated && settings.accessCode) {
    await writeMetaKey(id, ACCESS_CODE_META_KEY, settings.accessCode).catch(() => {});
    return;
  }
  const map = await readMetaTab(id).catch(() => new Map<string, string>());
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
  await requestToken(SCOPE_SHEETS, true);

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
      await ensureTabs(existing, ALL_TABS);
      await pull();
      await syncAccessCode(existing);
      return existing;
    } catch (err) {
      if (err instanceof SheetNotFoundError) {
        localStorage.removeItem(LS_ID);
        // fall through to create a new one
      } else {
        throw err;
      }
    }
  }
  const id = await createSpreadsheet(SPREADSHEET_TITLE, ALL_TABS);
  setSpreadsheetId(id);
  await pushAll(); // seed the new sheet with whatever is on-device now
  await syncAccessCode(id);
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
  await requestToken(SCOPE_SHEETS, true);
  await ensureTabs(id, ALL_TABS);
  setSpreadsheetId(id);
  await pull();
  await syncAccessCode(id);
}

export function disconnect() {
  forgetToken();
  localStorage.removeItem(LS_ID);
}

// ---- debounced flush on every mutation ----
let timer: ReturnType<typeof setTimeout> | null = null;
export function scheduleFlush(onState: (s: "syncing" | "synced" | "offline") => void) {
  if (!isConnected()) return;
  if (!navigator.onLine) {
    onState("offline");
    return;
  }
  if (timer) clearTimeout(timer);
  onState("syncing");
  timer = setTimeout(() => {
    pushAll()
      .then(() => onState("synced"))
      .catch(() => onState("offline"));
  }, 2000);
}
