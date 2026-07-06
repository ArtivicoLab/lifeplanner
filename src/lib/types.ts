// Domain types — mirror the Google Sheet schema (see schema.ts).

export type Priority = "VeryLow" | "Low" | "Medium" | "High" | "VeryHigh";
export type Status =
  | "NotStarted"
  | "InProgress"
  | "OnHold"
  | "Pending"
  | "Delayed"
  | "Completed"
  | "Cancelled";

export type Frequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | `every_n_weeks:${number}`
  | "monthly"
  | `every_n_months:${number}`
  | "yearly";

export interface Task {
  id: string;
  title: string;
  notes: string;
  category: string;
  priority: Priority;
  status: Status;
  assignee: string; // task owner / "assigned to" — "" = nobody
  dueDate: string; // ISO yyyy-mm-dd, "" allowed
  recurrenceId: string; // "" = one-time
  occurrenceDate: string; // which occurrence a materialized recurring row is
  remind: boolean;
  calendarEventId: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recurrence {
  id: string;
  title: string;
  notes: string;
  category: string;
  priority: Priority;
  assignee: string; // task owner / "assigned to" — "" = nobody
  frequency: Frequency;
  anchorDate: string; // ISO yyyy-mm-dd — first occurrence
  endDate: string; // optional
  remind: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Habit {
  id: string;
  name: string;
  icon: string; // emoji
  goalPerWeek: number; // 1..7
  active: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface HabitLogEntry {
  id: string;
  habitId: string;
  date: string; // ISO yyyy-mm-dd
  done: boolean;
}

export type BudgetCadence = "monthly" | "biweekly" | "weekly" | "paycheck" | "custom";

export interface BudgetPeriod {
  id: string;
  label: string;
  cadence: BudgetCadence;
  startDate: string;
  endDate: string;
  startBalance: number;
  createdAt: string;
  updatedAt: string;
}

export type MoneyKind = "income" | "bill" | "expense" | "saving" | "debt";

export interface MoneyRow {
  id: string;
  periodId: string;
  kind: MoneyKind;
  name: string;
  category: string;
  budgeted: number;
  actual: number;
  dueDate: string; // bills
  paid: boolean;
  remind: boolean;
  calendarEventId: string;
  createdAt: string;
  updatedAt: string;
  fundId: string; // kind:"saving" only — links to a Fund; "" = not linked.
  // Changing `actual` on a linked row auto-adjusts the fund's currentBalance.
}

export interface Settings {
  name: string; // what to call the user in greetings ("" = not set yet)
  currency: string;
  weekStart: 0 | 1; // 0 = Sunday, 1 = Monday
  theme: "auto" | "light" | "dark";
  digestTime: string; // "" = off, else "HH:mm"
  digestEventId: string; // Calendar event id for the digest — local-only, per device (Settings isn't a synced Sheet tab)
  unitSystem: "imperial" | "metric";
  hydrationGoalMl: number;
  debtStrategy: "snowball" | "avalanche" | "custom";
  debtOrder: string[]; // debt ids, custom payoff priority (strategy:"custom" only)
  monthlyExtra: number; // extra $ toward debt each month
  timeblockStart: string; // "HH:mm" — first slot of the day
  timeblockInterval: number; // minutes per slot (30 or 60)
  categories: string[]; // user-editable task/recurrence categories (add/rename/remove)
  categoryColors: Record<string, string>; // category name -> chosen swatch token; falls back to the auto-assigned color if unset
  hiddenRoutes: string[]; // nav sections the user has hidden (still reachable by URL)
  householdMembers: string[]; // shared name list — feeds Task assignee + Weight participant suggestions
  tabBarRoutes: string[]; // pinned routes shown in the mobile bottom bar, in order ("more" is always appended, never stored here)
  accessCode: string; // Etsy purchase code the buyer entered ("" = not activated)
  activated: boolean; // true once a valid accessCode was entered — unlocks Google Sheets connect
  hideAtsHint?: boolean;
  tourDone?: boolean;
}

// ---------- v2 modules ----------
export type GoalArea = "Health" | "Finance" | "Career" | "Growth" | "Relationship";

export interface GoalStep {
  id: string;
  text: string;
  done: boolean;
}

export interface Goal {
  id: string;
  title: string;
  area: string;
  why: string;
  how: string;
  deadline: string; // ISO
  reward: string;
  status: "NotStarted" | "InProgress" | "Completed";
  progress: number; // 0..100 — auto-derived from steps when steps exist
  steps: GoalStep[]; // "steps to reach goal" checklist; empty = use manual progress
  cover: string; // icon name — the vision-board "cover" for the goal card
  createdAt: string;
  updatedAt: string;
}

export interface Fund {
  id: string;
  name: string;
  icon: string; // icon name
  goalAmount: number;
  currentBalance: number;
  startingAmount: number;
  goalDate: string; // ISO
  createdAt: string;
  updatedAt: string;
}

export interface Debt {
  id: string;
  name: string;
  startBalance: number;
  currentBalance: number;
  apr: number; // annual %
  minPayment: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

/** A reusable meal/recipe in the Meal Setup library — plan meals FROM these. */
export interface Recipe {
  id: string;
  name: string;
  ingredients: string; // comma/newline separated
  slot: MealSlot | "any"; // default slot suggestion
  createdAt: string;
  updatedAt: string;
}

export interface Meal {
  id: string;
  date: string; // ISO
  slot: MealSlot;
  name: string;
  ingredients: string; // comma/newline separated
  createdAt: string;
  updatedAt: string;
}

export interface GroceryItem {
  id: string;
  item: string;
  category: string;
  qty: string;
  unit: string;
  notes: string;
  checked: boolean;
  source: "meal" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface Workout {
  id: string;
  date: string; // ISO
  muscleGroup: string; // "Cardio" switches the form to time/speed/distance
  restDay: boolean;
  exercise: string;
  sets: number;
  reps: number;
  weight: number;
  rest: string; // rest between sets, free text e.g. "1 min" (strength only)
  time: string; // duration, free text e.g. "30 min" (cardio only)
  speed: string; // free text e.g. "6 mph" (cardio only)
  distance: string; // free text e.g. "3 mi" (cardio only)
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WeightEntry {
  id: string;
  participant: string;
  date: string; // ISO
  weight: number; // in the current unit system
  height: number; // in / cm depending on unit system
  createdAt: string;
  updatedAt: string;
}

export interface HydrationEntry {
  id: string;
  date: string; // ISO (one row per day)
  ml: number;
  createdAt: string;
  updatedAt: string;
}

/** One time-block slot: a task/label parked at a specific time on a day. */
export interface TimeBlock {
  id: string;
  date: string; // ISO yyyy-mm-dd
  time: string; // "HH:mm" (24h)
  item: string; // free text or a task title
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A calendar-facing occurrence: either computed (virtual) or backed by a real Task row. */
export interface Occurrence {
  key: string; // `${recurrenceId}:${date}` for recurring, or task id
  date: string; // ISO yyyy-mm-dd
  title: string;
  category: string;
  priority: Priority;
  assignee: string;
  recurrenceId: string;
  taskId?: string; // present when materialized
  status: Status;
  remind: boolean;
  virtual: boolean; // true = not yet a real Tasks row
}

export const PRIORITIES: Priority[] = [
  "VeryLow",
  "Low",
  "Medium",
  "High",
  "VeryHigh",
];
// Order mirrors the reference "STATUS" legend (Task Tracker slide).
export const STATUSES: Status[] = [
  "Completed",
  "Delayed",
  "OnHold",
  "Pending",
  "NotStarted",
  "InProgress",
  "Cancelled",
];
export const DEFAULT_CATEGORIES = [
  "Home",
  "Work",
  "Health",
  "Finance",
  "Growth",
];
