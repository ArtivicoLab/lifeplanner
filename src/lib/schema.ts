// Single source of truth for the Google Sheet layout (spec §4).
// Row 1 of every tab is a header written by the app. Records are keyed by `id`
// (column A) — NEVER by row position. Serializers here roundtrip a domain
// object <-> a flat string[] row so the Sheets sync layer stays trivial.

import { newId } from "./id";
import type {
  BudgetPeriod,
  Debt,
  Fund,
  Goal,
  GoalStep,
  GroceryItem,
  Habit,
  HabitLogEntry,
  HydrationEntry,
  Meal,
  MoneyRow,
  Priority,
  Recipe,
  Recurrence,
  Status,
  Task,
  TimeBlock,
  WeightEntry,
  Workout,
} from "./types";

export const SPREADSHEET_TITLE = "Life Planner";
export const SCHEMA_VERSION = 1;

export const TAB = {
  Meta: "Meta",
  Tasks: "Tasks",
  Recurrences: "Recurrences",
  Habits: "Habits",
  HabitLog: "HabitLog",
  BudgetPeriods: "BudgetPeriods",
  Money: "Money",
  Goals: "Goals",
  Funds: "Funds",
  Debts: "Debts",
  Meals: "Meals",
  Grocery: "Grocery",
  Workouts: "Workouts",
  WeightLog: "WeightLog",
  Hydration: "Hydration",
  MealSetup: "MealSetup",
  TimeBlocks: "TimeBlocks",
} as const;

// Reserved tabs still created empty (headers only) but not yet surfaced in UI.
export const V2_TABS = ["DebtPayments", TAB.Meta] as const;

export const HEADERS: Record<string, string[]> = {
  // A generic key/value tab — currently used to carry the buyer's Etsy access
  // code across devices, so connecting to the same Sheet elsewhere skips
  // re-entering it. Not part of the normal per-collection sync loop.
  [TAB.Meta]: ["key", "value"],
  [TAB.Tasks]: [
    "id", "title", "notes", "category", "priority", "status", "dueDate",
    "recurrenceId", "occurrenceDate", "remind", "calendarEventId",
    "completedAt", "createdAt", "updatedAt", "assignee",
  ],
  [TAB.Recurrences]: [
    "id", "title", "notes", "category", "priority", "frequency", "anchorDate",
    "endDate", "remind", "active", "createdAt", "updatedAt", "assignee",
  ],
  [TAB.Habits]: [
    "id", "name", "icon", "goalPerWeek", "active", "order", "createdAt", "updatedAt",
  ],
  [TAB.HabitLog]: ["id", "habitId", "date", "done"],
  [TAB.BudgetPeriods]: [
    "id", "label", "startDate", "endDate", "startBalance", "createdAt", "updatedAt", "cadence",
  ],
  [TAB.Money]: [
    "id", "periodId", "kind", "name", "category", "budgeted", "actual",
    "dueDate", "paid", "remind", "calendarEventId", "createdAt", "updatedAt", "fundId",
    "repeats", "repeatsUntil",
  ],
  [TAB.Goals]: [
    "id", "title", "area", "why", "how", "deadline", "reward", "status",
    "progress", "createdAt", "updatedAt", "steps", "cover",
  ],
  [TAB.Funds]: [
    "id", "name", "icon", "goalAmount", "currentBalance", "startingAmount",
    "goalDate", "createdAt", "updatedAt",
  ],
  [TAB.Debts]: [
    "id", "name", "startBalance", "currentBalance", "apr", "minPayment",
    "createdAt", "updatedAt", "notes",
  ],
  [TAB.Meals]: [
    "id", "date", "slot", "name", "ingredients", "createdAt", "updatedAt",
  ],
  [TAB.Grocery]: [
    "id", "item", "category", "qty", "checked", "source", "createdAt", "updatedAt", "unit", "notes",
  ],
  [TAB.Workouts]: [
    "id", "date", "muscleGroup", "restDay", "exercise", "sets", "reps",
    "weight", "done", "createdAt", "updatedAt", "rest", "time", "speed", "distance",
  ],
  [TAB.WeightLog]: [
    "id", "participant", "date", "weight", "height", "createdAt", "updatedAt",
  ],
  [TAB.Hydration]: ["id", "date", "ml", "createdAt", "updatedAt"],
  [TAB.MealSetup]: ["id", "name", "ingredients", "slot", "createdAt", "updatedAt"],
  [TAB.TimeBlocks]: ["id", "date", "time", "item", "done", "createdAt", "updatedAt"],
};

