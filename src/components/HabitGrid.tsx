// GitHub-style week-aligned heat grid (brand signature — hand-rolled, no
// library). Each COLUMN is a real calendar week; each ROW is always the same
// weekday, so weekday labels down the left side apply to every column — this
// is what makes an unlabeled wall of squares readable at a glance instead of
// an unexplained blob (see showDayLabels).
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
  /** Render weekday initials down the left side. Off by default for the tiny
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
  const cells = weekAlignedGridISO(todayISO(), weeks, weekStart);
  const today = cells[cells.length - 1];
  const interactive = !!onTapDay;
  const doneCount = cells.filter((iso) => doneDates.has(iso)).length;
  const dayLabels = Array.from({ length: 7 }, (_, i) => weekdayShort(cells[i])[0]);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      {showDayLabels && (
        <div style={{ display: "grid", gridTemplateRows: `repeat(7, ${cell}px)`, gap: 3 }}>
          {dayLabels.map((d, i) => (
            <span
              key={i}
              aria-hidden
              className="muted"
              style={{ fontSize: 9, fontWeight: 700, lineHeight: `${cell}px`, textAlign: "right" }}
            >
              {d}
            </span>
          ))}
        </div>
      )}
      <div
        role={interactive ? undefined : "img"}
        aria-label={interactive ? undefined : `Last ${weeks} weeks: ${doneCount} of ${cells.length} days done`}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${weeks}, ${cell}px)`,
          gridAutoFlow: "column",
          gridTemplateRows: `repeat(7, ${cell}px)`,
          gap: 3,
        }}
      >
        {cells.map((iso) => {
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
    </div>
  );
}
