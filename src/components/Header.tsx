import { navigate } from "../router";
import { useSync } from "../stores/useSync";

const LABEL: Record<string, string> = {
  synced: "Synced",
  syncing: "Syncing…",
  offline: "Offline",
};

export function Header() {
  const { status, pending, connected } = useSync();
  const cls =
    status === "synced" ? "syncpill--ok" : status === "offline" ? "syncpill--off" : "syncpill--busy";
  const text =
    status === "offline" && pending > 0
      ? `Offline · ${pending}`
      : !connected && status === "synced"
        ? "Saved"
        : LABEL[status];

  return (
    <header className="appbar">
      <span className="appbar__brand">Life Planner</span>
      <span className="appbar__spacer" />
      <span
        className={`syncpill ${cls}`}
        title={connected ? "Synced to your Google Sheet" : "Stored on this device"}
      >
        <span className="syncpill__dot" />
        {text}
      </span>
      <button
        className="avatar"
        aria-label="LP: Settings"
        onClick={() => navigate("settings")}
      >
        LP
      </button>
    </header>
  );
}
