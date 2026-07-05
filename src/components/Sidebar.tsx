// Desktop sidebar (shown ≥900px). Groups every destination like the reference's
// Overview / Organization / Finances / Wellness nav.
import { navigate, type Route } from "../router";
import { NAV, SETTINGS_ITEM } from "../nav";
import { IconHeart } from "./icons";
import { useSync } from "../stores/useSync";
import { useSettings } from "../stores/useSettings";

const STATUS_LABEL: Record<string, string> = {
  synced: "Synced",
  syncing: "Syncing…",
  offline: "Offline",
};

export function Sidebar({ active }: { active: Route }) {
  const { status, connected } = useSync();
  const { hiddenRoutes } = useSettings();
  const dot =
    status === "synced" ? "var(--success)" : status === "offline" ? "var(--warn)" : "var(--accent)";

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((i) => !hiddenRoutes.includes(i.route)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <img src="/favicon.svg" alt="" aria-hidden width={26} height={26} />
        Life Planner
      </div>
      <div className="sidebar__scroll">
        {groups.map((group) => (
          <div key={group.title} className="sidebar__group">
            <div className="sidebar__grouptitle">{group.title}</div>
            {group.items.map(({ route, label, Icon, color }) => (
              <button
                key={route}
                className={`sidebar__item${active === route ? " sidebar__item--on" : ""}`}
                onClick={() => navigate(route)}
              >
                <span className="sidebar__ico" style={{ background: color }}>
                  <Icon size={16} />
                </span>
                {label}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar__group">
          <button
            className={`sidebar__item${active === "settings" ? " sidebar__item--on" : ""}`}
            onClick={() => navigate("settings")}
          >
            <span className="sidebar__ico" style={{ background: "var(--surface-2)" }}>
              <SETTINGS_ITEM.Icon size={16} />
            </span>
            Settings
          </button>
          <button
            className={`sidebar__item${active === "privacy" ? " sidebar__item--on" : ""}`}
            onClick={() => navigate("privacy")}
          >
            <span className="sidebar__ico" style={{ background: "var(--surface-2)" }}>
              <IconHeart size={16} />
            </span>
            Privacy &amp; source
          </button>
        </div>
      </div>
      <div className="sidebar__foot">
        <span className="syncpill">
          <span className="syncpill__dot" style={{ background: dot }} />
          {connected ? STATUS_LABEL[status] : "Saved on device"}
        </span>
      </div>
    </aside>
  );
}
