// The "Monthly Habit Tracker" analytics view: overall completion, per-week
// rings, a daily trend, a combined all-habits month grid, and a stats table.
import { useMemo, useState } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { Columns } from "../../components/Charts";
import { HelpTip } from "../../components/HelpTip";
import { Icon, IconChevron, IconFlame } from "../../components/icons";
import { useHabits } from "../../stores/useHabits";
import { computeMonthStats } from "../../lib/habitStats";
import { addMonthsISO, dayNum, monthTitle, todayISO } from "../../lib/dates";

export function HabitMonthView() {
  const { habits, log, toggle, isDone, longestStreakEver } = useHabits();
  const [cursor, setCursor] = useState(todayISO());

  const active = useMemo(() => habits.filter((h) => h.active), [habits]);

  const stats = useMemo(
    () => computeMonthStats(active, log, cursor, longestStreakEver),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, log, cursor]
  );

  if (active.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ padding: "8px 0" }}>Add a habit first to see monthly analytics.</p>
      </div>
    );
  }

  return (
    <>
      <div className="card spread">
        <button className="chip" aria-label="Previous month" style={{ transform: "scaleX(-1)", padding: 8 }}
          onClick={() => setCursor(addMonthsISO(cursor, -1))}><IconChevron size={16} /></button>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{monthTitle(cursor)}</div>
        <button className="chip" aria-label="Next month" style={{ padding: 8 }}
          onClick={() => setCursor(addMonthsISO(cursor, 1))}><IconChevron size={16} /></button>
      </div>

      {/* Overall + weekly rings */}
      <div className="card">
        <div className="spread" style={{ marginBottom: 14 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
              DAILY PROGRESS
              <HelpTip text="What share of all your active habits got checked off, averaged across every day this month." />
            </div>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              {stats.overallDone}/{stats.overallTotal} completed
            </div>
          </div>
          <ProgressRing value={stats.overallPct / 100} size={72} stroke={8} showPct label="habits"
            ariaLabel={`${stats.overallDone} of ${stats.overallTotal} habits completed`} />
        </div>
        <div className="hmv-weeks">
          {stats.perWeek.map((w) => (
            <div key={w.label} className="hmv-week">
              <ProgressRing value={w.pct / 100} size={54} stroke={6}
                ariaLabel={`${w.label}: ${w.pct}%`}
                center={<span style={{ fontSize: 12, fontWeight: 800 }}>{w.pct}%</span>} />
              <span className="muted" style={{ fontSize: 10, fontWeight: 700, marginTop: 4 }}>{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Daily completion trend */}
      <div className="card">
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>
          Daily completion
          <HelpTip text="The percentage of active habits done on each day of the month." />
        </div>
        <Columns points={stats.perDay.map((d) => ({ label: d.label, value: d.pct }))} min={0} max={100} height={90} />
      </div>

      {/* Combined month grid — every habit × every day */}
      <div className="card" style={{ padding: 12 }}>
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>
          Month grid
          <HelpTip text="Every habit against every day. Tap any cell to toggle it done, just like the checkboxes on the Habits tab." />
        </div>
        <div className="hmv-scroll">
          <table className="hmv-grid">
            <thead>
              <tr>
                <th className="hmv-grid__habit" />
                {stats.days.map((d) => (
                  <th key={d} className={d === todayISO() ? "hmv-grid__today" : ""}>{dayNum(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((h) => (
                <tr key={h.id}>
                  <td className="hmv-grid__habit">
                    <span className="hmv-habit">
                      <Icon name={h.icon} size={13} />
                      {h.name}
                    </span>
                  </td>
                  {stats.days.map((d) => {
                    const done = isDone(h.id, d);
                    return (
                      <td key={d} className={d === todayISO() ? "hmv-grid__today" : ""}>
                        <button
                          className={`hmv-cell${done ? " hmv-cell--on" : ""}`}
                          aria-label={`${h.name} ${d}`}
                          onClick={() => toggle(h.id, d)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-habit stats table */}
      <div className="section-title">
        Habit stats
        <HelpTip text="Each habit's completion rate this month and its longest streak ever, not just this month." />
      </div>
      <div className="card" style={{ padding: "4px 16px" }}>
        {stats.perHabit.map((h) => (
          <div key={h.habitId} className="row">
            <span className="hmv-habit-ico"><Icon name={h.icon} size={15} /></span>
            <div className="row__body">
              <div className="row__title">{h.name}</div>
              <div className="pbar" style={{ marginTop: 5 }}>
                <div className="pbar__fill" style={{ width: `${h.pct}%` }} />
              </div>
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{h.pct}%</div>
              <div className="muted" style={{ fontSize: 11 }}>{h.count}/{h.total}</div>
            </div>
            <div style={{ textAlign: "right", flex: "none", width: 44 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 700, color: "#EE8A5B" }}>
                <IconFlame size={13} />
                {h.longestStreak}
              </div>
              <div className="muted" style={{ fontSize: 10 }}>best</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
