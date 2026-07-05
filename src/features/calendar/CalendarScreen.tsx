import { useMemo, useState } from "react";
import { Segmented } from "../../components/Segmented";
import { BottomSheet } from "../../components/BottomSheet";
import { Checkbox } from "../../components/Checkbox";
import { ProgressRing } from "../../components/ProgressRing";
import { HelpTip } from "../../components/HelpTip";
import { IconCard, IconChevron, IconRepeat, IconTarget } from "../../components/icons";
import { TaskSheet } from "../tasks/TaskSheet";
import { QuickCapture } from "./QuickCapture";
import { buildAgenda, sortAgenda } from "../tasks/agenda";
import { useTasks } from "../../stores/useTasks";
import { useBudget } from "../../stores/useBudget";
import { useSettings } from "../../stores/useSettings";
import { useGoals, useWorkouts } from "../../stores/v2";
import {
  addDaysISO,
  addMonthsISO,
  fromISO,
  format,
  inSameMonth,
  monthGridISO,
  monthTitle,
  todayISO,
  weekDaysISO,
  weekdayShort,
} from "../../lib/dates";
import { categoryColor, money as fmtMoney, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL } from "../../lib/ui";
import { navigate } from "../../router";
import { PRIORITIES, STATUSES, type Occurrence, type Priority, type Status } from "../../lib/types";

type View = "month" | "week" | "day";
const VIEWS = [
  { value: "month" as View, label: "Month" },
  { value: "week" as View, label: "Week" },
  { value: "day" as View, label: "Day" },
];

type Source = "task" | "bill" | "goal" | "fitness";
const SOURCES: { key: Source; label: string; color: string }[] = [
  { key: "task", label: "Tasks", color: "var(--cat-sky)" },
  { key: "bill", label: "Bills", color: "var(--cat-butter)" },
  { key: "goal", label: "Goals", color: "var(--cat-pink)" },
  { key: "fitness", label: "Fitness", color: "var(--cat-lavender)" },
];

// Soft per-day header tints (our palette — mockups give structure, not colors).
const DAY_TINTS = [
  "var(--cat-pink)", "var(--cat-teal)", "var(--cat-butter)", "var(--cat-sky)",
  "var(--cat-lavender)", "var(--cat-teal)", "var(--cat-pink)",
];

interface CalItem {
  key: string;
  kind: Source;
  title: string;
  color: string;
  done: boolean;
  category?: string;
  assignee?: string;
  priority?: Priority;
  status?: Status;
  taskId?: string;
  occurrence?: Occurrence;
  billId?: string;
  fitnessId?: string;
}

const checkable = (k: Source) => k === "task" || k === "bill" || k === "fitness";

