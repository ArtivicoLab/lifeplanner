// Sample data (spec §6.7 step 4): 6 tasks (2 recurring), 3 habits w/ a week of
// history, 1 filled budget period. Dates are anchored relative to "today" so the
// demo always looks alive.

import { newId, nowIso } from "./id";
import { addDaysISO, todayISO } from "./dates";
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

export interface Seed {
  tasks: Task[];
  recurrences: Recurrence[];
  habits: Habit[];
  habitLog: HabitLogEntry[];
  periods: BudgetPeriod[];
  money: MoneyRow[];
  goals: Goal[];
  funds: Fund[];
  debts: Debt[];
  meals: Meal[];
  grocery: GroceryItem[];
  workouts: Workout[];
  weight: WeightEntry[];
  hydration: HydrationEntry[];
  recipes: Recipe[];
  timeblocks: TimeBlock[];
}

export function buildSample(): Seed {
  const ts = nowIso();
  const today = todayISO();

  // Deterministic, stable ids so re-seeding overwrites the same records instead of
  // creating duplicates (idempotent). Every buildSample() call yields identical ids.
  let idN = 0;
  const newId = () => `smpl-${++idN}`;

  const task = (p: Partial<Task>): Task => ({
    id: newId(),
    title: "",
    notes: "",
    category: "Home",
    priority: "Medium",
    status: "NotStarted",
    assignee: "",
    dueDate: "",
    recurrenceId: "",
    occurrenceDate: "",
    remind: false,
    calendarEventId: "",
    completedAt: "",
    createdAt: ts,
    updatedAt: ts,
    ...p,
  });

  const tasks: Task[] = [
    task({ title: "Review bank statement", category: "Finance", priority: "High", assignee: "Me", status: "InProgress", dueDate: today }),
    task({ title: "Organize closet", category: "Home", priority: "Low", assignee: "Alex", status: "Pending", dueDate: today }),
    task({ title: "Write blog post", category: "Growth", priority: "Medium", assignee: "Me", status: "NotStarted", dueDate: addDaysISO(today, 2) }),
    task({ title: "Reply to emails", category: "Work", priority: "Medium", assignee: "Sophie", status: "OnHold", dueDate: addDaysISO(today, -2) }),
    task({ title: "Take vitamins", category: "Health", priority: "Low", assignee: "David", status: "Completed", completedAt: ts, dueDate: addDaysISO(today, -1) }),
    task({ title: "Finish report", category: "Work", priority: "VeryHigh", assignee: "Michael", status: "Delayed", dueDate: addDaysISO(today, -3) }),
    task({ title: "Plan weekly tasks", category: "Home", priority: "Medium", assignee: "Emily", status: "InProgress", dueDate: addDaysISO(today, 1) }),
    task({ title: "Grocery run", category: "Home", priority: "High", assignee: "Alex", status: "Pending", dueDate: addDaysISO(today, 3) }),
  ];

  // 2 recurring templates
  const recurrences: Recurrence[] = [
    {
      id: newId(),
      title: "Deep clean kitchen",
      notes: "Wipe counters, scrub sink",
      category: "Home",
      priority: "Medium",
      assignee: "Alex",
      frequency: "weekly",
      anchorDate: addDaysISO(today, -7),
      endDate: "",
      remind: false,
      active: true,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: newId(),
      title: "Pay bills",
      notes: "",
      category: "Finance",
      priority: "High",
      assignee: "Me",
      frequency: "monthly",
      anchorDate: addDaysISO(today, -3),
      endDate: "",
      remind: true,
      active: true,
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  // 3 habits + a week of history
  const habitDefs = [
    { name: "Drink water", icon: "droplet", goalPerWeek: 7 },
    { name: "Move 30 min", icon: "run", goalPerWeek: 5 },
    { name: "Read", icon: "book", goalPerWeek: 6 },
  ];
  const habits: Habit[] = habitDefs.map((h, i) => ({
    id: newId(),
    name: h.name,
    icon: h.icon,
    goalPerWeek: h.goalPerWeek,
    active: true,
    order: i,
    createdAt: ts,
    updatedAt: ts,
  }));

  const habitLog: HabitLogEntry[] = [];
  const donePattern = [
    [1, 1, 1, 0, 1, 1, 1], // water
    [1, 0, 1, 1, 0, 1, 0], // move
    [1, 1, 0, 1, 1, 1, 0], // read
  ];
  habits.forEach((h, hi) => {
    for (let d = 0; d < 7; d++) {
      const date = addDaysISO(today, -6 + d);
      if (donePattern[hi][d]) {
        habitLog.push({ id: newId(), habitId: h.id, date, done: true });
      }
    }
  });

  // 1 filled budget period covering this month-ish
  const periodId = newId();
  const periods: BudgetPeriod[] = [
    {
      id: periodId,
      label: "This period",
      cadence: "monthly",
      startDate: addDaysISO(today, -10),
      endDate: addDaysISO(today, 20),
      startBalance: 500,
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  const m = (p: Partial<MoneyRow>): MoneyRow => ({
    id: newId(),
    periodId,
    kind: "expense",
    name: "",
    category: "",
    budgeted: 0,
    actual: 0,
    dueDate: "",
    paid: false,
    remind: false,
    calendarEventId: "",
    createdAt: ts,
    updatedAt: ts,
    fundId: "",
    ...p,
  });

  const emergencyFundId = newId();
  const money: MoneyRow[] = [
    m({ kind: "income", name: "Paycheck", budgeted: 3000, actual: 3000 }),
    m({ kind: "income", name: "Side gig", budgeted: 400, actual: 350 }),
    m({ kind: "bill", name: "Rent", category: "Housing", budgeted: 1200, actual: 1200, dueDate: addDaysISO(today, 5), paid: false, remind: true }),
    m({ kind: "bill", name: "Electric", category: "Utilities", budgeted: 60, actual: 72, dueDate: addDaysISO(today, 8), paid: false }),
    m({ kind: "bill", name: "Internet", category: "Utilities", budgeted: 50, actual: 50, dueDate: addDaysISO(today, 12), paid: true }),
    m({ kind: "expense", name: "Groceries", category: "Food", budgeted: 400, actual: 260 }),
    m({ kind: "expense", name: "Dining out", category: "Food", budgeted: 150, actual: 190 }),
    m({ kind: "expense", name: "Transport", category: "Auto", budgeted: 120, actual: 80 }),
    // Linked to the "Emergency fund" Fund below — demonstrates the auto-sync:
    // editing `actual` here moves the fund's currentBalance by the same delta.
    m({ kind: "saving", name: "Emergency fund", budgeted: 300, actual: 300, fundId: emergencyFundId }),
    m({ kind: "debt", name: "Credit card", category: "Debt", budgeted: 200, actual: 200, dueDate: addDaysISO(today, 10), paid: false }),
    m({ kind: "debt", name: "Student loans", category: "Debt", budgeted: 200, actual: 200, dueDate: addDaysISO(today, 25), paid: false }),
  ];

  // ---- v2 modules ----
  const goalSteps = (labels: [string, boolean][]) =>
    labels.map(([text, done]) => ({ id: newId(), text, done }));
  const runSteps = goalSteps([
    ["Research a couch-to-10K plan", true],
    ["Buy proper running shoes", true],
    ["Run 3x/week for 4 weeks", false],
    ["Complete a 5K test run", false],
    ["Register for a local 10K", false],
  ]);
  const fundSteps = goalSteps([
    ["Open a separate savings account", true],
    ["Set up autopay of $300/payday", true],
    ["Reach $1,000", true],
    ["Reach $2,500", true],
    ["Reach $3,500", true],
    ["Reach $4,000", false],
    ["Reach $4,500", false],
    ["Reach $5,000 (fully funded)", false],
  ]);
  const pct = (steps: { done: boolean }[]) =>
    steps.length ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100) : 0;

  const goals: Goal[] = [
    {
      id: newId(), title: "Run a 10K", area: "Health",
      why: "Feel stronger and clear my head.", how: "Follow a couch-to-10K plan, 3 runs/week.",
      deadline: addDaysISO(today, 75), reward: "New running shoes", cover: "run",
      status: "InProgress", progress: pct(runSteps), steps: runSteps, createdAt: ts, updatedAt: ts,
    },
    {
      id: newId(), title: "Build a $5k emergency fund", area: "Finance",
      why: "Peace of mind if something breaks.", how: "Auto-transfer $300 every payday.",
      deadline: addDaysISO(today, 200), reward: "A weekend away", cover: "piggy",
      status: "InProgress", progress: pct(fundSteps), steps: fundSteps, createdAt: ts, updatedAt: ts,
    },
  ];

  const funds: Fund[] = [
    { id: emergencyFundId, name: "Emergency fund", icon: "piggy", goalAmount: 5000, currentBalance: 3100, startingAmount: 0, goalDate: addDaysISO(today, 200), createdAt: ts, updatedAt: ts },
    { id: newId(), name: "Vacation", icon: "sun", goalAmount: 2000, currentBalance: 650, startingAmount: 0, goalDate: addDaysISO(today, 160), createdAt: ts, updatedAt: ts },
    { id: newId(), name: "New laptop", icon: "star", goalAmount: 1500, currentBalance: 1500, startingAmount: 0, goalDate: addDaysISO(today, 30), createdAt: ts, updatedAt: ts },
  ];

  const debts: Debt[] = [
    { id: newId(), name: "Credit card", startBalance: 4000, currentBalance: 2400, apr: 19.9, minPayment: 80, notes: "", createdAt: ts, updatedAt: ts },
    { id: newId(), name: "Car loan", startBalance: 12000, currentBalance: 7200, apr: 6.5, minPayment: 240, notes: "", createdAt: ts, updatedAt: ts },
    { id: newId(), name: "Student loan", startBalance: 9000, currentBalance: 5600, apr: 4.2, minPayment: 120, notes: "", createdAt: ts, updatedAt: ts },
  ];

  const mealSlots: Meal["slot"][] = ["breakfast", "lunch", "dinner"];
  const meals: Meal[] = mealSlots.map((slot, i) => ({
    id: newId(), date: today, slot,
    name: ["Greek yogurt & berries", "Chicken salad", "Salmon & rice"][i],
    ingredients: [
      "Greek yogurt, Blueberries, Honey",
      "Chicken breast, Lettuce, Tomato, Olive oil",
      "Salmon, Rice, Broccoli",
    ][i],
    createdAt: ts, updatedAt: ts,
  }));

  const grocery: GroceryItem[] = [
    { id: newId(), item: "Greek yogurt", category: "Dairy", qty: "1", unit: "cup", notes: "", checked: false, source: "meal", createdAt: ts, updatedAt: ts },
    { id: newId(), item: "Blueberries", category: "Produce", qty: "1", unit: "cup", notes: "", checked: false, source: "meal", createdAt: ts, updatedAt: ts },
    { id: newId(), item: "Chicken breast", category: "Meat & Poultry", qty: "1", unit: "lb", notes: "", checked: false, source: "meal", createdAt: ts, updatedAt: ts },
    { id: newId(), item: "Salmon", category: "Seafood", qty: "1", unit: "lb", notes: "", checked: false, source: "meal", createdAt: ts, updatedAt: ts },
    { id: newId(), item: "Paper towels", category: "Household", qty: "2", unit: "pack", notes: "", checked: false, source: "manual", createdAt: ts, updatedAt: ts },
  ];

  const wo = (p: Partial<Workout>): Workout => ({
    id: newId(), date: today, muscleGroup: "Chest", restDay: false, exercise: "",
    sets: 0, reps: 0, weight: 0, rest: "", time: "", speed: "", distance: "",
    done: false, createdAt: ts, updatedAt: ts, ...p,
  });
  const workouts: Workout[] = [
    wo({ muscleGroup: "Chest", exercise: "Bench press", sets: 4, reps: 8, weight: 135, rest: "2 min" }),
    wo({ muscleGroup: "Chest", exercise: "Incline dumbbell", sets: 3, reps: 10, weight: 40, rest: "90 sec" }),
    wo({ muscleGroup: "Chest", exercise: "Cable fly", sets: 3, reps: 12, weight: 25, rest: "60 sec", done: true }),
    wo({ muscleGroup: "Cardio", exercise: "Cycling", time: "30 min", speed: "16 mph", distance: "8 mi", date: addDaysISO(today, -1) }),
    wo({ restDay: true, exercise: "Rest day", muscleGroup: "", date: addDaysISO(today, -2) }),
  ];

  const weight: WeightEntry[] = Array.from({ length: 7 }, (_, i) => ({
    id: newId(), participant: "Me", date: addDaysISO(today, -6 + i),
    weight: 168 - i * 0.4, height: 70, createdAt: ts, updatedAt: ts,
  }));

  const hydration: HydrationEntry[] = [
    { id: newId(), date: today, ml: 1250, createdAt: ts, updatedAt: ts },
  ];

  const recipes: Recipe[] = [
    { id: newId(), name: "Greek yogurt & berries", slot: "breakfast", ingredients: "Greek yogurt, Blueberries, Honey", createdAt: ts, updatedAt: ts },
    { id: newId(), name: "Chicken salad", slot: "lunch", ingredients: "Chicken breast, Lettuce, Tomato, Olive oil", createdAt: ts, updatedAt: ts },
    { id: newId(), name: "Salmon & rice", slot: "dinner", ingredients: "Salmon, Rice, Broccoli", createdAt: ts, updatedAt: ts },
    { id: newId(), name: "Overnight oats", slot: "breakfast", ingredients: "Oats, Milk, Banana, Peanut butter", createdAt: ts, updatedAt: ts },
  ];

  const tb = (time: string, item: string, done = false): TimeBlock => ({
    id: newId(), date: today, time, item, done, createdAt: ts, updatedAt: ts,
  });
  const timeblocks: TimeBlock[] = [
    tb("06:30", "30-min walk", true),
    tb("07:00", "Breakfast + vitamins", true),
    tb("09:00", "Deep work: report"),
    tb("12:00", "Lunch"),
    tb("14:00", "Reply to emails"),
    tb("18:00", "Grocery run"),
  ];

  return {
    tasks, recurrences, habits, habitLog, periods, money,
    goals, funds, debts, meals, grocery, workouts, weight, hydration, recipes, timeblocks,
  };
}
