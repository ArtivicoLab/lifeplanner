// Sample data (spec §6.7 step 4): 6 tasks (2 recurring), 3 habits w/ a week of
// history, 1 filled budget period. Dates are anchored relative to "today" so the
// demo always looks alive.
//
// Habit check-ins, weight, workouts, and budget periods additionally carry a
// full year of backdated history (not just the last 7 days) so streak grids,
// weight trend charts, past workouts on the Calendar, and switching between
// budget periods all have real depth to demo/test, not just a single week.

import { newId, nowIso } from "./id";
import { addDaysISO, addMonthsISO, todayISO } from "./dates";
import { computePeriodRange } from "./budget";
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

  // PAST fill: realistic one-off tasks scattered through the last ~6 months, all
  // marked done so they populate past Calendar months without piling up as
  // "overdue" on the dashboard. (Future dates are filled by the recurring
  // templates below — the recurrence engine expands those lazily out to 2030+,
  // so we never store a row per future day.)
  const TASK_POOL: Partial<Task>[] = [
    { title: "Dentist appointment", category: "Health", priority: "Medium", assignee: "Me" },
    { title: "Call mom", category: "Home", priority: "Low", assignee: "Me" },
    { title: "Team standup", category: "Work", priority: "Medium", assignee: "Sophie" },
    { title: "Pay credit card", category: "Finance", priority: "High", assignee: "Me" },
    { title: "Read a chapter", category: "Growth", priority: "Low", assignee: "Me" },
    { title: "Water the plants", category: "Home", priority: "Low", assignee: "Emily" },
    { title: "Submit expense report", category: "Work", priority: "High", assignee: "Michael" },
    { title: "Oil change", category: "Home", priority: "Medium", assignee: "Alex" },
    { title: "Plan weekend trip", category: "Growth", priority: "Low", assignee: "Sophie" },
    { title: "Doctor checkup", category: "Health", priority: "Medium", assignee: "David" },
    { title: "Update resume", category: "Growth", priority: "Medium", assignee: "Me" },
    { title: "Clean the garage", category: "Home", priority: "Low", assignee: "Michael" },
    { title: "Review the budget", category: "Finance", priority: "Medium", assignee: "Me" },
    { title: "Coffee with a friend", category: "Growth", priority: "Low", assignee: "Emily" },
  ];
  let poolIdx = 0;
  for (let d = -182; d <= -4; d += 2) {
    const tmpl = TASK_POOL[poolIdx % TASK_POOL.length];
    poolIdx++;
    tasks.push(task({ ...tmpl, status: "Completed", completedAt: ts, dueDate: addDaysISO(today, d) }));
  }

  // Recurring templates are what keep the Calendar full on EVERY date, all the
  // way out to 2030 and beyond, without storing a row per day — the recurrence
  // engine expands them lazily for whatever window is on screen. A daily
  // template guarantees every single date has something; the weeklies (spread
  // across the week via staggered future anchors) and monthlies add variety.
  //
  // Anchors are at/after today on purpose: a template anchored in the PAST
  // would generate undone past occurrences that show up as "overdue" and blow
  // up the dashboard's count. Past dates are instead filled by the completed
  // one-off tasks above.
  const rec = (p: Partial<Recurrence>): Recurrence => ({
    id: newId(),
    title: "",
    notes: "",
    category: "Home",
    priority: "Medium",
    assignee: "Me",
    frequency: "weekly",
    anchorDate: today,
    endDate: "", // no end -> repeats forever (fills 2030+)
    remind: false,
    active: true,
    createdAt: ts,
    updatedAt: ts,
    ...p,
  });
  const recurrences: Recurrence[] = [
    // Daily — puts an item on every single day from today forward.
    rec({ title: "Morning routine", notes: "Stretch, water, plan the day", category: "Health", frequency: "daily", anchorDate: today }),
    // Weeklies, each anchored on a different upcoming weekday so the week is
    // varied rather than everything landing on the same day.
    rec({ title: "Team meeting", category: "Work", priority: "Medium", assignee: "Sophie", frequency: "weekly", anchorDate: addDaysISO(today, 1) }),
    rec({ title: "Gym session", category: "Health", priority: "High", assignee: "Me", frequency: "weekly", anchorDate: addDaysISO(today, 2) }),
    rec({ title: "Grocery shopping", category: "Home", priority: "Medium", assignee: "Alex", frequency: "weekly", anchorDate: addDaysISO(today, 3) }),
    rec({ title: "Meal prep", category: "Home", priority: "Low", assignee: "Emily", frequency: "weekly", anchorDate: addDaysISO(today, 4) }),
    rec({ title: "Family time", category: "Growth", priority: "Low", assignee: "David", frequency: "weekly", anchorDate: addDaysISO(today, 5) }),
    rec({ title: "Deep clean kitchen", notes: "Wipe counters, scrub sink", category: "Home", assignee: "Alex", frequency: "weekly", anchorDate: addDaysISO(today, 6) }),
    // Monthlies.
    rec({ title: "Pay bills", category: "Finance", priority: "High", assignee: "Me", frequency: "monthly", anchorDate: today, remind: true }),
    rec({ title: "Review goals", category: "Growth", priority: "Medium", assignee: "Me", frequency: "monthly", anchorDate: addDaysISO(today, 10) }),
    rec({ title: "Car maintenance check", category: "Home", priority: "Low", assignee: "Michael", frequency: "monthly", anchorDate: addDaysISO(today, 18) }),
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

  // A full year of check-ins (not just the trailing week) so streaks, the
  // 28-day heat grid, and Month view all have real history to show, not just
  // the first few weeks after a fresh seed.
  const habitLog: HabitLogEntry[] = [];
  const donePattern = [
    [1, 1, 1, 0, 1, 1, 1], // water
    [1, 0, 1, 1, 0, 1, 0], // move
    [1, 1, 0, 1, 1, 1, 0], // read
  ];
  const HABIT_HISTORY_DAYS = 365;
  habits.forEach((h, hi) => {
    for (let d = 0; d < HABIT_HISTORY_DAYS; d++) {
      const date = addDaysISO(today, -(HABIT_HISTORY_DAYS - 1) + d);
      if (donePattern[hi][d % 7]) {
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
    repeats: false,
    ...p,
  });

  const emergencyFundId = newId();
  const money: MoneyRow[] = [
    m({ kind: "income", name: "Paycheck", budgeted: 3000, actual: 3000, repeats: true }),
    m({ kind: "income", name: "Side gig", budgeted: 400, actual: 350 }),
    m({ kind: "bill", name: "Rent", category: "Housing", budgeted: 1200, actual: 1200, dueDate: addDaysISO(today, 5), paid: false, remind: true, repeats: true }),
    m({ kind: "bill", name: "Electric", category: "Utilities", budgeted: 60, actual: 72, dueDate: addDaysISO(today, 8), paid: false, repeats: true }),
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

  // 11 more calendar-month periods stretching back a full year, each fully
  // filled in and paid, so switching between past periods (and the carry-over
  // math) has real history to test, not just the one in-progress period.
  const [todayYear, todayMonth] = today.split("-");
  const firstOfThisMonth = `${todayYear}-${todayMonth}-01`;
  for (let monthsAgo = 1; monthsAgo <= 11; monthsAgo++) {
    const anchor = addMonthsISO(firstOfThisMonth, -monthsAgo);
    const range = computePeriodRange("monthly", anchor);
    const pastPeriodId = newId();
    // Small deterministic month-to-month wobble so past periods don't all
    // look identical, without relying on Math.random() for a "stable" demo.
    const wobble = 1 + (((monthsAgo * 7) % 5) - 2) * 0.04;
    periods.push({
      id: pastPeriodId,
      label: range.label,
      cadence: "monthly",
      startDate: range.startDate,
      endDate: range.endDate,
      startBalance: Math.round(400 + monthsAgo * 15),
      createdAt: ts,
      updatedAt: ts,
    });
    const pm = (p: Partial<MoneyRow>): MoneyRow => m({ periodId: pastPeriodId, ...p });
    money.push(
      pm({ kind: "income", name: "Paycheck", budgeted: 3000, actual: Math.round(3000 * wobble) }),
      pm({ kind: "bill", name: "Rent", category: "Housing", budgeted: 1200, actual: 1200, dueDate: addDaysISO(range.startDate, 4), paid: true }),
      pm({ kind: "bill", name: "Electric", category: "Utilities", budgeted: 60, actual: Math.round(65 * wobble), dueDate: addDaysISO(range.startDate, 7), paid: true }),
      pm({ kind: "bill", name: "Internet", category: "Utilities", budgeted: 50, actual: 50, dueDate: addDaysISO(range.startDate, 11), paid: true }),
      pm({ kind: "expense", name: "Groceries", category: "Food", budgeted: 400, actual: Math.round(380 * wobble) }),
      pm({ kind: "expense", name: "Dining out", category: "Food", budgeted: 150, actual: Math.round(140 * wobble) }),
      pm({ kind: "expense", name: "Transport", category: "Auto", budgeted: 120, actual: Math.round(100 * wobble) }),
      pm({ kind: "saving", name: "Emergency fund", budgeted: 300, actual: 300 }),
      pm({ kind: "debt", name: "Credit card", category: "Debt", budgeted: 200, actual: 200, dueDate: addDaysISO(range.startDate, 9), paid: true }),
      pm({ kind: "debt", name: "Student loans", category: "Debt", budgeted: 200, actual: 200, dueDate: addDaysISO(range.startDate, 24), paid: true }),
    );
  }

  // Upcoming monthly periods (next full year) so the Calendar's Bills layer and
  // the Budget period switcher are populated forward too, not only in the past.
  // Future bills are unpaid, with future due dates.
  for (let monthsAhead = 1; monthsAhead <= 12; monthsAhead++) {
    const anchor = addMonthsISO(firstOfThisMonth, monthsAhead);
    const range = computePeriodRange("monthly", anchor);
    const futPeriodId = newId();
    periods.push({
      id: futPeriodId,
      label: range.label,
      cadence: "monthly",
      startDate: range.startDate,
      endDate: range.endDate,
      startBalance: 500,
      createdAt: ts,
      updatedAt: ts,
    });
    const fm = (p: Partial<MoneyRow>): MoneyRow => m({ periodId: futPeriodId, ...p });
    money.push(
      fm({ kind: "income", name: "Paycheck", budgeted: 3000, actual: 0 }),
      fm({ kind: "bill", name: "Rent", category: "Housing", budgeted: 1200, actual: 0, dueDate: addDaysISO(range.startDate, 4), paid: false, remind: true }),
      fm({ kind: "bill", name: "Electric", category: "Utilities", budgeted: 60, actual: 0, dueDate: addDaysISO(range.startDate, 7), paid: false }),
      fm({ kind: "bill", name: "Internet", category: "Utilities", budgeted: 50, actual: 0, dueDate: addDaysISO(range.startDate, 11), paid: false }),
      fm({ kind: "expense", name: "Groceries", category: "Food", budgeted: 400, actual: 0 }),
      fm({ kind: "expense", name: "Transport", category: "Auto", budgeted: 120, actual: 0 }),
      fm({ kind: "saving", name: "Emergency fund", budgeted: 300, actual: 0 }),
      fm({ kind: "debt", name: "Credit card", category: "Debt", budgeted: 200, actual: 0, dueDate: addDaysISO(range.startDate, 9), paid: false }),
      fm({ kind: "debt", name: "Student loans", category: "Debt", budgeted: 200, actual: 0, dueDate: addDaysISO(range.startDate, 24), paid: false }),
    );
  }

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

  // A handful more goals with deadlines spread across the year (past = achieved,
  // future = in progress) so the Calendar's Goals layer shows up in many months.
  const extraGoals: [string, Goal["area"], number, string][] = [
    ["Run a 5K", "Health", -95, "run"],
    ["Read 12 books", "Growth", -20, "book"],
    ["Declutter the house", "Home", 45, "target"],
    ["Learn Spanish basics", "Growth", 120, "star"],
    ["Save for a new laptop", "Finance", 30, "piggy"],
    ["Launch a side project", "Growth", 240, "target"],
    ["Family reunion trip", "Home", 300, "sun"],
    ["Hit a 5-day habit streak", "Health", 60, "flame"],
  ];
  extraGoals.forEach(([title, area, days, cover]) => {
    const steps = goalSteps([["Get started", days < 0], ["Make real progress", days < 0], ["Finish it", days < 0]]);
    goals.push({
      id: newId(), title, area,
      why: "", how: "", deadline: addDaysISO(today, days), reward: "", cover,
      status: days < 0 ? "Completed" : "InProgress",
      progress: pct(steps), steps, createdAt: ts, updatedAt: ts,
    });
  });

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
  const mealNames = ["Greek yogurt & berries", "Chicken salad", "Salmon & rice"];
  const mealIngredients = [
    "Greek yogurt, Blueberries, Honey",
    "Chicken breast, Lettuce, Tomato, Olive oil",
    "Salmon, Rice, Broccoli",
  ];
  const meals: Meal[] = mealSlots.map((slot, i) => ({
    id: newId(), date: today, slot,
    name: mealNames[i],
    ingredients: mealIngredients[i],
    createdAt: ts, updatedAt: ts,
  }));
  // Fill out the rest of the current week too, so Meals' Week view (and the
  // "generate grocery list from this week" action) has more than just today
  // to work with, rotating through the same small recipe set.
  for (let d = 1; d <= 6; d++) {
    const date = addDaysISO(today, -d);
    mealSlots.forEach((slot, i) => {
      const idx = (i + d) % mealNames.length;
      meals.push({
        id: newId(), date, slot, name: mealNames[idx], ingredients: mealIngredients[idx],
        createdAt: ts, updatedAt: ts,
      });
    });
  }

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
  // A full year of past workouts on a repeating weekly split, so the Fitness
  // week view further back and the Calendar (past months) both have real
  // history instead of going empty after the first few days.
  const WEEKLY_SPLIT: { muscle: Workout["muscleGroup"]; exercise: string }[] = [
    { muscle: "Chest", exercise: "Bench press" },
    { muscle: "Back", exercise: "Deadlifts" },
    { muscle: "", exercise: "Rest day" },
    { muscle: "Legs", exercise: "Squats" },
    { muscle: "Shoulders", exercise: "Overhead press" },
    { muscle: "Arms", exercise: "Dumbbell curls" },
    { muscle: "Cardio", exercise: "Cycling" },
  ];
  for (let d = 3; d < 365; d++) {
    const date = addDaysISO(today, -d);
    const slot = WEEKLY_SPLIT[d % 7];
    if (!slot.muscle) {
      workouts.push(wo({ date, restDay: true, exercise: "Rest day", muscleGroup: "" }));
    } else if (slot.muscle === "Cardio") {
      workouts.push(wo({ date, muscleGroup: "Cardio", exercise: slot.exercise, time: "30 min", speed: "6 mph", distance: "3 mi", done: true }));
    } else {
      workouts.push(wo({ date, muscleGroup: slot.muscle, exercise: slot.exercise, sets: 3, reps: 10, weight: 50, done: true }));
    }
  }
  // Planned workouts forward on the same split (not yet done) so upcoming Fitness
  // weeks and future Calendar months show a plan, not an empty grid.
  for (let d = 1; d <= 120; d++) {
    const date = addDaysISO(today, d);
    const slot = WEEKLY_SPLIT[d % 7];
    if (!slot.muscle) {
      workouts.push(wo({ date, restDay: true, exercise: "Rest day", muscleGroup: "" }));
    } else if (slot.muscle === "Cardio") {
      workouts.push(wo({ date, muscleGroup: "Cardio", exercise: slot.exercise, time: "30 min", speed: "6 mph", distance: "3 mi", done: false }));
    } else {
      workouts.push(wo({ date, muscleGroup: slot.muscle, exercise: slot.exercise, sets: 3, reps: 10, weight: 50, done: false }));
    }
  }

  // Last 7 days at daily granularity (as before), then a full year of weekly
  // history behind that so the trend chart has a real year to show, not just
  // a flat week.
  const weight: WeightEntry[] = Array.from({ length: 7 }, (_, i) => ({
    id: newId(), participant: "Me", date: addDaysISO(today, -6 + i),
    weight: 168 - i * 0.4, height: 70, createdAt: ts, updatedAt: ts,
  }));
  for (let w = 1; w <= 52; w++) {
    weight.unshift({
      id: newId(), participant: "Me", date: addDaysISO(today, -6 - w * 7),
      weight: 168 + w * 0.35, height: 70, createdAt: ts, updatedAt: ts,
    });
  }

  const hydration: HydrationEntry[] = [
    { id: newId(), date: today, ml: 1250, createdAt: ts, updatedAt: ts },
  ];
  // Fill out the rest of the current week so the "This week" average and
  // chart aren't based on a single day.
  const hydrationPattern = [1450, 1800, 900, 2100, 1600, 1300];
  for (let d = 1; d <= 6; d++) {
    hydration.push({ id: newId(), date: addDaysISO(today, -d), ml: hydrationPattern[d - 1], createdAt: ts, updatedAt: ts });
  }

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
