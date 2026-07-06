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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRoute, type Route } from "../router";

const TOUR_SEEN_KEY = "tourSeen";

interface TourStep {
  target: string; // matches a `data-tour` attribute value
  route?: Route; // screen this target lives on — omit for "dashboard"
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  // ---------- Dashboard ----------
  {
    target: "today",
    title: "Today, at a glance",
    body: "Everything due today lives in this one card — check things off right here as you go. Overdue items and today's planned meals dock right in too, so this one card is your whole morning check-in.",
  },
  {
    target: "stats",
    title: "Your numbers, up top",
    body: "Overdue tasks, what's left to spend, habit streak, and goal progress. Tap any of them to jump straight into that section.",
  },
  {
    target: "finances",
    title: "Your budget, tracked",
    body: "What's left to spend this period, plus budget vs. actual for income, bills, expenses, and savings, and your next few upcoming bills — all without opening the Budget tab.",
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
    body: "Check off today's habits right here, and the 28-day grid below shows your streak building over time.",
  },
  {
    target: "fitness-card",
    title: "Workouts this week",
    body: "A quick bar chart of how many sessions you've logged so far this week — log a workout any day to fill it in.",
  },
  {
    target: "wellness-tiles",
    title: "Hydration, weight & grocery",
    body: "Today's water intake, your latest weigh-in with BMI, and how many grocery items are still unchecked — each tile taps through to the full screen.",
  },
  {
    target: "nav-more",
    title: "Everything else lives here",
    body: "Budget, Goals, Savings, Debt Payoff, Meals, Grocery, Fitness, Weight, Hydration, Recurring, Time Blocking — every module has its own full screen, one tap away. Each one has its own quick coach too — look for the compass.",
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
    body: "Tap a category chip above to filter by it — a chip lights up when something in that category needs attention. Narrow further by status, priority, or assignee, and pick how the list sorts.",
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
    title: "One box, anything you type",
    body: "Tap any day and type anything — a task, a bill, a goal, a workout, a meal, groceries, even your weight or water. We guess what it is and show a pill; tap the pill to fix it before saving.",
  },
  {
    target: "calendar-filters",
    route: "calendar",
    title: "Show or hide what you see",
    body: "Tap a source (Tasks, Bills, Goals, Fitness) to hide it from the grid. Once tasks are showing, filter further by category, priority, or status right below.",
  },
  {
    target: "calendar-grid",
    route: "calendar",
    title: "Tap in, type anything",
    body: "Tap + on any day to add something right there, tap an item to complete it, or tap its text to open and edit it. Tap the date number to see the whole day in a sheet.",
  },
  // ---------- Organization ----------
  {
    target: "goals-list",
    route: "goals",
    title: "Track real progress",
    body: "Tap a goal to edit its why, how, deadline, and reward. Check off steps right here on the card — progress updates automatically as you go.",
  },
  {
    target: "goals-fab",
    route: "goals",
    title: "Goals with real progress",
    body: "Add a goal, then break it into a checklist of steps. Progress updates automatically as you check steps off — no manual percentage to fuss with.",
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
    body: "Check off each day as you go — the flame shows your current streak, and the ring tracks this week's progress toward your goal.",
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
    body: "Each series lists its next several dates — tick one off right here, or tap it to edit just that occurrence without touching the rest of the series.",
  },
  {
    target: "recurring-manage",
    route: "recurring",
    title: "Manage a whole series",
    body: "Recurring routines are created from Tasks (choose Repeat when adding one) — come back here to pause, end, or delete the whole series. Editing one occurrence never touches past ones; editing the series only changes what's still upcoming.",
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
    body: "Tap here to change or rename the current budget period — weekly, biweekly, or monthly, your call.",
  },
  {
    target: "budget-leftspend",
    route: "budget",
    title: "What's actually left",
    body: "Left to spend is your start balance plus real income, minus real bills, expenses, debt payments and savings — the number that matters day to day.",
  },
  {
    target: "budget-charts",
    route: "budget",
    title: "Budget vs. actual",
    body: "See how your plan compares to what really happened for income, bills, expenses, debt and savings, plus a full breakdown and cash-flow ledger below.",
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
    body: "Tap a fund to edit it. The repeat icon means it's linked to a Budget savings line — entering an amount there updates this ring automatically.",
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
    target: "debt-strategy",
    route: "debt",
    title: "Snowball, avalanche, or your own order",
    body: "Snowball pays the smallest balance first for fast wins. Avalanche pays the highest interest rate first to save the most money. Custom lets you set the order yourself — your payoff date updates either way.",
  },
  {
    target: "debt-schedule",
    route: "debt",
    title: "The full payment schedule",
    body: "Month-by-month payment, interest, and remaining balance across every debt, all the way to debt-free.",
  },
  // ---------- Wellness ----------
  {
    target: "mealsetup-list",
    route: "mealsetup",
    title: "Your reusable recipes",
    body: "Tap a recipe to edit its ingredients or default meal slot — build this once, then pick it in Meal Planner without retyping anything.",
  },
  {
    target: "mealsetup-fab",
    route: "mealsetup",
    title: "Build your recipe library",
    body: "Add recipes here once — this is your reusable library, separate from day-to-day planning. Plan them onto specific days over in Meal Planner.",
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
    body: "Switch units any time — every entry, chart, and BMI calculation updates instantly.",
  },
  {
    target: "weight-charts",
    route: "weight",
    title: "Trend over time",
    body: "See your last entries charted, plus BMI if you've logged your height, and a full history table below with day-over-day change.",
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
    body: "Tap a quick-add amount to log water against your daily goal instantly — no typing needed. Set your goal below.",
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
    body: "Everything works fully offline on this device first. Connect your own Google Sheet here and it becomes the backup and single source of truth — synced automatically after that.",
  },
  {
    target: "settings-categories",
    route: "settings",
    title: "Your color tags",
    body: "Add, rename, or recolor the tags your tasks and routines use — tap a tag's name to rename it, or its dot to change its color.",
  },
  {
    target: "settings-sections",
    route: "settings",
    title: "Show only what you use",
    body: "Hide modules you don't need to declutter the sidebar and More menu — nothing is deleted, and hidden sections stay one tap away if you bring them back.",
  },
  {
    target: "settings-yearreset",
    route: "settings",
    title: "Fresh start each year",
    body: "Clear out a year's history without rebuilding the whole planner — your recurring templates, habits, goals, funds, debts and recipes all stay exactly as they are.",
  },
  {
    target: "privacy-source",
    route: "privacy",
    title: "See for yourself",
    body: "The entire source is public. Open your browser's Network tab and you'll see no third-party calls — nothing leaves this device except to your own Google account, only if you connect it.",
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

  // The tour is scoped to whichever screen it was opened on. If the user
  // navigates elsewhere while it's up (a nav tap, a card link), just close it
  // rather than following them — each screen's coach is its own thing now.
  useEffect(() => {
    if (currentRoute !== openedRoute) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoute]);

  // Build this page's step list once: only what's actually on screen right
  // now (e.g. no "Goals in progress" card tip if there are no goals yet).
  useLayoutEffect(() => {
    const relevant = STEPS.filter((s) => (s.route ?? "dashboard") === openedRoute);
    setPageSteps(relevant.filter((s) => targetExists(s.target)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [step, pageSteps]);

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
        style={cardTop === null ? undefined : { top: cardTop, bottom: "auto" }}
      >
        <div className="tour__dots">
          {pageSteps.map((st, i) => (
            <span key={st.target} className={`tour__dot${i === step ? " tour__dot--on" : ""}`} />
          ))}
        </div>
        <div className="tour__title">{s.title}</div>
        <p className="tour__body">{s.body}</p>
        <div className="tour__actions">
          <button className="btn btn--ghost" onClick={finish}>Skip</button>
          <button className="btn btn--primary" onClick={next}>{isLast ? "Got it" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
