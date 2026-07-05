// Coach-mark tour, shown once on first run (Dashboard only). Spotlights
// a real, existing element per step via a `data-tour="<key>"` attribute (see
// DashboardScreen, TabBar, Sidebar) — never invents UI that isn't there.
// "Seen forever" persists in plain localStorage (a UI preference, not user
// data, so it deliberately does NOT ride along with the IndexedDB reset/
// activate flow in stores/bootstrap.ts).
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const TOUR_SEEN_KEY = "tourSeen";

interface TourStep {
  target: string; // matches a `data-tour` attribute value
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
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
    target: "nav-tasks",
    title: "Add anything, anytime",
    body: "Tasks is quick capture: tap the + there to add a to-do or routine in seconds.",
  },
  {
    target: "nav-calendar",
    title: "Your calendar can do it all",
    body: "Tasks, bills, goals, workouts — everything shows up here in one view. Type anything into quick-add and we'll figure out where it belongs, so you never have to leave the calendar to plan your day.",
  },
  {
    target: "nav-habits",
    title: "Build your streaks",
    body: "Log daily habits here and watch the weekly grid fill in as you go.",
  },
  {
    target: "nav-more",
    title: "Everything else lives here",
    body: "Budget, Goals, Savings, Debt, Meals, Grocery, Fitness, Hydration, Weight — every module the dashboard previews has its own full screen here, one tap away.",
  },
  {
    target: "settings",
    title: "It's your data, in your Google Sheet",
    body: "Everything works fully offline on this device first. Tap here any time to connect your own Google Sheet — it becomes the backup and the single source of truth, synced automatically after that.",
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
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardTop, setCardTop] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
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
    // Several steps target cards further down the long dashboard scroll (or,
    // on desktop, further down the sidebar's own nested scroll) — bring the
    // new target into view before measuring. Instant + synchronous, so there's
    // no animation to race against the scroll listener below (some steps sit
    // in the same scroll container, so a smooth scroll left mid-flight here
    // used to settle on stale coordinates once the next step re-measured).
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
  }, [step]);

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
