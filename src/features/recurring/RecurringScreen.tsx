import { useMemo, useState } from "react";
import { Checkbox } from "../../components/Checkbox";
import { EmptyState } from "../../components/EmptyState";
import { BottomSheet } from "../../components/BottomSheet";
import { HelpTip } from "../../components/HelpTip";
import { IconRepeat } from "../../components/icons";
import { TaskSheet } from "../tasks/TaskSheet";
import { useTasks } from "../../stores/useTasks";
import { expandOccurrences } from "../../lib/recurrence";
import { addDaysISO, dueLabel, todayISO } from "../../lib/dates";
import { categoryColor, frequencyLabel } from "../../lib/ui";
import type { Recurrence, Task } from "../../lib/types";

export function RecurringScreen() {
  const {
    recurrences,
    tasks,
    toggleOccurrence,
    toggleComplete,
    materialize,
    updateRecurrence,
    deleteRecurrence,
  } = useTasks();

  const [editTask, setEditTask] = useState<Task | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<Recurrence | null>(null);

  const today = todayISO();
  const horizon = addDaysISO(today, 120);

  // materialized override lookup by recurrenceId:date
  const overrides = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) {
      if (t.recurrenceId && t.occurrenceDate) map.set(`${t.recurrenceId}:${t.occurrenceDate}`, t);
    }
    return map;
  }, [tasks]);

  const series = [...recurrences].sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));

  function openOccurrence(rec: Recurrence, date: string) {
    const task = materialize(rec.id, date);
    setEditTask(task);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Set once · repeats on its own</div>
        <h1 className="screen-head__title">
          Recurring
          <HelpTip text="Templates for tasks that repeat: daily, weekly, monthly, or a custom interval. Editing one occurrence never changes past ones; editing the series changes future ones." />
        </h1>
      </div>

      {series.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconRepeat size={28} />}
            title="No routines yet"
            sub="Create a task with a Repeat option and it shows up here, with every upcoming occurrence."
          />
        </div>
      ) : (
        series.map((rec) => {
          const dates = expandOccurrences(rec, today, horizon).slice(0, 6);
          const next = dates[0];
          return (
            <div className="card" key={rec.id} style={{ opacity: rec.active ? 1 : 0.6 }}>
              <div className="spread" style={{ marginBottom: dates.length ? 10 : 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: categoryColor(rec.category), flex: "none" }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{rec.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {frequencyLabel(rec.frequency)}
                      {rec.active ? (next ? ` · next ${dueLabel(next)}` : " · no upcoming") : " · paused"}
                      {rec.assignee ? ` · ${rec.assignee}` : ""}
                    </div>
                  </div>
                </div>
                <button className="chip" onClick={() => setMenuFor(rec)}>Manage</button>
              </div>

              {rec.active &&
                dates.map((date) => {
                  const real = overrides.get(`${rec.id}:${date}`);
                  const done = real?.status === "Completed";
                  const modified = !!real;
                  return (
                    <div key={date} className={`row${done ? " row--done" : ""}`}>
                      <Checkbox
                        checked={done}
                        label={`${rec.title} ${date}`}
                        onChange={() => {
                          if (real) toggleComplete(real.id);
                          else
                            toggleOccurrence({
                              key: `${rec.id}:${date}`, date, title: rec.title,
                              category: rec.category, priority: rec.priority, assignee: rec.assignee,
                              recurrenceId: rec.id, status: "NotStarted", remind: rec.remind, virtual: true,
                            });
                        }}
                      />
                      <button className="row__body" style={{ background: "none", textAlign: "left" }}
                        onClick={() => openOccurrence(rec, date)}>
                        <div className="row__title" style={{ fontSize: 14 }}>{dueLabel(date)}</div>
                        <div className="row__sub">{date}</div>
                      </button>
                      {modified && !done && (
                        <span className="chip" style={{ padding: "3px 8px", fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)" }}>
                          edited
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })
      )}

      {/* Series actions */}
      <BottomSheet open={!!menuFor} title={menuFor?.title} onClose={() => setMenuFor(null)}>
        {menuFor && (
          <>
            <button className="btn" style={{ marginBottom: 10 }}
              onClick={() => { updateRecurrence(menuFor.id, { active: !menuFor.active }); setMenuFor(null); }}>
              {menuFor.active ? "Pause series" : "Resume series"}
            </button>
            <button className="btn" style={{ marginBottom: 10 }}
              onClick={() => { deleteRecurrence(menuFor.id, "future"); setMenuFor(null); }}>
              End future occurrences (keep past)
            </button>
            <button className="btn btn--danger"
              onClick={() => { deleteRecurrence(menuFor.id, "all"); setMenuFor(null); }}>
              Delete series entirely
            </button>
          </>
        )}
      </BottomSheet>

      <TaskSheet open={sheetOpen} editTask={editTask} onClose={() => { setSheetOpen(false); setEditTask(null); }} />
    </>
  );
}
