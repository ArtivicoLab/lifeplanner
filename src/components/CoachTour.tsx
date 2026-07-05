// 3-step coach-mark tour, shown once on first run (Dashboard only). Spotlights
// a real, existing element per step via a `data-tour="<key>"` attribute (see
// DashboardScreen, TabBar, Sidebar) — never invents UI that isn't there.
// "Seen forever" persists in plain localStorage (a UI preference, not user
// data, so it deliberately does NOT ride along with the IndexedDB reset/
// activate flow in stores/bootstrap.ts).
import { useEffect, useLayoutEffect, useState } from "react";

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
    body: "Everything due today lives in this one card — check things off right here as you go.",
  },
  {
    target: "stats",
    title: "Your numbers, up top",
    body: "Overdue tasks, what's left to spend, habit streak, and goal progress. Tap any of them to jump straight in.",
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
    body: "Budget, Goals, Meals, Fitness, and every other module are always just one tap away.",
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

export function CoachTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    function place() {
      const key = STEPS[step].target;
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)
      );
      // Mobile and desktop chrome both carry the attribute; only one is
      // actually on screen at a given width — pick whichever has real size.
      const visible = candidates.find((el) => el.getClientRects().length > 0);
      setRect(visible ? visible.getBoundingClientRect() : null);
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step]);

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
      <div className="tour__card">
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
