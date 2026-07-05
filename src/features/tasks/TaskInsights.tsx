// The "Smart Task Center" analytics header: auto-calculated KPIs + live charts
// (status / category / priority donuts, completion ring, priority-by-category,
// upcoming dues, person-in-charge). All CSS/JS charts — no SVG, no chart lib.
import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Donut, Columns, StackedColumns } from "../../components/Charts";
import { ProgressRing } from "../../components/ProgressRing";
import { IconBell, IconCheck, IconChevron, IconHeart } from "../../components/icons";
import { addDaysISO, daysBetween, fromISO, format } from "../../lib/dates";
import {
  categoryColor,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
} from "../../lib/ui";
import { PRIORITIES, STATUSES } from "../../lib/types";
import type { AgendaItem } from "./agenda";

export function TaskInsights({
  items,
  today,
  categories,
}: {
  items: AgendaItem[];
  today: string;
  categories: string[];
}) {
  const [open, setOpen] = useState(false);

  const s = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.done).length;
    const dated = (i: AgendaItem) => !!i.date;
    const overdue = items.filter((i) => dated(i) && i.date < today && !i.done).length;
    const dueToday = items.filter((i) => i.date === today && !i.done).length;
    const dueTomorrow = items.filter((i) => i.date === addDaysISO(today, 1) && !i.done).length;
    const dueIn = (n: number) =>
      items.filter((i) => dated(i) && i.date > today && daysBetween(today, i.date) <= n && !i.done).length;

    // breakdowns
    const byStatus = STATUSES.map((st) => ({
      label: STATUS_LABEL[st],
      value: items.filter((i) => i.status === st).length,
      color: STATUS_COLOR[st],
    })).filter((x) => x.value > 0);

    const cats = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));
    const byCategory = cats.map((c) => ({
      label: c,
      value: items.filter((i) => i.category === c).length,
      color: categoryColor(c),
    }));

    const byPriority = PRIORITIES.map((p) => ({
      label: PRIORITY_LABEL[p],
      value: items.filter((i) => i.priority === p).length,
      color: PRIORITY_COLOR[p],
    })).filter((x) => x.value > 0);

    // priority by category (open items only)
    const priByCat = categories.map((cat) => {
      const open = items.filter((i) => i.category === cat && !i.done);
      return {
        cat,
        total: open.length,
        byPri: PRIORITIES.map((p) => ({ p, n: open.filter((i) => i.priority === p).length })),
      };
    }).filter((c) => c.total > 0);

    // activity timeline — the past week through the rest of this week, completed vs pending
    const activity = Array.from({ length: 14 }, (_, k) => addDaysISO(today, k - 7)).map((d) => {
      const onDay = items.filter((i) => i.date === d);
      return {
        label: format(fromISO(d), "d"),
        a: onDay.filter((i) => i.done).length,
        b: onDay.filter((i) => !i.done).length,
      };
    });

    // person in charge — task count per assignee
    const people = Array.from(new Set(items.map((i) => i.assignee).filter(Boolean)));
    const byPerson = people
      .map((name) => ({ label: name, value: items.filter((i) => i.assignee === name).length }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return {
      total,
      completed,
      ongoing: total - completed,
      completionPct: total ? completed / total : 0,
      overdue,
      dueToday,
      dueTomorrow,
      due7: dueIn(7),
      due14: dueIn(14),
      byStatus,
      byCategory,
      byPriority,
      priByCat,
      activity,
      byPerson,
    };
  }, [items, today, categories]);

  const kpis: { label: string; value: string; alert?: boolean }[] = [
    { label: "Total tasks", value: String(s.total) },
    { label: "Completion", value: `${Math.round(s.completionPct * 100)}%` },
    { label: "Ongoing", value: String(s.ongoing) },
    { label: "Completed", value: String(s.completed) },
    { label: "Overdue", value: String(s.overdue), alert: s.overdue > 0 },
    { label: "Due today", value: String(s.dueToday) },
    { label: "Due ≤ 7 days", value: String(s.due7) },
    { label: "Due ≤ 14 days", value: String(s.due14) },
  ];

  const alerts: { icon: LucideIcon; text: string; tone: "alert" | "accent" | "success" }[] = [];
  if (s.dueTomorrow > 0) {
    alerts.push({ icon: IconBell, tone: "accent", text: `${s.dueTomorrow} task${s.dueTomorrow > 1 ? "s" : ""} due tomorrow` });
  }
  if (s.total > 0) {
    alerts.push({ icon: IconCheck, tone: "success", text: `Completed ${Math.round(s.completionPct * 100)}% of tasks` });
  }
  if (s.overdue > 0) {
    alerts.push({ icon: IconHeart, tone: "alert", text: `${s.overdue} overdue task${s.overdue > 1 ? "s" : ""} need your love` });
  }

  return (
    <div style={{ marginBottom: 4 }}>
      {alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {alerts.map((a) => (
            <div
              key={a.text}
              className="card"
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                background: `var(--${a.tone}-soft, var(--surface-2))`,
              }}
            >
              <span style={{
                width: 30, height: 30, borderRadius: "50%", flex: "none",
                display: "grid", placeItems: "center",
                background: "var(--surface)", color: `var(--${a.tone})`,
              }}>
                <a.icon size={15} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* KPI strip — always visible */}
      <div className="statgrid" style={{ marginBottom: 10 }}>
        {kpis.map((k) => (
          <div key={k.label} className="stat" style={{ cursor: "default" }}>
            <span className="stat__value" style={{ fontSize: 20, color: k.alert ? "var(--alert)" : undefined }}>
              {k.value}
            </span>
            <span className="stat__label">{k.label}</span>
          </div>
        ))}
      </div>

      <button
        className="btn btn--ghost"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px" }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Hide charts" : "Show charts"}
        <IconChevron size={16} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div className="spread" style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>OVERALL COMPLETION</div>
            </div>
            <div style={{ display: "grid", placeItems: "center" }}>
              <ProgressRing value={s.completionPct} size={110} stroke={12} showPct label="done"
                ariaLabel={`${s.completed} of ${s.total} tasks done`} />
            </div>
          </div>

          {s.byStatus.length > 0 && (
            <div className="card">
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>STATUS</div>
              <Donut slices={s.byStatus} size={104} thickness={16} />
            </div>
          )}

          {s.byCategory.length > 0 && (
            <div className="card">
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>CATEGORY</div>
              <Donut slices={s.byCategory} size={104} thickness={16} />
            </div>
          )}

          {s.byPriority.length > 0 && (
            <div className="card">
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>PRIORITY</div>
              <Donut slices={s.byPriority} size={104} thickness={16} />
            </div>
          )}

          {s.priByCat.length > 0 && (
            <div className="card">
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>PRIORITY BY CATEGORY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {s.priByCat.map((c) => (
                  <div key={c.cat}>
                    <div className="spread" style={{ fontSize: 12, marginBottom: 3 }}>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: categoryColor(c.cat) }} />
                        {c.cat}
                      </span>
                      <span className="muted">{c.total}</span>
                    </div>
                    <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "var(--surface-2)" }}>
                      {c.byPri.filter((b) => b.n > 0).map((b) => (
                        <div key={b.p} title={`${PRIORITY_LABEL[b.p]}: ${b.n}`} style={{ flex: b.n, background: PRIORITY_COLOR[b.p] }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>TASK ACTIVITY TIMELINE</div>
            <StackedColumns points={s.activity} height={110} labelA="Completed" labelB="Pending" />
          </div>

          {s.byPerson.length > 0 && (
            <div className="card">
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>PERSON IN CHARGE</div>
              <Columns points={s.byPerson} height={110} color="var(--accent-2)" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
