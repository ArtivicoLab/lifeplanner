// Coach-mark tour. Each screen has its own short coach, scoped to only what's
// actually rendered there right now — no cross-screen auto-navigation. A step
// spotlights a real, existing element via a `data-tour="<key>"` attribute (see
// the various screens, TabBar, Sidebar) — never invents UI that isn't there.
// Steps whose target isn't currently in the DOM (e.g. a card that only shows
// once you have goals) are filtered out before the tour ever opens, so a page
// with nothing relevant to show just doesn't open one.
// "Seen forever" (for the one automatic first-run showing, on the Dashboard)
// persists in plain localStorage — a UI preference, not user data, so it
// deliberately does NOT ride along with the IndexedDB reset/activate flow in
// stores/bootstrap.ts.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type CSSProperties } from "react";
import { useRoute, type Route } from "../router";
import { Segmented } from "./Segmented";
import { isDemo } from "../lib/demo";
import { loadSampleIntoStores, setDemoMode } from "../stores/bootstrap";
import { useTasks } from "../stores/useTasks";
import { useHabits } from "../stores/useHabits";
import { useBudget } from "../stores/useBudget";
import {
  useGoals, useFunds, useDebts, useMeals, useGrocery,
  useWorkouts, useWeight, useHydration, useRecipes, useTimeBlocks,
} from "../stores/v2";

const TOUR_SEEN_KEY = "tourSeen";

interface TourStep {
  target: string; // matches a `data-tour` attribute value
  route?: Route; // screen this target lives on — omit for "dashboard"
  title: string;
  body: string;
  // Some targets only exist while the user is mid-action (e.g. the calendar
  // entry pickers appear only while typing). When a step names a `demo`, the
  // tour fires `coach:<demo>-on` while it's open so the screen can render a
  // safe, non-saving example that puts the target on screen to point at.
  demo?: string;
}

