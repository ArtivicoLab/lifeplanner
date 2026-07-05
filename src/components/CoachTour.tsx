// Coach-mark tour, shown once on first run. Walks the whole app, screen by
// screen — not just the Dashboard — spotlighting a real, existing element per
// step via a `data-tour="<key>"` attribute (see the various screens, TabBar,
// Sidebar) — never invents UI that isn't there. Steps outside "dashboard"
// navigate() there first; the position effect waits for that route to
// actually be live before it measures anything on it.
// "Seen forever" persists in plain localStorage (a UI preference, not user
// data, so it deliberately does NOT ride along with the IndexedDB reset/
// activate flow in stores/bootstrap.ts).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { navigate, useRoute, type Route } from "../router";

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
    body: "Budget, Goals, Savings, Debt Payoff, Meals, Grocery, Fitness, Weight, Hydration, Recurring, Time Blocking — every module has its own full screen, one tap away. Let's walk through each one.",
  },
  // ---------- Overview ----------
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
  // ---------- Organization ----------
  {
    target: "goals-fab",
    route: "goals",
    title: "Goals with real progress",
    body: "Add a goal, then break it into a checklist of steps. Progress updates automatically as you check steps off — no manual percentage to fuss with.",
  },
  {
    target: "habits-fab",
    route: "habits",
    title: "Streaks that stick",
    body: "Add a habit, then tap a day to mark it done. Switch to Month view for the full picture: streaks, weekly rings, and a combined grid across every habit.",
  },
  {
    target: "recurring-manage",
    route: "recurring",
    title: "Manage a whole series",
    body: "Recurring routines are created from Tasks (choose Repeat when adding one) — come back here to pause, end, or delete the whole series. Editing one occurrence never touches past ones; editing the series only changes what's still upcoming.",
  },
  {
    target: "timeblock-fill",
    route: "timeblock",
    title: "A real plan, not just a list",
    body: "Tap \"Fill from today's tasks\" to drop everything due today into time slots automatically, instead of typing each one in by hand. Set your day's start time and slot length in Settings.",
  },
  // ---------- Finances ----------
  {
    target: "budget-period",
    route: "budget",
    title: "Switch or rename your period",
    body: "Tap here to change or rename the current budget period — weekly, biweekly, or monthly, your call.",
  },
  {
    target: "budget-fab",
    route: "budget",
    title: "Add income, bills, or expenses",
    body: "Tap + to add a line to this period. \"Left to spend\" and the budget-vs-actual bars update the moment you log a real payment against it.",
  },
  {
    target: "savings-fab",
    route: "savings",
    title: "Fund specific goals",
    body: "Add a fund for something you're saving toward. Link it to a Budget savings line and its balance updates automatically every period.",
  },
  {
    target: "debt-strategy",
    route: "debt",
    title: "Snowball, avalanche, or your own order",
    body: "Snowball pays the smallest balance first for fast wins. Avalanche pays the highest interest rate first to save the most money. Custom lets you set the order yourself — your payoff date updates either way.",
  },
  // ---------- Wellness ----------
  {
    target: "mealsetup-fab",
    route: "mealsetup",
    title: "Build your recipe library",
    body: "Add recipes here once — this is your reusable library, separate from day-to-day planning. Plan them onto specific days over in Meal Planner.",
  },
  {
    target: "meals-slot",
    route: "meals",
    title: "Plan meals by day or by slot",
    body: "Tap breakfast, lunch, dinner, or a snack slot to plan a meal from your recipe library. Generate a grocery list from the whole week in one tap.",
  },
  {
    target: "grocery-fab",
    route: "grocery",
    title: "Your list, built for you",
    body: "Items fill in automatically from planned meals, or add your own by tapping +. Tap any item (not just the checkbox) to edit its quantity, unit, or category.",
  },
  {
    target: "fitness-fab",
    route: "fitness",
    title: "Log it, or mark a rest day",
    body: "Tap + to log a workout by muscle group and sets. Mark rest days so your streaks stay honest instead of just going blank.",
  },
  {
    target: "weight-fab",
    route: "weight",
    title: "Track trend, not just a number",
    body: "Log an entry to see your trend, BMI, and day-over-day change. If more than one person in the house logs here, tap \"Compare all\" to see everyone on one chart.",
  },
  {
    target: "hydration-quickadd",
    route: "hydration",
    title: "One tap per glass",
    body: "Tap a quick-add amount to log water against your daily goal instantly — no typing needed. Set your goal in Settings.",
  },
  // ---------- Wrap-up ----------
  {
    target: "settings-sheets",
    route: "settings",
    title: "It's your data, in your Google Sheet",
    body: "Everything works fully offline on this device first. Connect your own Google Sheet here and it becomes the backup and single source of truth — synced automatically after that.",
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

const CARD_GAP = 16;

export function CoachTour({ onDone }: { onDone: () => void }) {
  const currentRoute = useRoute();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardTop, setCardTop] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Steps outside "dashboard" need their screen mounted first — hop there via
  // the router and let the position effect below pick it up once the route
  // (read fresh via useRoute(), not a stale closure) actually matches.
  useEffect(() => {
    const wanted = STEPS[step].route ?? "dashboard";
    if (currentRoute !== wanted) {
      setRect(null);
      navigate(wanted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useLayoutEffect(() => {
    const wanted = STEPS[step].route ?? "dashboard";
    if (currentRoute !== wanted) return; // navigation above hasn't landed yet

    function findTarget() {
      const key = STEPS[step].target;
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
    // Several steps target cards further down a long screen scroll (or, on
    // desktop, further down the sidebar's own nested scroll) — bring the new
    // target into view before measuring. Instant + synchronous, so there's no
    // animation to race against the scroll listener below (some steps sit in
    // the same scroll container, so a smooth scroll left mid-flight here used
    // to settle on stale coordinates once the next step re-measured).
    // Tall cards (e.g. Today) scroll to their top edge so the heading stays
    // visible; smaller ones center for a nicer frame.
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
  }, [step, currentRoute]);

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
    markTourSeen();
    onDone();
  }

  function next() {
    if (step >= STEPS.length - 1) finish();
    else setStep((s) => s + 1);
  }

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

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
          {STEPS.map((st, i) => (
            <span key={`${st.route ?? "dashboard"}-${st.target}`} className={`tour__dot${i === step ? " tour__dot--on" : ""}`} />
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
