import { IconCompass } from "./icons";
import { navigate, useRoute } from "../router";
import { useSync } from "../stores/useSync";
import { HIDE_DEMO_CHROME, useDemo } from "../lib/demo";
import { ROUTE_LABELS } from "../nav";

const LABEL: Record<string, string> = {
  synced: "Synced",
  syncing: "Syncing…",
  offline: "Offline",
};

export function Header({ onCoachTour }: { onCoachTour: () => void }) {
  const { status, pending, connected, needsReauth, busy, connect } = useSync();
  const demo = useDemo((s) => s.demo);
  const route = useRoute();
  const cls = needsReauth
    ? "syncpill--off"
    : status === "synced" ? "syncpill--ok" : status === "offline" ? "syncpill--off" : "syncpill--busy";
  const text = needsReauth
    ? "Tap to reconnect"
    : status === "offline" && pending > 0
      ? `Offline · ${pending}`
      : !connected && status === "synced"
        ? "Saved"
        : LABEL[status];

  return (
    <header className="appbar">
      <span className="appbar__brand">
        <img src="/favicon-96x96.png" alt="" aria-hidden width={22} height={22} className="appbar__brandimg" />
        Life Planner
        {demo && !HIDE_DEMO_CHROME && <span className="brand-demo">Demo</span>}
      </span>
      <span className="appbar__spacer" />
      {needsReauth ? (
        <button
          className={`syncpill ${cls}`}
          disabled={busy}
          onClick={() => connect()}
          title="Your Google connection needs a quick refresh — tap to sign in again"
        >
          <span className="syncpill__dot" />
          {busy ? "Reconnecting…" : text}
        </button>
      ) : (
        <span
          className={`syncpill ${cls}`}
          title={connected ? "Synced to your Google Sheet" : "Stored on this device"}
        >
          <span className="syncpill__dot" />
          {text}
        </span>
      )}
      <button
        className="btn btn--ghost appbar__tour"
        onClick={onCoachTour}
        title={`Replay the coach tour for ${ROUTE_LABELS[route]}`}
      >
        <IconCompass size={16} />
        <span>Coach Tour: {ROUTE_LABELS[route]}</span>
      </button>
      <button
        className="avatar"
        aria-label="LP: Settings"
        data-tour="settings"
        onClick={() => navigate("settings")}
      >
        LP
      </button>
    </header>
  );
}
