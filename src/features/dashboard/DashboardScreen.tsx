import { useMemo, useState } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { CountUp } from "../../components/CountUp";
import { HabitGrid } from "../../components/HabitGrid";
import { Checkbox } from "../../components/Checkbox";
import { HelpTip } from "../../components/HelpTip";
import { StatusBar, Columns } from "../../components/Charts";
import { TaskSheet } from "../tasks/TaskSheet";
import { buildAgenda, sortAgenda } from "../tasks/agenda";
import { useTasks } from "../../stores/useTasks";
import { useHabits } from "../../stores/useHabits";
import { useBudget } from "../../stores/useBudget";
import { useSettings } from "../../stores/useSettings";
import {
  useGoals,
  useFunds,
  useDebts,
  useMeals,
  useGrocery,
  useWeight,
  useWorkouts,
  useHydration,
  useTimeBlocks,
} from "../../stores/v2";
import { summarize } from "../../lib/budget";
import { simulatePayoff } from "../../lib/debt";
import { addDaysISO, daysBetween, dueLabel, todayISO, weekDaysISO } from "../../lib/dates";
import {
  categoryColor,
  money as fmtMoney,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
} from "../../lib/ui";
import { navigate } from "../../router";
import { Icon, IconMoon, IconRepeat } from "../../components/icons";
import {
  PRIORITIES,
  STATUSES,
} from "../../lib/types";
import { DashboardHero } from "./DashboardHero";

function bmi(weight: number, height: number, system: "imperial" | "metric"): number {
  if (!weight || !height) return 0;
  return system === "imperial"
    ? (703 * weight) / (height * height)
    : weight / Math.pow(height / 100, 2);
}