// ---- primitive (de)serializers ----
const b = (v: boolean): string => (v ? "TRUE" : "FALSE");
const pb = (s: string | undefined): boolean => String(s).toUpperCase() === "TRUE";
const num = (n: number): string => String(n ?? 0);
const pn = (s: string | undefined): number => {
  const v = parseFloat(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : 0;
};
const s = (v: string | undefined): string => (v ?? "").toString();

// ---- Tasks ----
export function taskToRow(t: Task): string[] {
  return [
    t.id, t.title, t.notes, t.category, t.priority, t.status, t.dueDate,
    t.recurrenceId, t.occurrenceDate, b(t.remind), t.calendarEventId,
    t.completedAt, t.createdAt, t.updatedAt, s(t.assignee),
  ];
}
export function rowToTask(r: string[]): Task {
  return {
    id: s(r[0]), title: s(r[1]), notes: s(r[2]), category: s(r[3]),
    priority: (s(r[4]) || "Medium") as Priority,
    status: (s(r[5]) || "NotStarted") as Status,
    dueDate: s(r[6]), recurrenceId: s(r[7]), occurrenceDate: s(r[8]),
    remind: pb(r[9]), calendarEventId: s(r[10]), completedAt: s(r[11]),
    createdAt: s(r[12]), updatedAt: s(r[13]), assignee: s(r[14]),
  };
}

// ---- Recurrences ----
export function recurrenceToRow(x: Recurrence): string[] {
  return [
    x.id, x.title, x.notes, x.category, x.priority, x.frequency, x.anchorDate,
    x.endDate, b(x.remind), b(x.active), x.createdAt, x.updatedAt, s(x.assignee),
  ];
}
export function rowToRecurrence(r: string[]): Recurrence {
  return {
    id: s(r[0]), title: s(r[1]), notes: s(r[2]), category: s(r[3]),
    priority: (s(r[4]) || "Medium") as Priority,
    frequency: (s(r[5]) || "weekly") as Recurrence["frequency"],
    anchorDate: s(r[6]), endDate: s(r[7]), remind: pb(r[8]), active: pb(r[9]),
    createdAt: s(r[10]), updatedAt: s(r[11]), assignee: s(r[12]),
  };
}

// ---- Habits ----
export function habitToRow(h: Habit): string[] {
  return [
    h.id, h.name, h.icon, num(h.goalPerWeek), b(h.active), num(h.order),
    h.createdAt, h.updatedAt,
  ];
}
export function rowToHabit(r: string[]): Habit {
  return {
    id: s(r[0]), name: s(r[1]), icon: s(r[2]) || "check",
    goalPerWeek: pn(r[3]) || 7, active: pb(r[4]), order: pn(r[5]),
    createdAt: s(r[6]), updatedAt: s(r[7]),
  };
}

// ---- HabitLog ----
export function habitLogToRow(x: HabitLogEntry): string[] {
  return [x.id, x.habitId, x.date, b(x.done)];
}
export function rowToHabitLog(r: string[]): HabitLogEntry {
  return { id: s(r[0]), habitId: s(r[1]), date: s(r[2]), done: pb(r[3]) };
}

// ---- BudgetPeriods ----
export function periodToRow(p: BudgetPeriod): string[] {
  return [
    p.id, p.label, p.startDate, p.endDate, num(p.startBalance),
    p.createdAt, p.updatedAt, s(p.cadence),
  ];
}
export function rowToPeriod(r: string[]): BudgetPeriod {
  return {
    id: s(r[0]), label: s(r[1]), startDate: s(r[2]), endDate: s(r[3]),
    startBalance: pn(r[4]), createdAt: s(r[5]), updatedAt: s(r[6]),
    cadence: (s(r[7]) || "monthly") as BudgetPeriod["cadence"],
  };
}

// ---- Money ----
export function moneyToRow(m: MoneyRow): string[] {
  return [
    m.id, m.periodId, m.kind, m.name, m.category, num(m.budgeted), num(m.actual),
    m.dueDate, b(m.paid), b(m.remind), m.calendarEventId, m.createdAt, m.updatedAt, s(m.fundId),
    b(m.repeats), s(m.repeatsUntil),
  ];
}
export function rowToMoney(r: string[]): MoneyRow {
  return {
    id: s(r[0]), periodId: s(r[1]), kind: (s(r[2]) || "expense") as MoneyRow["kind"],
    name: s(r[3]), category: s(r[4]), budgeted: pn(r[5]), actual: pn(r[6]),
    dueDate: s(r[7]), paid: pb(r[8]), remind: pb(r[9]), calendarEventId: s(r[10]),
    createdAt: s(r[11]), updatedAt: s(r[12]), fundId: s(r[13]), repeats: pb(r[14]),
    repeatsUntil: s(r[15]),
  };
}

// ---- Goals ----
// Steps are packed into a single cell so the sheet stays one-row-per-goal.
// Control chars (never typed by a human) separate fields/steps — safe delimiters.
const STEP_FIELD_SEP = "";
const STEP_SEP = "";

function encodeSteps(steps: GoalStep[]): string {
  return steps.map((st) => [st.id, st.text, st.done ? "1" : "0"].join(STEP_FIELD_SEP)).join(STEP_SEP);
}
function decodeSteps(raw: string): GoalStep[] {
  if (!raw) return [];
  return raw.split(STEP_SEP).filter(Boolean).map((chunk) => {
    const [id, text, done] = chunk.split(STEP_FIELD_SEP);
    return { id: id || newId(), text: text ?? "", done: done === "1" };
  });
}

export function goalToRow(g: Goal): string[] {
  return [
    g.id, g.title, g.area, g.why, g.how, g.deadline, g.reward, g.status,
    num(g.progress), g.createdAt, g.updatedAt, encodeSteps(g.steps ?? []), s(g.cover),
  ];
}
export function rowToGoal(r: string[]): Goal {
  return {
    id: s(r[0]), title: s(r[1]), area: s(r[2]) || "Growth", why: s(r[3]), how: s(r[4]),
    deadline: s(r[5]), reward: s(r[6]), status: (s(r[7]) || "NotStarted") as Goal["status"],
    progress: pn(r[8]), createdAt: s(r[9]), updatedAt: s(r[10]),
    steps: decodeSteps(s(r[11])), cover: s(r[12]) || "target",
  };
}

// ---- Funds ----
export function fundToRow(f: Fund): string[] {
  return [f.id, f.name, f.icon, num(f.goalAmount), num(f.currentBalance), num(f.startingAmount), f.goalDate, f.createdAt, f.updatedAt];
}
export function rowToFund(r: string[]): Fund {
  return {
    id: s(r[0]), name: s(r[1]), icon: s(r[2]) || "piggy", goalAmount: pn(r[3]),
    currentBalance: pn(r[4]), startingAmount: pn(r[5]), goalDate: s(r[6]),
    createdAt: s(r[7]), updatedAt: s(r[8]),
  };
}

// ---- Debts ----
export function debtToRow(d: Debt): string[] {
  return [d.id, d.name, num(d.startBalance), num(d.currentBalance), num(d.apr), num(d.minPayment), d.createdAt, d.updatedAt, s(d.notes)];
}
export function rowToDebt(r: string[]): Debt {
  return {
    id: s(r[0]), name: s(r[1]), startBalance: pn(r[2]), currentBalance: pn(r[3]),
    apr: pn(r[4]), minPayment: pn(r[5]), createdAt: s(r[6]), updatedAt: s(r[7]), notes: s(r[8]),
  };
}

// ---- Meals ----
export function mealToRow(m: Meal): string[] {
  return [m.id, m.date, m.slot, m.name, m.ingredients, m.createdAt, m.updatedAt];
}
export function rowToMeal(r: string[]): Meal {
  return {
    id: s(r[0]), date: s(r[1]), slot: (s(r[2]) || "breakfast") as Meal["slot"],
    name: s(r[3]), ingredients: s(r[4]), createdAt: s(r[5]), updatedAt: s(r[6]),
  };
}

// ---- MealSetup (recipe library) ----
export function recipeToRow(r: Recipe): string[] {
  return [r.id, r.name, r.ingredients, r.slot, r.createdAt, r.updatedAt];
}
export function rowToRecipe(r: string[]): Recipe {
  return {
    id: s(r[0]), name: s(r[1]), ingredients: s(r[2]),
    slot: (s(r[3]) || "any") as Recipe["slot"], createdAt: s(r[4]), updatedAt: s(r[5]),
  };
}

// ---- TimeBlocks ----
export function timeBlockToRow(t: TimeBlock): string[] {
  return [t.id, t.date, t.time, t.item, b(t.done), t.createdAt, t.updatedAt];
}
export function rowToTimeBlock(r: string[]): TimeBlock {
  return {
    id: s(r[0]), date: s(r[1]), time: s(r[2]), item: s(r[3]),
    done: pb(r[4]), createdAt: s(r[5]), updatedAt: s(r[6]),
  };
}

// ---- Grocery ----
export function groceryToRow(g: GroceryItem): string[] {
  return [g.id, g.item, g.category, g.qty, b(g.checked), g.source, g.createdAt, g.updatedAt, s(g.unit), s(g.notes)];
}
export function rowToGrocery(r: string[]): GroceryItem {
  return {
    id: s(r[0]), item: s(r[1]), category: s(r[2]), qty: s(r[3]), checked: pb(r[4]),
    source: (s(r[5]) || "manual") as GroceryItem["source"], createdAt: s(r[6]), updatedAt: s(r[7]),
    unit: s(r[8]), notes: s(r[9]),
  };
}

// ---- Workouts ----
export function workoutToRow(w: Workout): string[] {
  return [
    w.id, w.date, w.muscleGroup, b(w.restDay), w.exercise, num(w.sets), num(w.reps), num(w.weight),
    b(w.done), w.createdAt, w.updatedAt, s(w.rest), s(w.time), s(w.speed), s(w.distance),
  ];
}
export function rowToWorkout(r: string[]): Workout {
  return {
    id: s(r[0]), date: s(r[1]), muscleGroup: s(r[2]), restDay: pb(r[3]),
    exercise: s(r[4]), sets: pn(r[5]), reps: pn(r[6]), weight: pn(r[7]),
    done: pb(r[8]), createdAt: s(r[9]), updatedAt: s(r[10]),
    rest: s(r[11]), time: s(r[12]), speed: s(r[13]), distance: s(r[14]),
  };
}

// ---- WeightLog ----
export function weightToRow(w: WeightEntry): string[] {
  return [w.id, w.participant, w.date, num(w.weight), num(w.height), w.createdAt, w.updatedAt];
}
export function rowToWeight(r: string[]): WeightEntry {
  return {
    id: s(r[0]), participant: s(r[1]) || "Me", date: s(r[2]), weight: pn(r[3]),
    height: pn(r[4]), createdAt: s(r[5]), updatedAt: s(r[6]),
  };
}

// ---- Hydration ----
export function hydrationToRow(h: HydrationEntry): string[] {
  return [h.id, h.date, num(h.ml), h.createdAt, h.updatedAt];
}
export function rowToHydration(r: string[]): HydrationEntry {
  return { id: s(r[0]), date: s(r[1]), ml: pn(r[2]), createdAt: s(r[3]), updatedAt: s(r[4]) };
}
