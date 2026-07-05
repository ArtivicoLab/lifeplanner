// GitHub-style month heat grid (brand signature — hand-rolled, no library).
import { fromISO, todayISO } from "../lib/dates";

interface Props {
  /** ISO dates that are "done". */
  doneDates: Set<string>;
  /** number of trailing days to show (default 35 = 5 weeks). */
  days?: number;
  color?: string;
  onTapDay?: (iso: string) => void;
  /** Fixed cell size in px. When set, cells stay small instead of stretching to
      fill the container width (keeps the grid compact on the dashboard). */
  cell?: number;
}

function offsetISO(iso: string, n: number): string {
  const d = fromISO(iso);
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export function HabitGrid({ doneDates, days = 35, color = "var(--success)", onTapDay, cell }: Props) {
  const today = todayISO();
  const cols = Math.ceil(days / 7);
  const cells = Array.from({ length: days }, (_, i) =>
    offsetISO(today, -(days - 1 - i))
  );
  const interactive = !!onTapDay;
  const doneCount = cells.filter((iso) => doneDates.has(iso)).length;

  return (
    <div
      role={interactive ? undefined : "img"}
      aria-label={interactive ? undefined : `Last ${days} days: ${doneCount} of ${days} done`}
      style={{
        display: "grid",
        gridTemplateColumns: cell ? `repeat(${cols}, ${cell}px)` : `repeat(${cols}, 1fr)`,
        gridAutoFlow: "column",
        gridTemplateRows: cell ? `repeat(7, ${cell}px)` : "repeat(7, 1fr)",
        gap: cell ? 3 : 4,
        justifyContent: cell ? "start" : undefined,
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
              ...(cell ? { width: cell, height: cell } : { aspectRatio: "1" }),
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
  );
}