export function CalendarScreen() {
  const { tasks, recurrences, toggleComplete, toggleOccurrence } = useTasks();
  const { money, updateMoney } = useBudget();
  const { items: goals } = useGoals();
  const { items: workouts, update: updateWorkout } = useWorkouts();
  const { weekStart, currency } = useSettings();

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(todayISO());
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // filters: which sources / categories are HIDDEN (matches "do not show")
  const [hiddenSrc, setHiddenSrc] = useState<Set<Source>>(new Set());
  const [hiddenCat, setHiddenCat] = useState<Set<string>>(new Set());
  const [hiddenStatus, setHiddenStatus] = useState<Set<Status>>(new Set());
  // assignee/priority: "show only" filters (task items only; other sources pass through)
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [priFilter, setPriFilter] = useState<Priority | "">("");

  // inline "write straight in the cell/day"
  const [addingDate, setAddingDate] = useState<string | null>(null);

  const today = todayISO();
  const days =
    view === "month" ? monthGridISO(cursor, weekStart)
    : view === "week" ? weekDaysISO(cursor, weekStart)
    : [cursor];
  const winStart = days[0];
  const winEnd = days[days.length - 1];
  const weekHeader = weekDaysISO(cursor, weekStart).map((d) => weekdayShort(d));

  const byDate = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    const push = (date: string, item: CalItem) => {
      if (!date) return;
      const arr = map.get(date) ?? [];
      arr.push(item);
      map.set(date, arr);
    };
    for (const it of sortAgenda(buildAgenda(tasks, recurrences, winStart, winEnd))) {
      if (!it.date) continue;
      push(it.date, {
        key: it.key, kind: "task", title: it.title, color: categoryColor(it.category),
        done: it.done, category: it.category, taskId: it.taskId, occurrence: it.occurrence,
        assignee: it.assignee, priority: it.priority, status: it.status,
      });
    }
    for (const m of money) {
      if (m.kind !== "bill" || !m.dueDate) continue;
      push(m.dueDate, {
        key: m.id, kind: "bill", billId: m.id, done: m.paid, color: "var(--cat-butter)",
        title: `${m.name}: ${fmtMoney(m.budgeted, currency)}`,
      });
    }
    for (const g of goals) {
      if (!g.deadline) continue;
      push(g.deadline, {
        key: g.id, kind: "goal", title: g.title, color: "var(--cat-pink)",
        done: g.status === "Completed",
      });
    }
    for (const w of workouts) {
      if (!w.date || w.restDay) continue;
      push(w.date, {
        key: w.id, kind: "fitness", fitnessId: w.id, title: w.exercise,
        color: "var(--cat-lavender)", done: w.done,
      });
    }
    return map;
  }, [tasks, recurrences, money, goals, workouts, winStart, winEnd, currency]);

  const catsPresent = useMemo(() => {
    const s = new Set<string>();
    for (const arr of byDate.values()) for (const it of arr) if (it.category) s.add(it.category);
    return [...s];
  }, [byDate]);

  const assigneesPresent = useMemo(() => {
    const s = new Set<string>();
    for (const arr of byDate.values()) for (const it of arr) if (it.assignee) s.add(it.assignee);
    return [...s].sort();
  }, [byDate]);

  function visible(items: CalItem[] | undefined): CalItem[] {
    if (!items) return [];
    return items.filter((it) => {
      if (hiddenSrc.has(it.kind)) return false;
      if (it.category && hiddenCat.has(it.category)) return false;
      if (it.kind === "task") {
        if (it.status && hiddenStatus.has(it.status)) return false;
        if (assigneeFilter && it.assignee !== assigneeFilter) return false;
        if (priFilter && it.priority !== priFilter) return false;
      }
      return true;
    });
  }

  function toggleItem(it: CalItem) {
    if (it.kind === "task") {
      if (it.occurrence) toggleOccurrence(it.occurrence);
      else if (it.taskId) toggleComplete(it.taskId);
    } else if (it.kind === "bill" && it.billId) {
      updateMoney(it.billId, { paid: !it.done });
    } else if (it.kind === "fitness" && it.fitnessId) {
      updateWorkout(it.fitnessId, { done: !it.done });
    } else if (it.kind === "goal") {
      navigate("goals");
    }
  }

  const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    return n;
  };

  const navBy = (dir: number) =>
    setCursor(
      view === "month" ? addMonthsISO(cursor, dir)
      : view === "week" ? addDaysISO(cursor, dir * 7)
      : addDaysISO(cursor, dir)
    );
  const weekDays = weekDaysISO(cursor, weekStart);
  const title =
    view === "month"
      ? monthTitle(cursor)
      : view === "week"
      ? `${format(fromISO(weekDays[0]), "MMM d")} – ${format(fromISO(weekDays[6]), "MMM d")}`
      : format(fromISO(cursor), "EEEE, MMM d");

  return (
    <>
      <div className="screen-head" data-tour="calendar-head">
        <div className="screen-head__eyebrow">Filter &amp; write your view</div>
        <h1 className="screen-head__title">
          Calendar
          <HelpTip text="A month at a glance, spreadsheet-style: tap any day's cell and type anything, like a task, a goal, a habit, a bill, a workout, a meal, groceries, your weight, or water. We'll guess what it is and show a pill; tap the pill to change it before saving. No need to visit each tab yourself." />
        </h1>
      </div>

      <Segmented options={VIEWS} value={view} onChange={setView} />

      <div className="chip-row mt-3">
        {SOURCES.map((s) => {
          const on = !hiddenSrc.has(s.key);
          return (
            <button key={s.key} className="chip" onClick={() => setHiddenSrc(toggle(hiddenSrc, s.key))}
              style={{ opacity: on ? 1 : 0.45 }}>
              <span className="dot-9" style={{ background: s.color }} />
              {s.label}
            </button>
          );
        })}
      </div>
      {catsPresent.length > 0 && !hiddenSrc.has("task") && (
        <div className="chip-row">
          {catsPresent.map((c) => {
            const on = !hiddenCat.has(c);
            return (
              <button key={c} className="chip" onClick={() => setHiddenCat(toggle(hiddenCat, c))}
                style={{ opacity: on ? 1 : 0.4 }}>
                <span className="dot-9 dot-9--round" style={{ background: categoryColor(c) }} />
                {c}
              </button>
            );
          })}
        </div>
      )}
      {!hiddenSrc.has("task") && (
        <>
          {assigneesPresent.length > 0 && (
            <div className="chip-row">
              <button className={`chip${!assigneeFilter ? " chip--on" : ""}`} onClick={() => setAssigneeFilter("")}>
                Anyone
              </button>
              {assigneesPresent.map((a) => (
                <button key={a} className={`chip${assigneeFilter === a ? " chip--on" : ""}`}
                  onClick={() => setAssigneeFilter(assigneeFilter === a ? "" : a)}>
                  {a}
                </button>
              ))}
            </div>
          )}
          <div className="chip-row">
            <button className={`chip${!priFilter ? " chip--on" : ""}`} onClick={() => setPriFilter("")}>
              All priorities
            </button>
            {PRIORITIES.map((p) => (
              <button key={p} className={`chip${priFilter === p ? " chip--on" : ""}`}
                onClick={() => setPriFilter(priFilter === p ? "" : p)}>
                <span className="dot-9 dot-9--round" style={{ background: PRIORITY_COLOR[p] }} />
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
          <div className="chip-row">
            {STATUSES.map((st) => {
              const on = !hiddenStatus.has(st);
              return (
                <button key={st} className="chip" onClick={() => setHiddenStatus(toggle(hiddenStatus, st))}
                  style={{ opacity: on ? 1 : 0.4 }} aria-label={`${on ? "Hide" : "Show"} ${STATUS_LABEL[st]}`}>
                  <span className="dot-9 dot-9--round" style={{ background: STATUS_COLOR[st] }} />
                  {STATUS_LABEL[st]}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Shared period nav */}
      <div className="card spread mt-3">
        <button className="chip cal-navchip cal-navchip--prev" aria-label="Previous"
          onClick={() => navBy(-1)}>
          <IconChevron width={16} height={16} />
        </button>
        <div className="cal-nav-title">{title}</div>
        <button className="chip cal-navchip" aria-label="Next" onClick={() => navBy(1)}>
          <IconChevron width={16} height={16} />
        </button>
      </div>

      {view === "month" ? (
        <div className="card cal-monthcard">
          <div className="cal-scroll">
            <div className="cal-grid">
              {weekHeader.map((w, i) => (
                <div key={i} className="cal-head">{w}</div>
              ))}
              {days.map((d) => {
                const items = visible(byDate.get(d));
                const isToday = d === today;
                const dim = !inSameMonth(d, cursor);
                const adding = addingDate === d;
                const shown = items.slice(0, 5);
                return (
                  <div key={d} className={`cal-cell${isToday ? " cal-cell--today" : ""}${dim ? " cal-cell--dim" : ""}`}>
                    <div className="cal-cell__head">
                      <button className="cal-daynum" onClick={() => setSelected(d)} aria-label={format(fromISO(d), "MMMM d")}>
                        {fromISO(d).getDate()}
                      </button>
                      {items.length > 7 && <span className="cal-over7">7+</span>}
                      <button className="cal-add" aria-label="Add on this day"
                        onClick={() => setAddingDate(d)}>+</button>
                    </div>
                    {shown.map((it) => (
                      <button key={it.key} className={`cal-item${it.done ? " cal-item--done" : ""}`}
                        style={{ borderLeftColor: it.color, background: `color-mix(in srgb, ${it.color} 26%, transparent)` }}
                        onClick={() => toggleItem(it)} title={it.title}>
                        {it.kind === "task" && it.occurrence && <IconRepeat size={9} className="cal-item-repeat-ic" />}
                        <span className="cal-item__txt">{it.title}</span>
                      </button>
                    ))}
                    {items.length > shown.length && (
                      <button className="cal-more" onClick={() => setSelected(d)}>+{items.length - shown.length} more</button>
                    )}
                    {adding && (
                      <QuickCapture date={d} className="cal-input" compact
                        placeholder="Type anything…" onClose={() => setAddingDate(null)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : view === "week" ? (
        <div className="week-grid">
          {days.map((d, i) => {
            const items = visible(byDate.get(d));
            const checks = items.filter((it) => checkable(it.kind));
            const done = checks.filter((it) => it.done).length;
            const total = checks.length;
            const isToday = d === today;
            const adding = addingDate === d;
            const tint = DAY_TINTS[i % 7];
            return (
              <div key={d} className={`weekcard${isToday ? " weekcard--today" : ""}`}>
                <div className="weekcard__head" style={{ background: `color-mix(in srgb, ${tint} 45%, transparent)` }}>
                  <span className="weekcard__num">{fromISO(d).getDate()}</span>
                  <div>
                    <div className="weekcard__wd">{format(fromISO(d), "EEEE")}{isToday ? " · Today" : ""}</div>
                    <div className="weekcard__date">{format(fromISO(d), "MMMM d")}</div>
                  </div>
                </div>

                <div className="weekcard__ring">
                  <ProgressRing
                    value={total ? done / total : 0}
                    size={78}
                    stroke={9}
                    dotted={total === 0}
                    ariaLabel={`${done} of ${total} tasks done`}
                    center={
                      <div className="text-center">
                        <div className="weekcard__pct">{total ? Math.round((done / total) * 100) : 0}%</div>
                        <div className="muted weekcard__pct-sub">{done}/{total}</div>
                      </div>
                    }
                  />
                </div>

                <div className="weekcard__list">
                  {items.length === 0 ? (
                    <div className="muted weekcard__empty">Nothing planned. A clear day.</div>
                  ) : (
                    items.map((it) => (
                      <div key={it.key} className={`weekrow${it.done ? " weekrow--done" : ""}`}>
                        {it.kind === "goal" ? (
                          <span className="weekrow__ic weekrow__ic--goal"><IconTarget size={16} /></span>
                        ) : (
                          <Checkbox checked={it.done} onChange={() => toggleItem(it)} label={it.title} />
                        )}
                        <span className="weekrow__txt" onClick={() => toggleItem(it)}>
                          {it.kind === "task" && it.occurrence && <IconRepeat size={11} className="ic-muted" />}
                          {it.title}
                        </span>
                      </div>
                    ))
                  )}

                  {adding ? (
                    <div className="cal-quickadd-gap">
                      <QuickCapture date={d} className="input" placeholder="Type anything…"
                        inputStyle={{ fontSize: 14, padding: "8px 10px" }}
                        onClose={() => setAddingDate(null)} />
                    </div>
                  ) : (
                    <button className="weekcard__add" onClick={() => setAddingDate(d)}>+ Add anything</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DayDetailView
          date={cursor}
          items={visible(byDate.get(cursor))}
          adding={addingDate === cursor}
          onAdd={() => setAddingDate(cursor)}
          onCloseAdd={() => setAddingDate(null)}
          onToggle={toggleItem}
        />
      )}

      <p className="muted cal-hint">
        {view === "month"
          ? "Swipe the grid sideways on a phone. Tap + in any day to write a task straight in; tap an item to complete it."
          : view === "week"
          ? "Each day shows its completion ring. Tick items to complete them; type a new task straight into any day."
          : "Filters above apply here too. Tick items to complete them; type anything to add it to today."}
      </p>

      <DaySheet
        date={selected}
        items={visible(selected ? byDate.get(selected) : [])}
        onClose={() => setSelected(null)}
        onAdd={() => setAddOpen(true)}
        onToggle={toggleItem}
      />

      <TaskSheet open={addOpen} defaultDate={selected ?? today} onClose={() => setAddOpen(false)} />
    </>
  );
}

function DaySheet({
  date, items, onClose, onAdd, onToggle,
}: {
  date: string | null;
  items: CalItem[];
  onClose: () => void;
  onAdd: () => void;
  onToggle: (it: CalItem) => void;
}) {
  if (!date) return null;
  return (
    <BottomSheet open title={format(fromISO(date), "EEEE, MMM d")} onClose={onClose}>
      {items.length === 0 ? (
        <p className="muted cal-daysheet__empty">Nothing scheduled.</p>
      ) : (
        <div className="card card--tight mb-4">
          {items.map((it) => (
            <div key={it.key} className={`row${it.done ? " row--done" : ""}`}>
              {it.kind === "goal" ? (
                <span className="icon-spacer-26 icon-spacer-26--pink">
                  <IconTarget size={18} />
                </span>
              ) : it.kind === "bill" ? (
                <span className="icon-spacer-26 icon-spacer-26--accent">
                  <IconCard size={18} />
                </span>
              ) : (
                <Checkbox checked={it.done} onChange={() => onToggle(it)} label={it.title} />
              )}
              <div className="row__body">
                <div className="row__title row__title--inline">
                  {it.kind === "task" && it.occurrence && <IconRepeat size={13} className="ic-muted" />}
                  {it.title}
                </div>
                <div className="row__sub">{it.kind === "task" ? it.category : it.kind}</div>
              </div>
              {(it.kind === "bill" || it.kind === "fitness") && (
                <Checkbox checked={it.done} onChange={() => onToggle(it)} label={it.title} />
              )}
            </div>
          ))}
        </div>
      )}
      <button className="btn btn--primary" onClick={onAdd}>+ Add task on this day</button>
    </BottomSheet>
  );
}

function DayDetailView({
  date,
  items,
  adding,
  onAdd,
  onCloseAdd,
  onToggle,
}: {
  date: string;
  items: CalItem[];
  adding: boolean;
  onAdd: () => void;
  onCloseAdd: () => void;
  onToggle: (it: CalItem) => void;
}) {
  const checks = items.filter((it) => checkable(it.kind));
  const done = checks.filter((it) => it.done).length;
  const total = checks.length;

  return (
    <div className="card mt-3">
      <div className="spread mb-4">
        <div>
          <div className="muted eyebrow-12">COMPLETED</div>
          <div className="big-number daydetail__count">{done}/{total}</div>
        </div>
        <ProgressRing
          value={total ? done / total : 0}
          size={64}
          stroke={7}
          dotted={total === 0}
          ariaLabel={`${done} of ${total} tasks done`}
          center={<span className="daydetail__pct">{total ? Math.round((done / total) * 100) : 0}%</span>}
        />
      </div>

      {items.length === 0 ? (
        <div className="muted daydetail__empty">Nothing planned. A clear day.</div>
      ) : (
        <div className="col-stack">
          {items.map((it) => (
            <div key={it.key} className={`row${it.done ? " row--done" : ""}`}>
              {it.kind === "goal" ? (
                <span className="icon-spacer-26 icon-spacer-26--pink">
                  <IconTarget size={18} />
                </span>
              ) : it.kind === "bill" ? (
                <span className="icon-spacer-26 icon-spacer-26--accent">
                  <IconCard size={18} />
                </span>
              ) : (
                <Checkbox checked={it.done} onChange={() => onToggle(it)} label={it.title} />
              )}
              <button className="row__body daydetail__row-btn" onClick={() => onToggle(it)}>
                <div className="row__title row__title--inline">
                  {it.kind === "task" && it.occurrence && <IconRepeat size={13} className="ic-muted" />}
                  {it.title}
                </div>
                <div className="row__sub">
                  {it.kind === "task" ? it.category : it.kind}
                  {it.assignee ? ` · ${it.assignee}` : ""}
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        {adding ? (
          <QuickCapture date={date} className="input" placeholder="Type anything…" onClose={onCloseAdd} />
        ) : (
          <button className="btn btn--ghost" onClick={onAdd}>+ Add anything</button>
        )}
      </div>
    </div>
  );
}
