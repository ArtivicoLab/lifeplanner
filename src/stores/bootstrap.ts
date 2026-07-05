// Hydrate every store from IndexedDB on boot; seed sample data on first run.

import * as db from "../lib/db";
import { buildSample } from "../lib/sample";
import { isValidAccessCode } from "../lib/access";
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

const SEEDED_KEY = "seeded";
const SEEDED_V2_KEY = "seededV2";
const SEEDED_V3_KEY = "seededV3"; // recipes / meal-setup top-up
const SEEDED_V4_KEY = "seededV4"; // time blocks top-up

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

export async function seedSample(force = false) {
  if (!force) {
    const already = await db.getKV<boolean>(SEEDED_KEY);
    if (already) return;
  }
  const s = buildSample();
  await Promise.all([
    db.putMany("tasks", s.tasks),
    db.putMany("recurrences", s.recurrences),
    db.putMany("habits", s.habits),
    db.putMany("habitLog", s.habitLog),
    db.putMany("periods", s.periods),
    db.putMany("money", s.money),
    db.putMany("goals", s.goals),
    db.putMany("funds", s.funds),
    db.putMany("debts", s.debts),
    db.putMany("meals", s.meals),
    db.putMany("grocery", s.grocery),
    db.putMany("workouts", s.workouts),
    db.putMany("weight", s.weight),
    db.putMany("hydration", s.hydration),
    db.putMany("recipes", s.recipes),
    db.putMany("timeblocks", s.timeblocks),
  ]);
  await db.setKV(SEEDED_KEY, true);
  await db.setKV(SEEDED_V2_KEY, true);
  await db.setKV(SEEDED_V3_KEY, true);
  await db.setKV(SEEDED_V4_KEY, true);
  await loadStores();
}

/** Top up the v2 module sample data for users seeded before v2 existed. */
async function seedV2IfMissing() {
  const done = await db.getKV<boolean>(SEEDED_V2_KEY);
  if (done) return;
  const s = buildSample();
  await Promise.all([
    db.putMany("goals", s.goals),
    db.putMany("funds", s.funds),
    db.putMany("debts", s.debts),
    db.putMany("meals", s.meals),
    db.putMany("grocery", s.grocery),
    db.putMany("workouts", s.workouts),
    db.putMany("weight", s.weight),
    db.putMany("hydration", s.hydration),
  ]);
  await db.setKV(SEEDED_V2_KEY, true);
  await loadStores();
}

/** Top up the recipe library for users seeded before Meal Setup existed. */
async function seedV3IfMissing() {
  const done = await db.getKV<boolean>(SEEDED_V3_KEY);
  if (done) return;
  const s = buildSample();
  await db.putMany("recipes", s.recipes);
  await db.setKV(SEEDED_V3_KEY, true);
  await loadStores();
}

/** Top up sample time blocks for users seeded before Time Blocking existed. */
async function seedV4IfMissing() {
  const done = await db.getKV<boolean>(SEEDED_V4_KEY);
  if (done) return;
  const s = buildSample();
  await db.putMany("timeblocks", s.timeblocks);
  await db.setKV(SEEDED_V4_KEY, true);
  await loadStores();
}

// One-time heal for caches polluted by the old double-seed bug: drop content-
// duplicate rows (keep the first of each), then reload. Safe — removing exact
// duplicates never loses real data.
const DEDUPED_KEY = "dedupedV1";

async function dedupeCollections() {
  if (await db.getKV<boolean>(DEDUPED_KEY)) return;
  const specs: [db.Collection, (r: any) => string][] = [
    ["tasks", (t) => `${t.title}|${t.category}|${t.dueDate}|${t.recurrenceId}|${t.occurrenceDate}`],
    ["recurrences", (r) => `${r.title}|${r.frequency}|${r.anchorDate}`],
    ["habits", (h) => h.name],
    ["habitLog", (l) => `${l.habitId}|${l.date}`],
    ["periods", (p) => `${p.label}|${p.startDate}`],
    ["money", (m) => `${m.periodId}|${m.kind}|${m.name}`],
    ["goals", (g) => g.title],
    ["funds", (f) => f.name],
    ["debts", (d) => d.name],
    ["meals", (m) => `${m.date}|${m.slot}|${m.name}`],
    ["grocery", (g) => g.item],
    ["workouts", (w) => `${w.date}|${w.exercise}`],
    ["weight", (w) => `${w.participant}|${w.date}`],
    ["hydration", (h) => h.date],
    ["recipes", (r) => r.name],
    ["timeblocks", (t) => `${t.date ?? ""}|${t.time ?? ""}`],
  ];
  for (const [coll, keyFn] of specs) {
    let rows: { id: string }[] = [];
    try {
      rows = await db.all<{ id: string }>(coll);
    } catch {
      continue; // collection may not exist yet
    }
    const seen = new Set<string>();
    for (const r of rows) {
      const k = keyFn(r);
      if (seen.has(k)) await db.remove(coll, r.id);
      else seen.add(k);
    }
  }
  await db.setKV(DEDUPED_KEY, true);
  await loadStores();
}

export async function markOnboarded() {
  await db.setKV(SEEDED_KEY, true);
}

// Memoize so React StrictMode's double-invoked effect (or any repeat call) shares
// ONE run — otherwise two concurrent bootstraps both read "not seeded" before
// either writes the flag, and every record gets seeded twice (duplicate rows).
let bootPromise: Promise<void> | null = null;

export function bootstrap(): Promise<void> {
  if (!bootPromise) bootPromise = runBootstrap();
  return bootPromise;
}

async function runBootstrap() {
  await useSettings.getState().load();
  await loadStores();
  if (!useSettings.getState().activated) {
    // Zero-friction first run for browsers without a purchase code: land
    // straight on a populated demo dashboard. Once activated (see `activate`
    // below), this is skipped forever — the planner stays blank as intended.
    await seedSample();
    await seedV2IfMissing();
    await seedV3IfMissing();
    await seedV4IfMissing();
    await dedupeCollections();
  }
}

/**
 * Unlock the real (Google Sheets-connectable) app with an Etsy purchase code.
 * Soft client-side check only (see lib/access.ts) — on success this wipes any
 * local demo data so the buyer starts genuinely blank, matching the paid
 * product rather than the sample-filled trial.
 */
export async function activate(code: string): Promise<boolean> {
  if (!isValidAccessCode(code)) return false;
  await resetEverything();
  useSettings.getState().update({ activated: true, accessCode: code.trim().toUpperCase() });
  return true;
}

export async function resetEverything() {
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
