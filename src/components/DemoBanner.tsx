// A slim, always-visible bar shown whenever demo mode is on, so it's obvious
// you're looking at sample data — and obvious how to leave it. Turning it off
// switches the app to the user's own (blank for a new buyer) planner.
import { useDemo } from "../lib/demo";
import { setDemoMode } from "../stores/bootstrap";
import { navigate } from "../router";

export function DemoBanner() {
  const demo = useDemo((s) => s.demo);
  if (!demo) return null;
  return (
    <div className="demobar" role="status">
      <span className="demobar__text">
        Demo mode: you're exploring sample data. Nothing here is saved.
      </span>
      <button
        className="demobar__btn"
        onClick={async () => {
          await setDemoMode(false);
          navigate("dashboard");
        }}
      >
        Use my own data
      </button>
    </div>
  );
}