const STEPS: TourStep[] = [
  // ---------- Dashboard ----------
  {
    target: "nav-calendar",
    title: "Not sure where to start? Start here",
    body: "Everything in Life Planner can begin on your Calendar. Open it, tap any day, and just type: a task, a bill, a goal, a workout, a meal, groceries, even your weight or water. It figures out where each one belongs, so you can run your whole planner from one place.",
  },
  {
    target: "today",
    title: "Today, at a glance",
    body: "Everything due today lives in this one card. Check things off right here as you go. Overdue items and today's planned meals dock right in too, so this one card is your whole morning check-in.",
  },
  {
    target: "timeblock-card",
    title: "Today's schedule",
    body: "Once you've blocked out slots for today in Time Blocking, they show up here with a completion ring. Tick one off right on this card, or tap it to jump into the full day view.",
  },
  {
    target: "task-status-card",
    title: "Where your tasks stand",
    body: "How many tasks still need attention and how your open ones break down by status, across every category. Tap View to jump straight to what's overdue.",
  },
  {
    target: "stats",
    title: "Your numbers, up top",
    body: "Overdue tasks, what's left to spend, habit streak, and goal progress. Tap any of them to jump straight into that section.",
  },
  {
    target: "finances",
    title: "Your budget, tracked",
    body: "Once you set up a budget, this card shows what's left to spend, budget vs. actual for income, bills, expenses and savings, and your upcoming bills, right here, without opening the Budget tab.",
  },
  {
    target: "goals-card",
    title: "Goals in progress",
    body: "Every active goal and its own progress bar, driven by the step checklist you set up for it in Goals.",
  },
  {
    target: "wealth-tiles",
    title: "Savings & debt payoff",
    body: "How close each savings fund is to its target, and when you'll be debt-free based on your chosen payoff strategy (snowball or avalanche).",
  },
  {
    target: "habits-card",
    title: "This week's habits",
    body: "Add a habit and it lands here. Check off each day right on this card, and a 28-day grid fills in below to show your streak building over time.",
  },
  {
    target: "fitness-card",
    title: "Workouts this week",
    body: "Log a workout and this card charts your sessions for the week at a glance. No need to open the Fitness tab to see how you're doing.",
  },
  {
    target: "wellness-tiles",
    title: "Hydration, weight & grocery",
    body: "Quick tiles for today's water intake, your latest weigh-in, and your grocery list. Each one taps through to its full screen to log or edit.",
  },
  {
    target: "nav-more",
    title: "Everything else lives here",
    body: "Budget, Goals, Savings, Debt Payoff, Meals, Grocery, Fitness, Weight, Hydration, Recurring, Time Blocking: every module has its own full screen, one tap away. Each one has its own quick coach too, look for the compass.",
  },
  // ---------- Overview ----------
  {
    target: "tasks-insights",
    route: "tasks",
    title: "Your task stats",
    body: "Total, completion rate, overdue, and due-soon counts update live. Tap \"Show charts\" for breakdowns by status, category, priority, and who's assigned what.",
  },
  {
    target: "tasks-segmented",
    route: "tasks",
    title: "Today, Upcoming, Overdue, All",
    body: "Switch views to see just what's due today, what's coming up, what's overdue, or everything at once.",
  },
  {
    target: "tasks-filters",
    route: "tasks",
    title: "Filter and sort",
    body: "Tap a category chip above to filter by it. A chip lights up when something in that category needs attention. Narrow further by status, priority, or assignee, and pick how the list sorts.",
  },
  {
    target: "tasks-fab",
    route: "tasks",
    title: "Quick capture, anywhere",
    body: "Tap + to add a one-off to-do or a recurring routine in seconds. Use the tabs and filters above to slice your list by status, priority, category, or assignee.",
  },
  {
    target: "calendar-head",
    route: "calendar",
    title: "This is where everything starts",
    body: "Tap any day and type anything: a task, a bill, a goal, a workout, a meal, groceries, even your weight or water. It guesses which one it is and shows a pill; tap the pill to fix it before saving. You can run your whole planner from right here, no need to visit each tab.",
  },
  {
    target: "calendar-filters",
    route: "calendar",
    title: "Show or hide what you see",
    body: "Tap a source (Tasks, Bills, Goals, Fitness) to hide it from the grid entirely.",
  },
  {
    target: "calendar-subfilters",
    route: "calendar",
    title: "Filter by category and section",
    body: "These chips fine-tune the grid: dim a category (Home, Work, Finance…) or a status to hide it, or pick a single priority or person to focus on. Tap again to bring everything back.",
  },
  {
    target: "calendar-grid",
    route: "calendar",
    title: "Tap in, type anything",
    body: "Tap + on any day to add something right there, tap an item to complete it, or tap its text to open and edit it. Tap the date number to see the whole day in a sheet.",
  },
  {
    target: "capture-pickers",
    route: "calendar",
    demo: "calendar-demo",
    title: "Set the type and category",
    body: "As soon as you type an entry, these two buttons appear next to it. The first sets what kind of thing it is (Task, Bill, Goal, Meal…); the second sets its category (Home, Work, Finance…). We guess both. Tap either to change it before it saves.",
  },
  // ---------- Organization ----------
  {
    target: "goals-list",
    route: "goals",
    title: "Track real progress",
    body: "Tap a goal to edit its why, how, deadline, and reward. Check off steps right here on the card. Progress updates automatically as you go.",
  },
  {
    target: "goals-fab",
    route: "goals",
    title: "Goals with real progress",
    body: "Add a goal, then break it into a checklist of steps. Progress updates automatically as you check steps off. No manual percentage to fuss with.",
  },
  {
    target: "habits-tabs",
    route: "habits",
    title: "Habits or Month",
    body: "Habits shows this week's checkboxes and a mini streak grid for each habit. Switch to Month for the full picture across every habit at once.",
  },
  {
    target: "habits-week",
    route: "habits",
    title: "Tap a day to mark it done",
    body: "Check off each day as you go. The flame shows your current streak, and the ring tracks this week's progress toward your goal.",
  },
  {
    target: "habits-fab",
    route: "habits",
    title: "Streaks that stick",
    body: "Add a habit, then tap a day to mark it done. Switch to Month view for the full picture: streaks, weekly rings, and a combined grid across every habit.",
  },
  {
    target: "recurring-list",
    route: "recurring",
    title: "Every upcoming occurrence",
    body: "Each series lists its next several dates. Tick one off right here, or tap it to edit just that occurrence without touching the rest of the series.",
  },
  {
    target: "recurring-manage",
    route: "recurring",
    title: "Manage a whole series",
    body: "Recurring routines are created from Tasks (choose Repeat when adding one). Come back here to pause, end, or delete the whole series. Editing one occurrence never touches past ones; editing the series only changes what's still upcoming.",
  },
  {
    target: "timeblock-setup",
    route: "timeblock",
    title: "Set your day's shape",
    body: "Pick your start time and slot length here, and watch the ring track how much of today's plan is checked off.",
  },
  {
    target: "timeblock-fill",
    route: "timeblock",
    title: "A real plan, not just a list",
    body: "Tap \"Fill from today's tasks\" to drop everything due today into time slots automatically, instead of typing each one in by hand. Set your day's start time and slot length in Settings.",
  },
  {
    target: "timeblock-slots",
    route: "timeblock",
    title: "Type into any slot",
    body: "Click a slot and type anything, or pick from today's tasks in the dropdown. Tick a filled slot when it's done.",
  },
  // ---------- Finances ----------
  {
    target: "budget-period",
    route: "budget",
    title: "Switch or rename your period",
    body: "Tap here to change or rename the current budget period: weekly, biweekly, or monthly, your call.",
  },
  {
    target: "budget-leftspend",
    route: "budget",
    title: "What's actually left",
    body: "Left to spend is your start balance plus real income, minus real bills, expenses, debt payments and savings: the number that matters day to day.",
  },
  {
    target: "budget-leftbudget",
    route: "budget",
    title: "What's still unassigned",
    body: "Left to budget compares your planned income to what you've already assigned to bills, expenses, debt and savings. It only uses planned amounts, so it updates the moment you add or change a line, before anything actually happens.",
  },
  {
    target: "budget-charts",
    route: "budget",
    title: "Budget vs. actual",
    body: "See how your plan compares to what really happened for income, bills, expenses, debt and savings, plus a full breakdown and cash-flow ledger below.",
  },
  {
    target: "budget-breakdown",
    route: "budget",
    title: "Budgeted vs. Actual: two different numbers",
    body: "Budgeted is what you planned when you added a line, your bill's usual amount, for example. Actual is what really happened, entered separately on that same line. For a fixed bill they're often identical, so it can feel repetitive to enter both, but logging Actual on its own is what lets you catch a bill that came in higher or lower than planned. This chart is built entirely from Actual, not Budgeted, so it stays empty until you fill Actual in too.",
  },
  {
    target: "budget-cashflow",
    route: "budget",
    title: "See both columns side by side",
    body: "Every row here shows Budget and Actual next to each other, from your start balance down to what's left, so you can see exactly where a plan and reality diverge.",
  },
  {
    target: "budget-rows-income",
    route: "budget",
    title: "Income",
    body: "Add your paychecks and any other income here. Set Budgeted to what you expect, then fill in Actual once it actually lands. Turn on \"Repeats each period\" for anything steady, like a regular paycheck, so it carries into every new period automatically.",
  },
  {
    target: "budget-rows-bill",
    route: "budget",
    title: "Bills: Budgeted once, Actual as it happens",
    body: "When you add a bill you set Budgeted: what you expect to pay. Fill in Actual on that same line once you know what really happened. Rent is usually the same both times, type it twice and move on. A bill that varies, like electric, is exactly why Actual exists as its own field. Press and hold the repeat or bell icon on any line to see what it does before tapping it.",
  },
  {
    target: "budget-rows-expense",
    route: "budget",
    title: "Expenses",
    body: "Everyday spending that isn't a fixed bill: groceries, gas, going out. Log Actual as you spend so \"Left to spend\" and the charts above stay current.",
  },
  {
    target: "budget-rows-debt",
    route: "budget",
    title: "Debt",
    body: "Track what you actually pay toward each debt this period. For the full payoff picture, balances, interest, and a payoff date, head over to the Debt Payoff screen.",
  },
  {
    target: "budget-rows-saving",
    route: "budget",
    title: "Savings",
    body: "Money you're setting aside this period. Link a line to a fund over in Savings and its balance updates automatically every time you log Actual here.",
  },
  {
    target: "budget-fab",
    route: "budget",
    title: "Add income, bills, or expenses",
    body: "Tap + to add a line to this period. \"Left to spend\" and the budget-vs-actual bars update the moment you log a real payment against it.",
  },
  {
    target: "savings-totals",
    route: "savings",
    title: "Every fund, at a glance",
    body: "Total saved across all your funds, how much is left to reach every goal, and how many goals you've already hit.",
  },
  {
    target: "savings-funds",
    route: "savings",
    title: "Each fund's own ring",
    body: "Tap a fund to edit it. The repeat icon means it's linked to a Budget savings line. Entering an amount there updates this ring automatically.",
  },
  {
    target: "savings-fab",
    route: "savings",
    title: "Fund specific goals",
    body: "Add a fund for something you're saving toward. Link it to a Budget savings line and its balance updates automatically every period.",
  },
  {
    target: "debt-overview",
    route: "debt",
    title: "Your debt-free date",
    body: "See the month you'll be debt-free and total interest paid, based on your strategy and any extra payment below.",
  },
  {
    target: "debt-months-chart",
    route: "debt",
    title: "Months to debt-free, per debt",
    body: "One bar per debt: how many months from today until that specific one is paid off. This is a projection, not history. It's calculated fresh from each debt's current balance, APR, and minimum payment, plus your strategy and extra payment below. Change any of those and every bar updates instantly.",
  },
  {
    target: "debt-strategy",
    route: "debt",
    title: "Snowball, avalanche, or your own order",
    body: "Snowball pays the smallest balance first for fast wins. Avalanche pays the highest interest rate first to save the most money. Custom lets you set the order yourself. Your payoff date updates either way.",
  },
  {
    target: "debt-schedule",
    route: "debt",
    title: "The full payment schedule",
    body: "Month-by-month payment, interest, and remaining balance across every debt, all the way to debt-free. It's a projection starting from today's numbers, assuming you keep paying the minimums plus your extra every month, not a record of what you've actually paid. Once a debt is fully paid off, its old minimum rolls into the next one instead of disappearing, so the payment total can run higher than the minimums still owed add up to.",
  },
  // ---------- Wellness ----------
  {
    target: "mealsetup-list",
    route: "mealsetup",
    title: "Your reusable recipes",
    body: "This is your recipe library, separate from any specific day. Tap a recipe to edit its name, default meal slot, or ingredients. Nothing here shows up on a calendar by itself, it's just the reusable source you pick from when you plan an actual meal.",
  },
  {
    target: "mealsetup-fab",
    route: "mealsetup",
    title: "Add a recipe",
    body: "Tap this to open the New recipe sheet: give it a name, pick a default meal slot (Breakfast, Lunch, Dinner, or Snack, whichever it's usually eaten at), and list its ingredients separated by commas. Save it once here and it's done, no retyping later. Back in Meal Planner, tap any day's slot and this recipe appears as a one-tap chip under \"From your library\" that fills in the name and ingredients for you, and its ingredients flow straight into Grocery once you generate a list for that week.",
  },
  {
    target: "mealsetup-delete",
    route: "mealsetup",
    title: "Removing a recipe",
    body: "This only removes it from your library going forward, it won't touch any meal you've already planned with it. Meals keep their own copy of the name and ingredients from the moment you picked them, so past and already-planned days stay exactly as they are.",
  },
  {
    target: "meals-nav",
    route: "meals",
    title: "Day or week",
    body: "Step through days or whole weeks, or tap the date to jump back to today.",
  },
  {
    target: "meals-slot",
    route: "meals",
    title: "Plan meals by day or by slot",
    body: "Tap breakfast, lunch, dinner, or a snack slot to plan a meal from your recipe library. Generate a grocery list from the whole week in one tap.",
  },
  {
    target: "meals-grocery-gen",
    route: "meals",
    title: "One tap, full list",
    body: "Turns every meal planned this week into a categorized grocery list, ready to shop from.",
  },
  {
    target: "grocery-progress",
    route: "grocery",
    title: "Track what's in the cart",
    body: "See how many items you've checked off, and clear everything you've already grabbed in one tap.",
  },
  {
    target: "grocery-fab",
    route: "grocery",
    title: "Your list, built for you",
    body: "Items fill in automatically from planned meals, or add your own by tapping +. Tap any item (not just the checkbox) to edit its quantity, unit, or category.",
  },
  {
    target: "fitness-nav",
    route: "fitness",
    title: "Log by day, or plan a week",
    body: "Step through days, or switch to Week to see your whole week's workouts and rest days at a glance. Tick \"Rest day\" to keep your streaks honest.",
  },
  {
    target: "fitness-fab",
    route: "fitness",
    title: "Log it, or mark a rest day",
    body: "Tap + to log a workout by muscle group and sets. Mark rest days so your streaks stay honest instead of just going blank.",
  },
  {
    target: "weight-units",
    route: "weight",
    title: "Imperial or metric",
    body: "Switch units any time. Every entry, chart, and BMI calculation updates instantly. Imperial height is entered as feet and inches, not a single number.",
  },
  {
    target: "weight-current",
    route: "weight",
    title: "Your latest reading, and BMI",
    body: "Your most recent weight, shown in the other unit too (lb with kg, or kg with lb), plus your logged height in both formats. BMI (Body Mass Index) on the right estimates whether your weight fits your height, using just those two numbers, it stays blank until an entry has a height logged. It's most useful for watching your own trend move over time, not as a single verdict, tap the ? for the full ranges.",
  },
  {
    target: "weight-charts",
    route: "weight",
    title: "Trend over time",
    body: "Your last entries charted so you can see the direction things are moving, not just the latest number.",
  },
  {
    target: "weight-bmi",
    route: "weight",
    title: "BMI over time",
    body: "The same trend, but for BMI (Body Mass Index) instead of raw weight, so you can see that estimate move over time instead of just today's number. Only appears once at least one entry has a height logged, since BMI needs both numbers together. Rough ranges: under 18.5 underweight, 18.5-24.9 typical, 25-29.9 above typical, 30+ well above typical, it's a screening number, not a full health picture.",
  },
  {
    target: "weight-history",
    route: "weight",
    title: "Full history, with day-over-day change",
    body: "Every entry, most recent first, with how much it changed from the one before and that day's BMI. Tap \"Show all\" if you've logged more than 14.",
  },
  {
    target: "weight-fab",
    route: "weight",
    title: "Track trend, not just a number",
    body: "Log an entry to see your trend, BMI, and day-over-day change. If more than one person in the house logs here, tap \"Compare all\" to see everyone on one chart.",
  },
  {
    target: "hydration-ring",
    route: "hydration",
    title: "Today's intake",
    body: "Watch the ring fill as you log water against your daily goal.",
  },
  {
    target: "hydration-quickadd",
    route: "hydration",
    title: "One tap per glass",
    body: "Tap a quick-add amount to log water against your daily goal instantly. No typing needed. Set your goal below.",
  },
  {
    target: "hydration-goal",
    route: "hydration",
    title: "Set your daily goal",
    body: "Adjust your daily target here any time, or reset today's count if you need a do-over.",
  },
  // ---------- Wrap-up ----------
  {
    target: "settings-sheets",
    route: "settings",
    title: "It's your data, in your Google Sheet",
    body: "Everything works fully offline on this device first. Connect your own Google Sheet here and it becomes the backup and single source of truth, synced automatically after that.",
  },
  {
    target: "settings-categories",
    route: "settings",
    title: "Your color tags",
    body: "Add, rename, or recolor the tags your tasks and routines use. Tap a tag's name to rename it, or its dot to change its color.",
  },
  {
    target: "settings-sections",
    route: "settings",
    title: "Show only what you use",
    body: "Hide modules you don't need to declutter the sidebar and More menu. Nothing is deleted, and hidden sections stay one tap away if you bring them back.",
  },
  {
    target: "settings-yearreset",
    route: "settings",
    title: "Fresh start each year",
    body: "Clear out a year's history without rebuilding the whole planner. Your recurring templates, habits, goals, funds, debts and recipes all stay exactly as they are.",
  },
];

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked (private mode etc.) — don't force the tour
  }
}

