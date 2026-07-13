// Hydrate every store from IndexedDB on boot; seed sample data on first run.

import * as db from "../lib/db";
import * as sync from "../lib/sync";
import { buildSample, type Seed } from "../lib/sample";
import { isValidAccessCode } from "../lib/access";
import { isDemo, setDemoFlag } from "../lib/demo";
import { useTasks } from "./useTasks";
import { useHabits } from "./useHabits";
import { useBudget } from "./useBudget";
import { useSettings } from "./useSettings";
import { useSync } from "./useSync";
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
} from "./v2";
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
} from "../lib/types";

const SEEDED_KEY = "seeded"; // legacy flag: the OLD build wrote it when it seeded IndexedDB

async function loadStores() {
  const [
    tasks, recurrences, habits, habitLog, periods, money,
    goals, funds, debts, meals, grocery, workouts, weight, hydration, recipes, timeblocks,
  ] = await Promise.all([
    db.all<Task>("tasks"),
    db.all<Recurrence>("recurrences"),
    db.all<Habit>("habits"),
    db.all<HabitLogEntry>("habitLog"),
    db.all<BudgetPeriod>("periods"),
    db.all<MoneyRow>("money"),
    db.all<Goal>("goals"),
    db.all<Fund>("funds"),
    db.all<Debt>("debts"),
    db.all<Meal>("meals"),
    db.all<GroceryItem>("grocery"),
    db.all<Workout>("workouts"),
    db.all<WeightEntry>("weight"),
    db.all<HydrationEntry>("hydration"),
    db.all<Recipe>("recipes"),
    db.all<TimeBlock>("timeblocks"),
  ]);
  useTasks.getState().setAll(tasks, recurrences);
  useHabits.getState().setAll(habits, habitLog);
  // Backfill periods saved before `cadence` existed — same IndexedDB-has-no-
  // schema issue as goals below. Harmless in the UI (already falls back to
  // "Monthly" for display), but without this it pushes a blank cadence cell
  // to the Sheet on every sync.
  useBudget.getState().setAll(periods.map((p) => ({ ...p, cadence: p.cadence || "monthly" })), money);
  // Backfill goals saved before `steps`/`cover` existed — IndexedDB doesn't
  // enforce a schema, so old rows would otherwise crash the Goals screen with
  // `undefined.filter`/`.map` (steps.length is used unconditionally there).
  useGoals.getState().setAll(goals.map((g) => ({ ...g, steps: g.steps ?? [], cover: g.cover || "target" })));
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


// Load the full-year sample straight into the in-memory stores. Nothing is
// written to IndexedDB (db writes are gated off while demo mode is on), so the
// dummy data is purely a display layer — it can never be pushed to a Sheet or
// mistaken for real data. Every reload rebuilds a fresh, complete demo.
export function loadSampleIntoStores(s: Seed = buildSample()) {
  useTasks.getState().setAll(s.tasks, s.recurrences);
  useHabits.getState().setAll(s.habits, s.habitLog);
  useBudget.getState().setAll(s.periods.map((p) => ({ ...p, cadence: p.cadence || "monthly" })), s.money);
  useGoals.getState().setAll(s.goals);
  useFunds.getState().setAll(s.funds);
  useDebts.getState().setAll(s.debts);
  useMeals.getState().setAll(s.meals);
  useGrocery.getState().setAll(s.grocery);
  useWorkouts.getState().setAll(s.workouts);
  useWeight.getState().setAll(s.weight);
  useHydration.getState().setAll(s.hydration);
  useRecipes.getState().setAll(s.recipes);
  useTimeBlocks.getState().setAll(s.timeblocks);
}

// One-time migration off the OLD model, which seeded the sample straight into
// IndexedDB for un-activated users. Under the new memory-only demo, IndexedDB
// must hold ONLY real data — otherwise a legacy visitor who turns demo OFF (or
// connects) would see stale seed rows masquerading as their own. So: if the old
// seed ran and they never became a real (activated) user, clear the collections.
const DEMO_MIGRATED_KEY = "demoMigratedV1";
async function migrateLegacySeed() {
  if (await db.getKV<boolean>(DEMO_MIGRATED_KEY)) return;
  const hadOldSeed = await db.getKV<boolean>(SEEDED_KEY);
  if (hadOldSeed && !useSettings.getState().activated) {
    for (const c of db.ALL_COLLECTIONS) {
      try { await db.clearStore(c); } catch { /* store may not exist yet */ }
    }
  }
  await db.setKV(DEMO_MIGRATED_KEY, true);
}

// Memoize so React StrictMode's double-invoked effect (or any repeat call)
// shares ONE run.
let bootPromise: Promise<void> | null = null;

export function bootstrap(): Promise<void> {
  if (!bootPromise) bootPromise = runBootstrap();
  return bootPromise;
}

async function runBootstrap() {
  await useSettings.getState().load();
  await migrateLegacySeed();
  const demo = isDemo();
  db.setDbDemoMode(demo);
  if (demo) {
    loadSampleIntoStores();
  } else {
    await loadStores();
  }
}

/**
 * Flip demo mode on/off at runtime (the Settings toggle). The choice persists
 * in localStorage (see lib/demo). Turning it ON shows the full-year sample
 * without touching the user's stored data; turning it OFF reloads their real
 * (possibly empty) data from IndexedDB.
 */
export async function setDemoMode(on: boolean): Promise<void> {
  setDemoFlag(on);
  db.setDbDemoMode(on);
  if (on) {
    loadSampleIntoStores();
  } else {
    await loadStores();
  }
}

/**
 * Unlock the real (Google Sheets-connectable) app with an Etsy purchase code.
 * Soft client-side check only (see lib/access.ts). Under the memory-only demo
 * model there's nothing to wipe — the sample was never written to IndexedDB —
 * so this just leaves demo mode and shows the user's own (blank for a new
 * buyer) data. It deliberately does NOT delete anything: if someone turned demo
 * off and entered real data before buying, that data survives activation.
 */
export async function activate(code: string): Promise<boolean> {
  if (!isValidAccessCode(code)) return false;
  setDemoFlag(false);
  db.setDbDemoMode(false);
  if (!useSettings.getState().activated) {
    await loadStores();
    useSettings.getState().update({ activated: true, accessCode: code.trim().toUpperCase() });
  }
  return true;
}

export async function resetEverything() {
  // An explicit "start fresh" is a real-app action — leave demo so writes land
  // again and the user sees their now-empty real planner, not the sample.
  setDemoFlag(false);
  db.setDbDemoMode(false);
  await db.wipeAll();
  useTasks.getState().setAll([], []);
  useHabits.getState().setAll([], []);
  useBudget.getState().setAll([], []);
  useBudget.setState({ currentPeriodId: "" });
  for (const s of [useGoals, useFunds, useDebts, useMeals, useGrocery, useWorkouts, useWeight, useHydration, useRecipes, useTimeBlocks]) {
    s.getState().setAll([]);
  }
}

/**
 * Disconnect Google Sheets AND remove this device's local copy — for someone
 * handing off or walking away from a shared/borrowed device who doesn't want
 * their planner visible to whoever picks it up next. A plain "Disconnect"
 * only stops syncing (see sync.ts); this also wipes IndexedDB.
 *
 * Marks the device disconnected FIRST, synchronously, before the slower
 * final-push/wipe steps below — a page refresh at any point during this
 * function still leaves the app correctly disconnected. (Previously the push
 * ran first and could take several seconds across 16 tabs; refreshing during
 * that window meant "disconnect" never actually happened at all — the whole
 * async function was abandoned before it reached the line that flips the
 * flag.) The final push then still refuses to let the local wipe happen if
 * it fails (offline, API error, etc.) — this button must never be the reason
 * someone loses data that never actually made it to their Sheet, but a failed
 * push no longer holds the disconnect itself hostage.
 */
export async function disconnectAndClearDevice(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  sync.markDisconnected();
  useSync.setState({ connected: false, wrongAccount: false, error: "" });

  try {
    await sync.pushAll(); // token is still live — markDisconnected() alone doesn't forget it
  } catch (e) {
    sync.disconnect(); // now safe to drop the token too; the device is disconnected either way
    return {
      ok: false,
      reason:
        e instanceof Error
          ? e.message
          : "Disconnected, but couldn't confirm your last changes reached Google Sheets — nothing on this device was cleared.",
    };
  }
  sync.disconnect();
  await db.wipeAll();
  useTasks.getState().setAll([], []);
  useHabits.getState().setAll([], []);
  useBudget.getState().setAll([], []);
  useBudget.setState({ currentPeriodId: "" });
  for (const s of [useGoals, useFunds, useDebts, useMeals, useGrocery, useWorkouts, useWeight, useHydration, useRecipes, useTimeBlocks]) {
    s.getState().setAll([]);
  }
  return { ok: true };
}

/**
 * "Reuse year after year": clear a chosen set of this-year's transactional
 * history while keeping every reusable structure intact — Recurring task
 * templates, Habits, Goals, Funds, Debts, the Recipe library, and all Settings
 * (including custom categories). Clearing `tasks` also wipes materialized
 * recurring occurrences, but the recurrence engine lazily regenerates them
 * from the surviving Recurrences the next time they're viewed, so nothing
 * about the recurring schedule itself is lost.
 */
export interface YearResetOptions {
  tasks: boolean; // one-time tasks + materialized recurring occurrences
  habitLog: boolean; // habit check-in history (keeps the habits themselves)
  meals: boolean; // planned meals + grocery list (keeps the recipe library)
  workouts: boolean; // fitness log
  timeblocks: boolean; // today's/past time-blocked schedule
  weight: boolean; // weight log (off by default — long-term health tracking)
  hydration: boolean; // hydration log (off by default — long-term health tracking)
}

export async function resetForNewYear(opts: YearResetOptions): Promise<void> {
  if (opts.tasks) {
    await db.clearStore("tasks");
    useTasks.getState().setAll([], useTasks.getState().recurrences);
  }
  if (opts.habitLog) {
    await db.clearStore("habitLog");
    useHabits.getState().setAll(useHabits.getState().habits, []);
  }
  if (opts.meals) {
    await db.clearStore("meals");
    await db.clearStore("grocery");
    useMeals.getState().setAll([]);
    useGrocery.getState().setAll([]);
  }
  if (opts.workouts) {
    await db.clearStore("workouts");
    useWorkouts.getState().setAll([]);
  }
  if (opts.timeblocks) {
    await db.clearStore("timeblocks");
    useTimeBlocks.getState().setAll([]);
  }
  if (opts.weight) {
    await db.clearStore("weight");
    useWeight.getState().setAll([]);
  }
  if (opts.hydration) {
    await db.clearStore("hydration");
    useHydration.getState().setAll([]);
  }
  useSync.getState().touch();
}

export { loadStores };
