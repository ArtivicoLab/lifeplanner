// Calendar-style heat grid (brand signature — hand-rolled, no library). Each
// ROW is one full calendar week (oldest on top, this week at the bottom);
// each COLUMN is always the same weekday, labeled once across the top. This
// reads as "N weeks" the way a normal calendar does — row count = week count
// — rather than a GitHub-style sideways layout, which tested as confusing
// for a small, non-scrolling grid like this one (2026-07-13).
import { todayISO, weekAlignedGridISO, weekdayShort } from "../lib/dates";

interface Props {
  /** ISO dates that are "done". */
  doneDates: Set<string>;
  /** number of trailing weeks to show (default 5). */
  weeks?: number;
  weekStart: 0 | 1;
  color?: string;
  onTapDay?: (iso: string) => void;
  /** Fixed cell size in px. Keep this SMALL (~16–22) — a wall of large empty
      squares reads as overwhelming/unexplained; small + labeled reads as a
      compact history strip. Default 18. */
  cell?: number;
  /** Render weekday initials across the top. Off by default for the tiny
      Dashboard summary grid; turn on wherever the grid is a primary element
      (e.g. the Habits screen) so every square's meaning is legible. */
  showDayLabels?: boolean;
}

export function HabitGrid({
  doneDates,
  weeks = 5,
  weekStart,
  color = "var(--success)",
  onTapDay,
  cell = 18,
  showDayLabels = false,
}: Props) {
  const today = todayISO();
  const cells = weekAlignedGridISO(today, weeks, weekStart);
  const rows = Array.from({ length: weeks }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const interactive = !!onTapDay;
  const doneCount = cells.filter((iso) => doneDates.has(iso)).length;
  const dayLabels = Array.from({ length: 7 }, (_, i) => weekdayShort(cells[i])[0]);

  return (
    <div
      role={interactive ? undefined : "img"}
      aria-label={interactive ? undefined : `Last ${weeks} weeks: ${doneCount} of ${cells.length} days done`}
      style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}
    >
      {showDayLabels && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(7, ${cell}px)`, gap: 3 }}>
          {dayLabels.map((d, i) => (
            <span
              key={i}
              aria-hidden
              className="muted"
              style={{ fontSize: 9, fontWeight: 700, textAlign: "center" }}
            >
              {d}
            </span>
          ))}
        </div>
      )}
      {rows.map((week, w) => (
        <div key={w} style={{ display: "grid", gridTemplateColumns: `repeat(7, ${cell}px)`, gap: 3 }}>
          {week.map((iso) => {
            const done = doneDates.has(iso);
            const isToday = iso === today;
            const Tag = interactive ? "button" : "div";
            return (
              <Tag
                key={iso}
                aria-label={interactive ? iso + (done ? " done" : "") : undefined}
                aria-hidden={interactive ? undefined : true}
                onClick={onTapDay ? () => onTapDay(iso) : undefined}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: 4,
                  background: done ? color : "var(--surface-2)",
                  border: isToday ? "1.5px solid var(--accent)" : "1.5px solid transparent",
                  cursor: onTapDay ? "pointer" : "default",
                  padding: 0,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