function fmt12(hhmm: string): string {
  let [h] = hhmm.split(":").map(Number);
  const m = hhmm.split(":")[1];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function DashboardScreen() {
  const { tasks, recurrences, toggleComplete, toggleOccurrence } = useTasks();
  const { habits, log, isDone, toggle } = useHabits();
  const { periods, currentPeriodId, rowsFor } = useBudget();
  const { currency, weekStart, unitSystem, hydrationGoalMl, debtStrategy, monthlyExtra, categories } =
    useSettings();
  const { items: goals } = useGoals();
  const { items: funds } = useFunds();
  const { items: debts } = useDebts();
  const { items: meals } = useMeals();
  const { items: grocery } = useGrocery();
  const { items: weightLog } = useWeight();
  const { items: workouts, update: updateWorkout } = useWorkouts();
  const { items: timeBlocks } = useTimeBlocks();
  const hydration = useHydration();
  const [addOpen, setAddOpen] = useState(false);
  const today = todayISO();

  const agenda = useMemo(
    () => sortAgenda(buildAgenda(tasks, recurrences, addDaysISO(today, -90), addDaysISO(today, 60))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, recurrences]
  );

  const dueToday = agenda.filter((i) => i.date === today);
  const todayTotal = dueToday.length;
  const todayDone = dueToday.filter((i) => i.done).length;
  const overdue = agenda.filter((i) => i.date && i.date < today && !i.done);
  const overdueShown = overdue.slice(0, 4);
  // agenda is sorted ascending by date, so this is simply the next few undone
  // items after today — not just literally "tomorrow".
  const upcoming = agenda.filter((i) => !i.done && i.date && i.date > today);
  const upcomingShown = upcoming.slice(0, 3);
  const nextUp = upcoming[0];

  // habit progress this week
  const week = weekDaysISO(today, weekStart);
  const activeHabits = habits.filter((h) => h.active);
  const habitGoalTotal = activeHabits.reduce((a, h) => a + h.goalPerWeek, 0);
  const habitDoneTotal = activeHabits.reduce(
    (a, h) => a + week.filter((d) => isDone(h.id, d)).length,
    0
  );
  const habitPct = habitGoalTotal ? habitDoneTotal / habitGoalTotal : 0;

  // time blocking
  const todayBlocks = timeBlocks
    .filter((b) => b.date === today && b.item.trim())
    .sort((a, b) => (a.time < b.time ? -1 : 1));
  const blocksDone = todayBlocks.filter((b) => b.done).length;

  // goals
  const goalPct = goals.length
    ? goals.reduce((a, g) => a + (g.progress || 0), 0) / (goals.length * 100)
    : 0;
  const goalsAchieved = goals.filter((g) => g.status === "Completed").length;

  // finances
  const period = periods.find((p) => p.id === currentPeriodId) ?? periods[0];
  const rows = period ? rowsFor(period.id) : [];
  const sum = period ? summarize(period, rows) : null;
  const unpaidBills = period
    ? rows.filter((m) => m.kind === "bill" && m.dueDate && !m.paid).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    : [];
  const upcomingBills = unpaidBills.slice(0, 3);
  const weekEnd = addDaysISO(today, 7);
  const billsThisWeek = unpaidBills.filter((b) => b.dueDate >= today && b.dueDate <= weekEnd).length;

  const heroContext = [
    todayTotal > 0 ? `${todayTotal} task${todayTotal > 1 ? "s" : ""} today` : null,
    billsThisWeek > 0 ? `${billsThisWeek} bill${billsThisWeek > 1 ? "s" : ""} this week` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // budget vs actual groups
  const budgetGroups = sum
    ? [
        { label: "Income", budget: sum.incomeBudgeted, actual: sum.income },
        { label: "Bills", budget: rows.filter((r) => r.kind === "bill").reduce((a, r) => a + r.budgeted, 0), actual: sum.bills },
        { label: "Expenses", budget: rows.filter((r) => r.kind === "expense").reduce((a, r) => a + r.budgeted, 0), actual: sum.expenses },
        { label: "Savings", budget: rows.filter((r) => r.kind === "saving").reduce((a, r) => a + r.budgeted, 0), actual: sum.savings },
      ]
    : [];

  // savings (funds)
  const savedTotal = funds.reduce((a, f) => a + f.currentBalance, 0);
  const goalTotal = funds.reduce((a, f) => a + f.goalAmount, 0);
  const savingsPct = goalTotal ? savedTotal / goalTotal : 0;

  // debt
  const payoff = useMemo(
    () => simulatePayoff(debts, debtStrategy, monthlyExtra),
    [debts, debtStrategy, monthlyExtra]
  );
  const debtMonthly = debts.reduce((a, d) => a + d.minPayment, 0) + Math.max(0, monthlyExtra);
  const payoffColumns = debts
    .filter((d) => payoff.payoffMonthByDebt[d.id] !== undefined)
    .map((d) => ({ label: d.name.split(" ")[0], value: payoff.payoffMonthByDebt[d.id] }))
    .sort((a, b) => a.value - b.value);

  // task status breakdown (real task rows carry meaningful statuses)
  const statusSlices = STATUSES.map((st) => ({
    label: STATUS_LABEL[st],
    value: tasks.filter((t) => t.status === st).length,
    color: STATUS_COLOR[st],
  })).filter((s) => s.value > 0);
  const statusTotal = statusSlices.reduce((a, s) => a + s.value, 0);

  // priority by category (open items only)
  const priorityByCat = categories.map((cat) => {
    const open = agenda.filter((i) => i.category === cat && !i.done);
    return {
      cat,
      total: open.length,
      byPri: PRIORITIES.map((p) => ({ p, n: open.filter((i) => i.priority === p).length })),
    };
  }).filter((c) => c.total > 0);

  // meals today
  const slotOrder = ["breakfast", "lunch", "dinner", "snack"] as const;
  const mealsToday = meals
    .filter((m) => m.date === today)
    .sort((a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot));

  // fitness — workouts done per day this week
  const fitnessColumns = week.map((d, i) => ({
    label: ["S", "M", "T", "W", "T", "F", "S"][weekStart === 1 ? (i + 1) % 7 : i],
    value: workouts.filter((w) => w.date === d && w.done && !w.restDay).length,
  }));
  const fitnessDone = fitnessColumns.reduce((a, c) => a + c.value, 0);
  // fitness — what's actually logged for today, so the card shows the plan
  // itself (exercise names), not just an aggregate count with no context.
  const todayWorkouts = workouts.filter((w) => w.date === today && !w.restDay);
  const todayIsRestDay = workouts.some((w) => w.date === today && w.restDay);
  const todayWorkoutsDone = todayWorkouts.filter((w) => w.done).length;

  // weight — latest per participant + change
  const participants = Array.from(new Set(weightLog.map((w) => w.participant)));
  const weightRows = participants.map((name) => {
    const entries = weightLog
      .filter((w) => w.participant === name)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const latest = entries[entries.length - 1];
    const prev = entries[entries.length - 2];
    return {
      name,
      current: latest?.weight ?? 0,
      change: latest && prev ? latest.weight - prev.weight : 0,
      bmi: latest ? bmi(latest.weight, latest.height, unitSystem) : 0,
    };
  });

  // grocery
  const groceryLeft = grocery.filter((g) => !g.checked).length;

  // hydration — last 7 days
  const hydWeek = Array.from({ length: 7 }, (_, i) => addDaysISO(today, -6 + i));
  const hydColumns = hydWeek.map((d) => ({
    label: d.slice(8),
    value: hydration.items.find((h) => h.date === d)?.ml ?? 0,
  }));
  const hydToday = hydration.todayMl();
  const hydAvg = Math.round(hydColumns.reduce((a, c) => a + c.value, 0) / 7);

  return (
    <>
      <DashboardHero context={heroContext} />

      {/* Stat chips */}
      <div className="statgrid" data-tour="stats">
        <button className="stat" onClick={() => navigate("tasks", { seg: "overdue" })}>
          <span className="stat__value" style={{ color: overdue.length ? "var(--alert)" : undefined }}>
            <CountUp value={overdue.length} />
          </span>
          <span className="stat__label">Overdue</span>
        </button>
        <button className="stat" onClick={() => navigate("budget")}>
          <span className="stat__value">
            {sum ? <CountUp value={sum.leftToSpend} format={(n) => fmtMoney(n, currency)} /> : "—"}
          </span>
          <span className="stat__label">Left to spend</span>
        </button>
        <button className="stat" onClick={() => navigate("habits")}>
          <span className="stat__value">
            <CountUp value={Math.round(habitPct * 100)} format={(n) => `${n}%`} />
          </span>
          <span className="stat__label">Habits</span>
        </button>
        <button className="stat" onClick={() => navigate("goals")}>
          <span className="stat__value">
            <CountUp value={Math.round(goalPct * 100)} format={(n) => `${n}%`} />
          </span>
          <span className="stat__label">Goals</span>
        </button>
      </div>

      {/* Cards are direct children here, not grouped into fixed columns —
          on wide screens .bento auto-balances them across columns by height
          (CSS multi-column), so a short section (Wellness) no longer leaves
          a column trailing off into empty space while others keep going. */}
      <div className="bento">

      <div className="card card--today" data-tour="today">
        <div className="spread spread--top dash-today__head">
          <div>
            <div className="section-title section-title--flush section-title--accent2">
              Today
              <HelpTip text="Everything due today across Tasks and Recurring, in one checklist." />
            </div>
            <div className="muted muted-sub">
              {todayTotal === 0
                ? "Nothing due today. Enjoy the calm."
                : todayDone === 0
                ? `Fresh start: ${todayTotal} to go`
                : todayDone === todayTotal
                ? "All done today"
                : `${todayDone} of ${todayTotal} done`}
            </div>
          </div>
          {todayTotal > 0 &&
            (todayDone === 0 ? (
              <ProgressRing value={0} size={54} stroke={6} dotted
                ariaLabel={`${todayDone} of ${todayTotal} tasks done today`}
                center={<span className="dash-ring-label--empty">{todayDone}/{todayTotal}</span>} />
            ) : (
              <ProgressRing value={todayDone / todayTotal} size={54} stroke={6}
                ariaLabel={`${todayDone} of ${todayTotal} tasks done today`}
                center={<span className="dash-ring-label">{todayDone}/{todayTotal}</span>} />
            ))}
        </div>

        {dueToday.map((it) => (
          <div key={it.key} className={`row${it.done ? " row--done" : ""}`}>
            <Checkbox
              checked={it.done}
              onChange={() => {
                if (it.recurring && it.occurrence) toggleOccurrence(it.occurrence);
                else if (it.taskId) toggleComplete(it.taskId);
              }}
              label={it.title}
            />
            <div className="row__body">
              <div className="row__title row__title--inline">
                {it.recurring && <IconRepeat size={13} className="ic-muted" />}
                <span className="row__title-txt">{it.title}</span>
              </div>
              <div className="row__sub" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span className="dot-9 dot-9--round" style={{ background: categoryColor(it.category), flex: "none" }} />
                {it.category}{it.assignee ? ` · ${it.assignee}` : ""}
              </div>
            </div>
            <span className="priority-dot" style={{ background: PRIORITY_COLOR[it.priority] }} />
          </div>
        ))}

        {todayTotal === 0 && nextUp && (
          <div className="row dash-nextup">
            <div className="row__body">
              <div className="muted dash-eyebrow-11">NEXT UP</div>
              <div className="row__title row__title--inline dash-nextup__title">
                {nextUp.recurring && <IconRepeat size={13} className="ic-muted" />}
                <span className="row__title-txt">{nextUp.title}</span>
              </div>
            </div>
            <span className="dash-nextup__due">
              {dueLabel(nextUp.date)}
            </span>
          </div>
        )}

        {overdueShown.length > 0 && (
          <div className="dash-overdue">
            <span className="dash-overdue__label">
              {overdue.length} task{overdue.length > 1 ? "s" : ""} need{overdue.length > 1 ? "" : "s"} your love
            </span>
            {overdueShown.map((it) => (
              <div key={it.key} className="row">
                <Checkbox
                  checked={it.done}
                  onChange={() => {
                    if (it.recurring && it.occurrence) toggleOccurrence(it.occurrence);
                    else if (it.taskId) toggleComplete(it.taskId);
                  }}
                  label={it.title}
                />
                <div className="row__body">
                  <div className="row__title row__title--inline">
                    {it.recurring && <IconRepeat size={13} className="ic-muted" />}
                    <span className="row__title-txt">{it.title}</span>
                  </div>
                  <div className="row__sub" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span className="dot-9 dot-9--round" style={{ background: categoryColor(it.category), flex: "none" }} />
                    {it.category}
                  </div>
                </div>
                <span className="dash-duelabel--alert">
                  {dueLabel(it.date)}
                </span>
              </div>
            ))}
            {overdue.length > overdueShown.length && (
              <button className="muted dash-more-link"
                onClick={() => navigate("tasks", { seg: "overdue" })}>
                +{overdue.length - overdueShown.length} more →
              </button>
            )}
          </div>
        )}

        {upcomingShown.length > 0 && (
          <div className="dash-upcoming">
            <span className="muted eyebrow-12">UPCOMING</span>
            {upcomingShown.map((it) => (
              <div key={it.key} className="row dash-upcoming-row">
                <span className="dash-checkbox-spacer" />
                <div className="row__body">
                  <div className="row__title row__title--sm">{it.title}</div>
                </div>
                <span className="muted dash-upcoming__due">
                  {dueLabel(it.date)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Meals docked at the bottom of the hero */}
        <div className="today__meals">
          <div className="section-title section-title--tight8 section-title--warn">
            Meals today
            <HelpTip text="Today's planned meals, pulled from Meals." />
          </div>
          {mealsToday.length === 0 ? (
            <button className="btn btn--ghost dash-mealslink" onClick={() => navigate("meals")}>Plan today's meals →</button>
          ) : (
            mealsToday.map((m) => (
              <div key={m.id} className="spread dash-mealrow">
                <span className="muted dash-mealrow__slot">{m.slot}</span>
                <span>{m.name}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Today's schedule (time blocking) */}
      {todayBlocks.length > 0 && (
        <div className="card" data-tour="timeblock-card">
          <div className="spread spread--top" style={{ marginBottom: 12 }}>
            <div className="section-title section-title--compact section-title--flush">
              Today's schedule
              <HelpTip text="Your time-blocked plan for today. Tick a slot off here, or open Time Blocking to add more." />
            </div>
            <ProgressRing
              value={blocksDone / todayBlocks.length}
              size={44}
              stroke={5}
              dotted={blocksDone === 0}
              ariaLabel={`${blocksDone} of ${todayBlocks.length} time blocks done`}
              center={<span style={{ fontSize: 11, fontWeight: 800 }}>{blocksDone}/{todayBlocks.length}</span>}
            />
          </div>
          {todayBlocks.slice(0, 4).map((b) => (
            <div key={b.id} className={`row${b.done ? " row--done" : ""}`}>
              <Checkbox
                checked={b.done}
                onChange={() => useTimeBlocks.getState().update(b.id, { done: !b.done })}
                label={b.item}
              />
              <div className="row__body">
                <div className="row__title">{b.item}</div>
              </div>
              <span className="muted fs-13">{fmt12(b.time)}</span>
            </div>
          ))}
          {todayBlocks.length > 4 && (
            <button className="muted dash-more-link" onClick={() => navigate("timeblock")}>
              +{todayBlocks.length - 4} more →
            </button>
          )}
        </div>
      )}

      {/* Task status (compact) */}
      <div className="card" data-tour="task-status-card">
        <div className="section-title section-title--compact">
          Task status
          <HelpTip text="How your open tasks break down by status, across every category." />
        </div>
        <div className="spread spread--top" style={{ marginBottom: statusTotal > 0 ? 16 : 0 }}>
          <div className="row__body">
            <div className="txt-strong">
              {overdue.length ? `${overdue.length} need your love` : "You're on top of it"}
            </div>
            <div className="muted muted-sub">
              {agenda.filter((i) => i.date === today && !i.done).length} due today · {agenda.filter((i) => !i.done && i.date && i.date > today).length} upcoming
            </div>
          </div>
          {overdue.length > 0 && (
            <button
              className="muted dash-viewlink"
              onClick={() => navigate("tasks", { seg: "overdue" })}
            >
              View →
            </button>
          )}
        </div>
        {statusTotal > 0 && <StatusBar segments={statusSlices} />}
      </div>

      {/* Finances */}
      <div className="card" data-tour="finances">
        <div className="section-title section-title--compact section-title--success">
          Finances
          <HelpTip text="What's left to spend in your current Budget period." />
        </div>
        {sum ? (
          <>
            <div className={`big-number ${sum.overspent ? "neg" : ""}`}>
              <CountUp value={sum.leftToSpend} format={(n) => fmtMoney(n, currency)} />
            </div>
            <div className="muted dash-leftspend-label">left to spend</div>
            <div className="pbar mt-3">
              <div className={`pbar__fill${sum.overspent ? " pbar__fill--over" : ""}`}
                style={{ width: `${Math.min(100, Math.round((sum.actualOut / Math.max(1, sum.startBalance + sum.income)) * 100))}%` }} />
            </div>

            {/* Upcoming bills — promoted above the charts: the next bill due is
                the single most actionable money fact on this whole card, so it
                gets a featured tile, not a gray footnote. */}
            {upcomingBills.length > 0 && (() => {
              const [next, ...rest] = upcomingBills;
              const nextDays = daysBetween(today, next.dueDate);
              const nextUrgent = nextDays <= 0; // overdue or due today: the real siren
              const nextSoon = !nextUrgent && nextDays <= 3;
              const unpaidTotal = unpaidBills.reduce((a, b) => a + b.budgeted, 0);
              return (
                <div className="mt-5">
                  <div className="spread mb-3">
                    <span className="muted eyebrow-12">UPCOMING BILLS</span>
                    <span className="muted fs-12 tabular-nums">{fmtMoney(unpaidTotal, currency)} unpaid</span>
                  </div>
                  <button
                    className={`dash-nextbill${nextUrgent ? " dash-nextbill--urgent" : nextSoon ? " dash-nextbill--soon" : ""}`}
                    onClick={() => navigate("budget", { id: next.id })}
                    aria-label={`Next bill: ${next.name}, ${fmtMoney(next.budgeted, currency)}, due ${dueLabel(next.dueDate)}. Open in Budget`}
                  >
                    <span className="dash-nextbill__body">
                      <span className="dash-nextbill__name">{next.name}</span>
                      <span className="dash-nextbill__due">
                        {nextDays < 0 ? "Overdue · " : "Due "}
                        {dueLabel(next.dueDate).replace(/^In /, "in ")}
                      </span>
                    </span>
                    <span className="dash-nextbill__amt tabular-nums">{fmtMoney(next.budgeted, currency)}</span>
                  </button>
                  {rest.map((b) => {
                    const days = daysBetween(today, b.dueDate);
                    const urgent = days <= 0;
                    const soon = !urgent && days <= 3;
                    return (
                      <button
                        key={b.id}
                        className="spread dash-billrow dash-billrow--tap"
                        onClick={() => navigate("budget", { id: b.id })}
                        aria-label={`${b.name}, ${fmtMoney(b.budgeted, currency)}, due ${dueLabel(b.dueDate)}. Open in Budget`}
                      >
                        <span className="dash-billrow__name">{b.name}</span>
                        <span className="dash-billrow__meta">
                          <span className="txt-strong tabular-nums">{fmtMoney(b.budgeted, currency)}</span>
                          <span
                            className="dash-billrow__due"
                            style={{
                              background: urgent ? "var(--alert-soft)" : soon ? "var(--accent-soft)" : "var(--surface-2)",
                              color: urgent ? "var(--alert)" : soon ? "var(--accent)" : "var(--muted)",
                            }}
                          >
                            {dueLabel(b.dueDate)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Budget vs Actual */}
            <div className="mt-5">
              <div className="muted eyebrow-12 mb-3">BUDGET VS ACTUAL</div>
              <div className="dash-groupbars">
                {budgetGroups.map((g) => {
                  // Each bar is relative to its OWN target — a met goal reads full, not tiny.
                  const isIncome = g.label === "Income";
                  const over = g.budget > 0 && g.actual > g.budget;
                  const ratio = g.budget > 0 ? Math.min(1, g.actual / g.budget) : g.actual > 0 ? 1 : 0;
                  const fill = isIncome ? "var(--success)" : over ? "var(--alert)" : "var(--accent)";
                  return (
                    <div key={g.label}>
                      <div className="spread row-label-12">
                        <span className="muted">{g.label}</span>
                        <span className="muted tabular-nums">
                          {fmtMoney(g.actual, currency)} / {fmtMoney(g.budget, currency)}
                          {over && (
                            <span className="dash-group-over" style={{ color: isIncome ? "var(--success)" : "var(--alert)" }}>
                              {" "}(+{fmtMoney(g.actual - g.budget, currency)})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="pbar">
                        <div className="pbar__fill" style={{ width: `${ratio * 100}%`, background: fill }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <button className="btn btn--ghost" onClick={() => navigate("budget")}>Set up your budget →</button>
        )}
      </div>

      {/* Goals */}
      {goals.length > 0 && (
        <div className="card" data-tour="goals-card">
          <div className="section-title section-title--compact section-title--accent">
            Goals
            <HelpTip text="Overall progress across every active goal, driven by their step checklists." />
          </div>
          <div className="spread mb-3">
            <div className="txt-strong">{Math.round(goalPct * 100)}% overall</div>
            <span className="muted fs-13">{goalsAchieved}/{goals.length} achieved</span>
          </div>
          <div className="dash-goals-list">
            {goals.slice(0, 5).map((g) => (
              <div key={g.id}>
                <div className="spread row-label-13">
                  <span>{g.title}</span>
                  <span className="muted">{g.progress}%</span>
                </div>
                <div className="pbar">
                  <div className="pbar__fill" style={{ width: `${Math.min(100, g.progress)}%`, background: categoryColor(g.area) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Savings + Debt — compact tiles */}
      {(funds.length > 0 || debts.length > 0) && (
        <div className="tile-row" data-tour="wealth-tiles">
          {funds.length > 0 && (
            <button className="tile" onClick={() => navigate("savings")}>
              <span className="tile__label">Savings</span>
              <span className="tile__value tile__value--success">{Math.round(savingsPct * 100)}%</span>
              <span className="tile__sub">{fmtMoney(savedTotal, currency)} of {fmtMoney(goalTotal, currency)}</span>
            </button>
          )}
          {debts.length > 0 && (
            <button className="tile" onClick={() => navigate("debt")}>
              <span className="tile__label">Debt</span>
              <span className="tile__value">{fmtMoney(payoff.totalCurrent, currency)}</span>
              <span className="tile__sub">free {payoff.debtFreeLabel}</span>
            </button>
          )}
        </div>
      )}

      {/* Habits */}
      <div className="card" data-tour="habits-card">
        <div className="spread mb-4">
          <div className="section-title section-title--flush section-title--accent2">
            Habits this week
            <HelpTip text="How many of this week's habit check-ins are done so far." />
          </div>
          <span className="muted fs-13 tabular-nums">{habitDoneTotal}/{habitGoalTotal}</span>
        </div>
        {activeHabits.length === 0 ? (
          <button className="btn btn--ghost" onClick={() => navigate("habits")}>Add a habit →</button>
        ) : (
          <>
            {activeHabits.slice(0, 3).map((h) => {
              const done = isDone(h.id, today);
              return (
                <div key={h.id} className="row">
                  <span className="dash-habit-icon">
                    <Icon name={h.icon} size={18} />
                  </span>
                  <div className="row__body"><div className="row__title row__title--sm">{h.name}</div></div>
                  <Checkbox checked={done} onChange={() => toggle(h.id, today)} label={h.name} />
                </div>
              );
            })}
            <div className="mt-4">
              <HabitGrid
                doneDates={new Set(log.filter((l) => l.done).map((l) => l.date))}
                weeks={4}
                weekStart={weekStart}
                cell={13}
              />
            </div>
          </>
        )}
      </div>

      {/* Fitness */}
      <div className="card" data-tour="fitness-card">
        <div className="spread spread--top" style={{ marginBottom: 12 }}>
          <div className="section-title section-title--compact section-title--success section-title--flush">
            Fitness
            <HelpTip text="What's logged for today, plus how many sessions you've done this week. Tick one off here, or open Fitness to log a workout or mark a rest day." />
          </div>
          {todayWorkouts.length > 0 && (
            <span className="muted fs-13 tabular-nums">{todayWorkoutsDone}/{todayWorkouts.length}</span>
          )}
        </div>

        {todayIsRestDay ? (
          <div className="row">
            <span className="dash-habit-icon"><IconMoon size={18} /></span>
            <div className="row__body"><div className="row__title row__title--sm">Rest day</div></div>
          </div>
        ) : todayWorkouts.length > 0 ? (
          <>
            {todayWorkouts.slice(0, 3).map((w) => (
              <div key={w.id} className={`row${w.done ? " row--done" : ""}`}>
                <Checkbox checked={w.done} onChange={() => updateWorkout(w.id, { done: !w.done })} label={w.exercise} />
                <div className="row__body">
                  <div className="row__title row__title--sm">{w.exercise}</div>
                  {w.muscleGroup && <div className="row__sub">{w.muscleGroup}</div>}
                </div>
              </div>
            ))}
            {todayWorkouts.length > 3 && (
              <button className="muted dash-more-link" onClick={() => navigate("fitness")}>
                +{todayWorkouts.length - 3} more →
              </button>
            )}
          </>
        ) : (
          <button className="btn btn--ghost" onClick={() => navigate("fitness")}>Log today's workout →</button>
        )}

        {workouts.length > 0 && (
          <div className="mt-4">
            <div className="muted fs-13" style={{ marginBottom: 20 }}>{fitnessDone} session{fitnessDone === 1 ? "" : "s"} this week</div>
            <Columns points={fitnessColumns} height={70} color="var(--accent-2)" showValues />
          </div>
        )}
      </div>

      {/* Hydration + Weight + Grocery — compact tiles */}
      <div className="tile-row" data-tour="wellness-tiles">
        <button className="tile" onClick={() => navigate("hydration")}>
          <span className="tile__label">Hydration</span>
          <span className="tile__value tile__value--sky">{hydrationGoalMl ? Math.round((hydToday / hydrationGoalMl) * 100) : 0}%</span>
          <span className="tile__sub">{hydToday} / {hydrationGoalMl} ml</span>
        </button>
        {weightRows.length > 0 && (
          <button className="tile" onClick={() => navigate("weight")}>
            <span className="tile__label">Weight</span>
            <span className="tile__value">{weightRows[0].current || "—"}</span>
            <span className="tile__sub">BMI {weightRows[0].bmi ? weightRows[0].bmi.toFixed(1) : "—"}</span>
          </button>
        )}
        <button className="tile" onClick={() => navigate("grocery")}>
          <span className="tile__label">Grocery</span>
          <span className="tile__value">{groceryLeft}<span className="dash-tile-suffix"> items</span></span>
          <span className="tile__sub">View list →</span>
        </button>
      </div>

      </div>{/* .bento */}

      <TaskSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
