import { useMemo, useRef, useState } from "react";
import { Segmented } from "../../components/Segmented";
import { Chip, ChipRow } from "../../components/Chip";
import { Checkbox } from "../../components/Checkbox";
import { EmptyState } from "../../components/EmptyState";
import { HelpTip } from "../../components/HelpTip";
import { IconEdit, IconHeart, IconPlus, IconRepeat, IconTasks, IconTrash } from "../../components/icons";
import { TaskSheet } from "./TaskSheet";
import { TaskInsights } from "./TaskInsights";
import { buildAgenda, sortAgenda, type AgendaItem } from "./agenda";
import { useTasks } from "../../stores/useTasks";
import { useSettings } from "../../stores/useSettings";
import { addDaysISO, daysBetween, dueLabel, todayISO } from "../../lib/dates";
import { categoryColor, PRIORITY_COLOR, STATUS_COLOR, STATUS_LABEL } from "../../lib/ui";
import {
  PRIORITIES,
  STATUSES,
  type Priority,
  type Status,
  type Task,
} from "../../lib/types";
import { routeQuery } from "../../router";

type Seg = "today" | "upcoming" | "overdue" | "all";
const SEGS = [
  { value: "today" as Seg, label: "Today" },
  { value: "upcoming" as Seg, label: "Upcoming" },
  { value: "overdue" as Seg, label: "Overdue" },
  { value: "all" as Seg, label: "All" },
];