function markTourSeen() {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // ignore — worst case the tour reappears next visit
  }
}

function targetExists(key: string): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)).some(
    (el) => el.getClientRects().length > 0
  );
}

const CARD_GAP = 16;

export function CoachTour({ onDone }: { onDone: () => void }) {
  const currentRoute = useRoute();
  const [openedRoute] = useState(currentRoute);
  const [pageSteps, setPageSteps] = useState<TourStep[] | null>(null);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardTop, setCardTop] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // The tour needs something to point at. A real buyer's account is EMPTY, so
  // if the user isn't already in demo we load the sample data into the stores
  // for the duration of the tour (so every step has a filled card to spotlight)
  // and restore their real, empty data on close.
  const wasDemo = useRef(isDemo());
  const [sampleOn, setSampleOn] = useState(true); // the tour starts populated
  const [dataTick, setDataTick] = useState(0); // bump to re-measure after a toggle

  // A synchronous snapshot of the real user's data, taken before we swap in the
  // sample, so restoring is instant (no async IndexedDB read that could race a
  // StrictMode re-mount and clobber the freshly-loaded sample).
  const realSnap = useRef<{
    tasks: unknown[]; recurrences: unknown[]; habits: unknown[]; log: unknown[];
    periods: unknown[]; money: unknown[]; currentPeriodId: string;
    goals: unknown[]; funds: unknown[]; debts: unknown[]; meals: unknown[]; grocery: unknown[];
    workouts: unknown[]; weight: unknown[]; hydration: unknown[]; recipes: unknown[]; timeblocks: unknown[];
  } | null>(null);

  function captureReal() {
    realSnap.current = {
      tasks: useTasks.getState().tasks, recurrences: useTasks.getState().recurrences,
      habits: useHabits.getState().habits, log: useHabits.getState().log,
      periods: useBudget.getState().periods, money: useBudget.getState().money,
      currentPeriodId: useBudget.getState().currentPeriodId,
      goals: useGoals.getState().items, funds: useFunds.getState().items, debts: useDebts.getState().items,
      meals: useMeals.getState().items, grocery: useGrocery.getState().items,
      workouts: useWorkouts.getState().items, weight: useWeight.getState().items,
      hydration: useHydration.getState().items, recipes: useRecipes.getState().items,
      timeblocks: useTimeBlocks.getState().items,
    };
  }
  function restoreReal() {
    const s = realSnap.current;
    if (!s) return;
    useTasks.getState().setAll(s.tasks as never, s.recurrences as never);
    useHabits.getState().setAll(s.habits as never, s.log as never);
    useBudget.getState().setAll(s.periods as never, s.money as never);
    useBudget.setState({ currentPeriodId: s.currentPeriodId });
    useGoals.getState().setAll(s.goals as never);
    useFunds.getState().setAll(s.funds as never);
    useDebts.getState().setAll(s.debts as never);
    useMeals.getState().setAll(s.meals as never);
    useGrocery.getState().setAll(s.grocery as never);
    useWorkouts.getState().setAll(s.workouts as never);
    useWeight.getState().setAll(s.weight as never);
    useHydration.getState().setAll(s.hydration as never);
    useRecipes.getState().setAll(s.recipes as never);
    useTimeBlocks.getState().setAll(s.timeblocks as never);
  }

  // The on-card toggle: flip between the sample data (so the tour has content)
  // and the user's own data. For someone already in demo it drives the real,
  // persistent demo flag (so they can turn demo off right here); for a real
  // user it's a temporary preview reverted when the tour closes.
  function toggleSample(on: boolean) {
    setSampleOn(on);
    if (wasDemo.current) {
      void setDemoMode(on);
    } else if (on) {
      loadSampleIntoStores();
    } else {
      restoreReal();
    }
    requestAnimationFrame(() => setDataTick((t) => t + 1));
  }

  // Drag-to-move: once the user drags the card by its grip, it stays where they
  // put it (dragPos wins over the auto above/below-the-spotlight placement).
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  function onGripDown(e: RPointerEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onGripMove(e: RPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const card = cardRef.current;
    if (!card) return;
    const x = Math.max(6, Math.min(e.clientX - dragOffset.current.dx, window.innerWidth - card.offsetWidth - 6));
    const y = Math.max(6, Math.min(e.clientY - dragOffset.current.dy, window.innerHeight - card.offsetHeight - 6));
    setDragPos({ x, y });
  }
  function onGripUp(e: RPointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  // The tour is scoped to whichever screen it was opened on. If the user
  // navigates elsewhere while it's up (a nav tap, a card link), just close it
  // rather than following them — each screen's coach is its own thing now.
  useEffect(() => {
    if (currentRoute !== openedRoute) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoute]);

  // Build this page's step list once: only what's actually on screen right now.
  // If the user isn't already in demo, snapshot their (empty) data and load the
  // sample first so every step has a filled card to point at. Steps with a
  // `demo` also fire a `coach:<demo>-on` event; then we poll a few frames for
  // the freshly-rendered targets before deciding which steps survive.
  useLayoutEffect(() => {
    const filled = !wasDemo.current;
    if (filled) { captureReal(); loadSampleIntoStores(); }

    const relevant = STEPS.filter((s) => (s.route ?? "dashboard") === openedRoute);
    const demoKeys = [...new Set(relevant.map((s) => s.demo).filter(Boolean) as string[])];
    demoKeys.forEach((k) => window.dispatchEvent(new Event(`coach:${k}-on`)));

    let rafId = 0, cancelled = false, frames = 0;
    const measure = () => relevant.filter((s) => targetExists(s.target));
    if (filled || demoKeys.length) {
      const poll = () => {
        if (cancelled) return;
        const found = measure();
        if (found.length > 0 || frames >= 12) { setPageSteps(found); return; }
        frames++;
        rafId = requestAnimationFrame(poll);
      };
      rafId = requestAnimationFrame(poll);
    } else {
      setPageSteps(measure());
    }
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      demoKeys.forEach((k) => window.dispatchEvent(new Event(`coach:${k}-off`)));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the real user's (empty) data when the tour closes. Demo-origin users
  // keep whatever the toggle last set, so only revert for someone who started
  // outside demo.
  useEffect(() => () => { if (!wasDemo.current) restoreReal(); }, []);

  useEffect(() => {
    if (pageSteps && pageSteps.length === 0) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSteps]);

  useLayoutEffect(() => {
    if (!pageSteps || pageSteps.length === 0) return;

    function findTarget() {
      const key = pageSteps![step].target;
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)
      );
      // Mobile and desktop chrome both carry the attribute; only one is
      // actually on screen at a given width — pick whichever has real size.
      return candidates.find((el) => el.getClientRects().length > 0);
    }
    function place() {
      const visible = findTarget();
      setRect(visible ? visible.getBoundingClientRect() : null);
    }
    // Some steps target cards further down a long screen scroll (or, on
    // desktop, further down the sidebar's own nested scroll) — bring the new
    // target into view before measuring. Instant + synchronous, so there's no
    // animation to race against the scroll listener below. Tall cards (e.g.
    // Today) scroll to their top edge so the heading stays visible; smaller
    // ones center for a nicer frame.
    const target = findTarget();
    if (target) {
      const tall = target.getBoundingClientRect().height > window.innerHeight * 0.55;
      target.scrollIntoView({ block: tall ? "start" : "center", behavior: "auto" });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step, pageSteps, dataTick]);

  // Anchor the card above or below the spotlighted element (whichever side
  // has room) so it never sits on top of the thing it's explaining — the
  // bottom tab bar targets especially, which used to sit right under the
  // fixed-bottom card. Falls back to the default bottom-sheet CSS position
  // when there's no target (or somehow no room on either side).
  useLayoutEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl || !rect) {
      setCardTop(null);
      return;
    }
    const vh = window.innerHeight;
    const cardH = cardEl.offsetHeight;
    // Work off the portion of the target actually on screen — a target
    // taller than the viewport (e.g. Today) has no true "above" or "below",
    // so comparing against the full off-screen rect would just pick
    // whichever side is relatively bigger and still overlap it.
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, vh);
    const spaceBelow = vh - visibleBottom;
    const spaceAbove = visibleTop;
    if (spaceBelow >= cardH + CARD_GAP) {
      setCardTop(visibleBottom + CARD_GAP);
    } else if (spaceAbove >= cardH + CARD_GAP) {
      setCardTop(visibleTop - cardH - CARD_GAP);
    } else {
      // Neither side fits — pin to the bottom edge so the card stays fully
      // visible; the target's top (and its heading) is what we scrolled to,
      // so it remains visible above the card.
      setCardTop(Math.max(CARD_GAP, vh - cardH - CARD_GAP));
    }
  }, [rect, step]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    // Any completed coach — on any page — is enough to stop auto-popping
    // the first-run one; it only needs to fire once, ever.
    markTourSeen();
    onDone();
  }

  function next() {
    if (!pageSteps || step >= pageSteps.length - 1) finish();
    else setStep((s) => s + 1);
  }

  function prev() {
    setStep((s) => Math.max(0, s - 1));
  }

  if (!pageSteps || pageSteps.length === 0) return null;

  const s = pageSteps[step];
  const isLast = step === pageSteps.length - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={s.title}>
      <div className="tour__scrim" style={{ background: rect ? "transparent" : undefined }} onClick={finish} />
      {rect && (
        <div
          className="tour__spot"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div
        ref={cardRef}
        className="tour__card"
        style={
          dragPos
            ? { left: dragPos.x, top: dragPos.y, right: "auto", bottom: "auto", transform: "none" }
            : cardTop === null
              ? undefined
              : ({ top: cardTop, bottom: "auto" } as CSSProperties)
        }
      >
        <div
          className="tour__grip"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          title="Drag to move"
          aria-label="Drag to move"
        />
        <div className="tour__dots">
          {pageSteps.map((st, i) => (
            <span key={st.target} className={`tour__dot${i === step ? " tour__dot--on" : ""}`} />
          ))}
        </div>
        <div className="tour__title">{s.title}</div>
        <p className="tour__body">{s.body}</p>
        <div className="tour__demo">
          <Segmented
            options={[{ value: "sample", label: "Sample data" }, { value: "mine", label: "My data" }]}
            value={sampleOn ? "sample" : "mine"}
            onChange={(v) => toggleSample(v === "sample")}
          />
        </div>
        <div className="tour__actions">
          <button className="btn btn--ghost" onClick={finish}>Skip</button>
          <div className="tour__actions-right">
            {step > 0 && <button className="btn btn--ghost" onClick={prev}>Back</button>}
            <button className="btn btn--primary" onClick={next}>{isLast ? "Got it" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