type Sort = "due" | "priority" | "status" | "name" | "assignee" | "daysleft";
const SORTS: { value: Sort; label: string }[] = [
  { value: "due", label: "Due date" },
  { value: "daysleft", label: "Days left" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assigned to" },
  { value: "name", label: "Name" },
];

const PRI_RANK: Record<Priority, number> = {
  VeryHigh: 0, High: 1, Medium: 2, Low: 3, VeryLow: 4,
};

// Swipe-to-act on task rows (touch only — see TaskRow). Right = complete,
// left = reveal an Edit/Delete tray. Distance in px before a swipe "counts".
const SWIPE_THRESHOLD = 70;
const SWIPE_TRAY_EDIT_ONLY = 66;
const SWIPE_TRAY_FULL = 132;

export function TasksScreen() {
  const { tasks, recurrences, toggleComplete, toggleOccurrence, deleteTask, materialize, setStatus } =
    useTasks();
  const { categories } = useSettings();
  const initialSeg = (routeQuery().get("seg") as Seg) || "today";
  const [seg, setSeg] = useState<Seg>(SEGS.some((s) => s.value === initialSeg) ? initialSeg : "today");
  const [catFilter, setCatFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [priFilter, setPriFilter] = useState<Priority | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [sort, setSort] = useState<Sort>("due");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<Task | null>(null);

  const today = todayISO();

  const agenda = useMemo(() => {
    const items = buildAgenda(tasks, recurrences, addDaysISO(today, -90), addDaysISO(today, 180));
    return sortAgenda(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, recurrences]);

  // assignee options come from the data
  const assignees = useMemo(
    () => Array.from(new Set(agenda.map((i) => i.assignee).filter(Boolean))).sort(),
    [agenda]
  );

  const daysLeft = (i: AgendaItem) => (i.date ? daysBetween(today, i.date) : Infinity);

  const filtered = useMemo(() => {
    const list = agenda.filter((it) => {
      if (!includeCompleted && it.done) return false;
      if (catFilter && it.category !== catFilter) return false;
      if (statusFilter && it.status !== statusFilter) return false;
      if (priFilter && it.priority !== priFilter) return false;
      if (assigneeFilter && it.assignee !== assigneeFilter) return false;
      if (seg === "today") return it.date === today;
      if (seg === "overdue") return it.date && it.date < today && !it.done;
      if (seg === "upcoming") return it.date && it.date > today;
      return true;
    });
    const dateCmp = (a: AgendaItem, b: AgendaItem) => {
      if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    };
    return list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      switch (sort) {
        case "priority": return PRI_RANK[a.priority] - PRI_RANK[b.priority] || dateCmp(a, b);
        case "status": return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || dateCmp(a, b);
        case "name": return a.title.localeCompare(b.title);
        case "assignee": return (a.assignee || "~").localeCompare(b.assignee || "~") || dateCmp(a, b);
        case "daysleft": return daysLeft(a) - daysLeft(b);
        default: return dateCmp(a, b);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, includeCompleted, catFilter, statusFilter, priFilter, assigneeFilter, seg, sort, today]);

  const counts = {
    overdue: agenda.filter((i) => i.date && i.date < today && !i.done).length,
  };

  // Categories with something due today or overdue — lit up in the filter
  // row below so it's obvious at a glance which areas need attention.
  const urgentCats = useMemo(
    () => new Set(agenda.filter((i) => !i.done && i.date && i.date <= today).map((i) => i.category)),
    [agenda, today]
  );

  function onToggle(it: AgendaItem) {
    if (it.recurring && it.occurrence) toggleOccurrence(it.occurrence);
    else if (it.taskId) toggleComplete(it.taskId);
  }

  function onSetStatus(it: AgendaItem, status: Status) {
    setStatus(
      it.taskId
        ? { taskId: it.taskId }
        : { recurrenceId: it.occurrence?.recurrenceId, date: it.occurrence?.date },
      status
    );
  }

  function onEdit(it: AgendaItem) {
    let task: Task | undefined;
    if (it.taskId) task = tasks.find((t) => t.id === it.taskId);
    else if (it.occurrence) task = materialize(it.occurrence.recurrenceId, it.occurrence.date);
    if (task) {
      setEditItem(task);
      setSheetOpen(true);
    }
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Smart Task Center</div>
        <h1 className="screen-head__title">
          Tasks
          <HelpTip text="Your to-dos in one place: one-off and recurring, prioritized, assignable to people, and filterable by status or category." />
        </h1>
      </div>

      <TaskInsights items={agenda} today={today} categories={categories} />

      <div style={{ marginTop: 14 }}>
        <Segmented options={SEGS} value={seg} onChange={setSeg} />
      </div>

      <div style={{ marginTop: 12 }}>
        <ChipRow>
          <Chip active={!catFilter} onClick={() => setCatFilter("")}>All</Chip>
          {categories.map((c) => (
            <Chip key={c} active={catFilter === c} dotColor={categoryColor(c)} urgent={urgentCats.has(c)}
              onClick={() => setCatFilter(catFilter === c ? "" : c)}>
              {c}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {/* Filter & sort controls */}
      <div className="filterbar">
        <select className="input input--sm" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Status | "")}>
          <option value="">All statuses</option>
          {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
        </select>
        <select className="input input--sm" aria-label="Filter by priority" value={priFilter} onChange={(e) => setPriFilter(e.target.value as Priority | "")}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p.replace(/([A-Z])/g, " $1").trim()}</option>)}
        </select>
        {assignees.length > 0 && (
          <select className="input input--sm" aria-label="Filter by assignee" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="">Anyone</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <select className="input input--sm" aria-label="Sort tasks by" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {SORTS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
        </select>
        <label className="filterbar__toggle">
          <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} />
          Include completed
        </label>
      </div>

      {seg === "overdue" && counts.overdue > 0 && (
        <p className="muted" style={{ margin: "10px 2px", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <IconHeart size={15} style={{ color: "var(--accent)" }} />
          {counts.overdue} task{counts.overdue > 1 ? "s" : ""} need your love
        </p>
      )}

      <div className="card" style={{ marginTop: 14, padding: "4px 16px" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 8 }}>
            <EmptyState
              icon={seg === "overdue" ? <IconHeart size={28} /> : <IconTasks size={28} />}
              title={seg === "overdue" ? "Nothing overdue" : "All clear here"}
              sub={seg === "today" ? "Nothing due today. Add something or enjoy the calm." : "Tap + to add a task or routine."}
            />
          </div>
        ) : (
          filtered.map((it) => (
            <TaskRow key={it.key} item={it} today={today}
              onToggle={() => onToggle(it)} onEdit={() => onEdit(it)}
              onSetStatus={(st) => onSetStatus(it, st)}
              onDelete={it.taskId ? () => deleteTask(it.taskId!) : undefined} />
          ))
        )}
      </div>

      <button className="fab" aria-label="Add task" data-tour="tasks-fab" onClick={() => { setEditItem(null); setSheetOpen(true); }}>
        <IconPlus />
      </button>

      <TaskSheet open={sheetOpen} editTask={editItem}
        onClose={() => { setSheetOpen(false); setEditItem(null); }} />
    </>
  );
}

function TaskRow({
  item, today, onToggle, onEdit, onSetStatus, onDelete,
}: {
  item: AgendaItem;
  today: string;
  onToggle: () => void;
  onEdit: () => void;
  onSetStatus: (s: Status) => void;
  onDelete?: () => void;
}) {
  const overdue = item.date && item.date < today && !item.done;
  const d = item.date ? daysBetween(today, item.date) : null;

  // Swipe gestures (touch only — mouse/desktop never fires touch events, so
  // click handlers below are completely unaffected on non-touch input).
  const trayWidth = onDelete ? SWIPE_TRAY_FULL : SWIPE_TRAY_EDIT_ONLY;
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const touchStart = useRef<{ x: number; y: number; base: number } | null>(null);
  const axisLock = useRef<"x" | "y" | null>(null);

  function closeTray() {
    setOffset(0);
    setRevealed(false);
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, base: revealed ? -trayWidth : 0 };
    axisLock.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = touchStart.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (axisLock.current === null) {
      // Not enough movement yet to tell a tap from a drag — wait.
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axisLock.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axisLock.current === "y") return; // vertical scroll — let the page handle it
    setDragging(true);
    setOffset(Math.max(-trayWidth - 12, Math.min(start.base + dx, 90)));
  }

  function onTouchEnd() {
    const start = touchStart.current;
    touchStart.current = null;
    setDragging(false);
    if (!start || axisLock.current !== "x") {
      axisLock.current = null;
      return; // was a tap or a vertical scroll — leave native click/scroll alone
    }
    axisLock.current = null;
    if (start.base === 0) {
      if (offset > SWIPE_THRESHOLD) {
        setOffset(0);
        onToggle();
      } else if (offset < -SWIPE_THRESHOLD) {
        setOffset(-trayWidth);
        setRevealed(true);
      } else {
        setOffset(0);
      }
    } else if (offset > -trayWidth + SWIPE_THRESHOLD) {
      setOffset(0);
      setRevealed(false);
    } else {
      setOffset(-trayWidth);
    }
  }

  function onTouchCancel() {
    const start = touchStart.current;
    touchStart.current = null;
    axisLock.current = null;
    setDragging(false);
    setOffset(start ? start.base : 0);
  }

  return (
    <div
      className="swipe-row"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <div className="swipe-row__actions" aria-hidden={!revealed}>
        <button
          type="button"
          tabIndex={revealed ? undefined : -1}
          className="swipe-row__action swipe-row__action--edit"
          onClick={() => { closeTray(); onEdit(); }}
          aria-label={`Edit ${item.title}`}
        >
          <IconEdit size={16} />
          Edit
        </button>
        {onDelete && (
          <button
            type="button"
            tabIndex={revealed ? undefined : -1}
            className="swipe-row__action swipe-row__action--delete"
            onClick={() => { closeTray(); onDelete(); }}
            aria-label={`Delete ${item.title}`}
          >
            <IconTrash size={16} />
            Delete
          </button>
        )}
      </div>
      <div
        className={`row swipe-row__content${item.done ? " row--done" : ""}`}
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : undefined }}
        onClickCapture={(e) => {
          // While the tray is revealed, the first tap anywhere on the row
          // just closes it again (iOS-style), instead of toggling/editing.
          if (revealed) {
            e.preventDefault();
            e.stopPropagation();
            closeTray();
          }
        }}
      >
        <Checkbox checked={item.done} onChange={onToggle} label={item.title} />
        <button className="row__body" style={{ textAlign: "left", background: "none" }} onClick={onEdit}>
          <div className="row__title" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            {item.recurring && <IconRepeat size={13} style={{ color: "var(--muted)", flex: "none" }} />}
            {item.title}
          </div>
          <div className="row__sub" style={{ color: overdue ? "var(--alert)" : undefined }}>
            {item.date ? dueLabel(item.date, today) : "No date"} · {item.category}
            {item.assignee ? ` · ${item.assignee}` : ""}
          </div>
          {item.notes && (
            <div className="row__sub" style={{ marginTop: 2, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.notes}
            </div>
          )}
        </button>
        <div className="row__meta">
          {d !== null && (
            <span className="days-badge" title="Days left" style={{ color: d < 0 ? "var(--alert)" : d === 0 ? "var(--warn)" : "var(--muted)" }}>
              {d > 0 ? `${d}d` : d === 0 ? "today" : `${d}d`}
            </span>
          )}
          <select
            className="status-sel"
            aria-label="Status"
            value={item.status}
            onChange={(e) => onSetStatus(e.target.value as Status)}
            style={{ color: STATUS_COLOR[item.status] }}
          >
            {STATUSES.map((st) => <option key={st} value={st} style={{ color: "var(--ink)" }}>{STATUS_LABEL[st]}</option>)}
          </select>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLOR[item.priority], flex: "none" }} />
          {onDelete && (
            <button className="muted" onClick={onDelete} aria-label={`Delete ${item.title}`} style={{ padding: "0 2px" }}>
              <IconTrash size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
