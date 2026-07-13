import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { Segmented } from "../../components/Segmented";
import { EmptyState } from "../../components/EmptyState";
import { CountUp } from "../../components/CountUp";
import { StatusBar, Donut, GroupedBars } from "../../components/Charts";
import { HelpTip } from "../../components/HelpTip";
import { IconBell, IconBudget, IconCheck, IconClose, IconPlus, IconRepeat } from "../../components/icons";
import { IconTip } from "../../components/IconTip";
import { useBudget } from "../../stores/useBudget";
import { useFunds } from "../../stores/v2";
import { useSettings } from "../../stores/useSettings";
import { rowDiff, summarize, computePeriodRange } from "../../lib/budget";
import { money as fmtMoney } from "../../lib/ui";
import { dueLabel, fromISO, format, todayISO } from "../../lib/dates";
import { routeQuery } from "../../router";
import type { BudgetCadence, BudgetPeriod, MoneyKind, MoneyRow } from "../../lib/types";

const KINDS: { value: MoneyKind; label: string }[] = [
  { value: "income", label: "Income" },
  { value: "bill", label: "Bills" },
  { value: "expense", label: "Expenses" },
  { value: "debt", label: "Debt" },
  { value: "saving", label: "Savings" },
];

const NAME_PRESETS: Partial<Record<MoneyKind, string[]>> = {
  income: ["Paycheck", "Salary", "Bonus", "Gifts"],
  saving: ["Car fund", "Wedding fund", "Travel fund", "Stocks", "Mutual fund", "Cryptocurrency"],
  debt: ["Credit card", "Student loans", "Mortgage", "Car payment", "Personal loan"],
};

const CADENCES: { value: BudgetCadence; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "weekly", label: "Weekly" },
  { value: "paycheck", label: "Paycheck" },
  { value: "custom", label: "Custom" },
];

const BREAKDOWN_COLORS: Record<string, string> = {
  Bills: "var(--cat-teal)",
  Expenses: "var(--cat-pink)",
  Debt: "var(--cat-lavender)",
  Savings: "var(--cat-butter)",
};

export function BudgetScreen() {
  const {
    periods,
    currentPeriodId,
    setCurrent,
    rowsFor,
    addMoney,
    updateMoney,
    deleteMoney,
    addPeriod,
    updatePeriod,
  } = useBudget();
  const { currency, categories } = useSettings();
  const { items: funds } = useFunds();

  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<MoneyKind>("expense");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // A calendar click or a quick-add toast's "View" jumps here with ?id= — a
  // bill has no modal editor (rows are inline-editable), so instead we switch
  // to the period that actually contains it and scroll/flash the row, rather
  // than silently leaving the user on whatever period happened to be open.
  useEffect(() => {
    const id = routeQuery().get("id");
    if (!id) return;
    const row = useBudget.getState().money.find((m) => m.id === id);
    if (!row) return;
    if (row.periodId && row.periodId !== useBudget.getState().currentPeriodId) {
      setCurrent(row.periodId);
    }
    setHighlightId(id);
    requestAnimationFrame(() => {
      document.getElementById(`money-row-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const t = setTimeout(() => setHighlightId(null), 2000);
    return () => clearTimeout(t);
  }, []);

  const period = periods.find((p) => p.id === currentPeriodId) ?? periods[0];
  const rows = period ? rowsFor(period.id) : [];
  const sum = useMemo(
    () => (period ? summarize(period, rows) : null),
    [period, rows]
  );

  if (!period || !sum) {
    return (
      <>
        <Head />
        <div className="card">
          <EmptyState icon={<IconBudget size={28} />} title="No budget period yet" sub="Create one to start tracking.">
            <button className="btn btn--primary" onClick={() => createPeriod(addPeriod, "monthly")}>
              Create this month
            </button>
          </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      <Head />

      {/* Overview */}
      <div className="card">
        <button
          className="spread"
          data-tour="budget-period"
          style={{ width: "100%", textAlign: "left", background: "none" }}
          onClick={() => setPeriodOpen(true)}
        >
          <div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
              {(CADENCES.find((c) => c.value === period.cadence)?.label ?? "Monthly").toUpperCase()} PERIOD
            </div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{period.label}</div>
          </div>
          <span className="chip">Change</span>
        </button>
        <div className="ov-grid">
          <div>
            <div className="ov-cell__label">Start date</div>
            <div className="ov-cell__value">{format(fromISO(period.startDate), "MMM d, yyyy")}</div>
          </div>
          <div>
            <div className="ov-cell__label">End date</div>
            <div className="ov-cell__value">{format(fromISO(period.endDate), "MMM d, yyyy")}</div>
          </div>
          <div>
            <div className="ov-cell__label">Currency</div>
            <div className="ov-cell__value">{currency}</div>
          </div>
          <div>
            <div className="ov-cell__label">Start balance</div>
            <input
              className="ov-cell__input"
              type="number"
              defaultValue={period.startBalance || ""}
              placeholder="0"
              aria-label="Start balance"
              onBlur={(e) => updatePeriod(period.id, { startBalance: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
      </div>

      {/* Left to spend */}
      <div className="card" data-tour="budget-leftspend" style={{ marginTop: 12 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
          LEFT TO SPEND
          <HelpTip text="Start balance plus actual income received, minus actual bills, expenses, debt payments and savings." />
        </div>
        <div className={`big-number ${sum.overspent ? "neg" : ""}`}>
          <CountUp value={sum.leftToSpend} format={(n) => fmtMoney(n, currency)} />
        </div>
        <div style={{ marginTop: 10 }}>
          <StatusBar
            segments={[
              { label: "Actual spent", value: Math.max(0, sum.actualOut), color: sum.overspent ? "var(--alert)" : "var(--accent)" },
              { label: "Left to spend", value: Math.max(0, sum.leftToSpend), color: "var(--surface-2)" },
            ]}
          />
        </div>
      </div>

      {/* Left to budget */}
      <div className="card" data-tour="budget-leftbudget">
        <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
          LEFT TO BUDGET
          <HelpTip text="Income you've planned to receive, minus what you've already assigned to bills, expenses, debt and savings. Based on planned amounts, not what actually happened." />
        </div>
        <div className={sum.leftToBudget < 0 ? "big-number neg" : "big-number"} style={{ fontSize: 28 }}>
          {fmtMoney(sum.leftToBudget, currency)}
        </div>
        <div style={{ marginTop: 10 }}>
          <StatusBar
            segments={[
              { label: "Already budgeted", value: Math.max(0, sum.budgetedOut), color: "var(--accent-2)" },
              { label: "Left to budget", value: Math.max(0, sum.leftToBudget), color: "var(--surface-2)" },
            ]}
          />
        </div>
      </div>

      {/* Budget vs actual */}
      <div className="section-title">
        Budget vs actual
        <HelpTip text="Planned amounts compared to what actually happened, for each category." />
      </div>
      <div className="card" data-tour="budget-charts">
        <GroupedBars
          data={[
            { label: "Income", budget: sum.incomeBudgeted, actual: sum.income },
            { label: "Bills", budget: sum.billsBudgeted, actual: sum.bills },
            { label: "Expenses", budget: sum.expensesBudgeted, actual: sum.expenses },
            { label: "Debt", budget: sum.debtBudgeted, actual: sum.debt },
            { label: "Savings", budget: sum.savingsBudgeted, actual: sum.savings },
          ]}
        />
      </div>

      {/* Actual breakdown */}
      <div className="section-title">
        Actual breakdown
        <HelpTip text="How your actual spending this period splits across bills, expenses, debt and savings. Based on the Actual amount you log on each line below, not the Budgeted amount. Empty until you fill those in." />
      </div>
      <div className="card" data-tour="budget-breakdown">
        <Donut
          slices={[
            { label: "Bills", value: sum.bills, color: BREAKDOWN_COLORS.Bills },
            { label: "Expenses", value: sum.expenses, color: BREAKDOWN_COLORS.Expenses },
            { label: "Debt", value: sum.debt, color: BREAKDOWN_COLORS.Debt },
            { label: "Savings", value: sum.savings, color: BREAKDOWN_COLORS.Savings },
          ]}
          center={<div style={{ fontWeight: 800, fontSize: 15 }}>{fmtMoney(sum.actualOut, currency)}</div>}
        />
      </div>

      {/* Cash flow */}
      <div className="section-title">
        Cash flow
        <HelpTip text="Your money moving through the period: start balance, plus income and savings, minus bills, expenses and debt, equals what's left." />
      </div>
      <div className="card" data-tour="budget-cashflow">
        <div className="cf-head">
          <span className="cf-row__label" />
          <span className="cf-row__col">Budget</span>
          <span className="cf-row__col">Actual</span>
        </div>
        <CashFlowRow label="Start balance" budget={sum.startBalance} actual={sum.startBalance} currency={currency} />
        <CashFlowRow label="+ Income" budget={sum.incomeBudgeted} actual={sum.income} currency={currency} />
        <CashFlowRow label="+ Savings" budget={sum.savingsBudgeted} actual={sum.savings} currency={currency} />
        <CashFlowRow label="− Bills" budget={-sum.billsBudgeted} actual={-sum.bills} currency={currency} />
        <CashFlowRow label="− Expenses" budget={-sum.expensesBudgeted} actual={-sum.expenses} currency={currency} />
        <CashFlowRow label="− Debt" budget={-sum.debtBudgeted} actual={-sum.debt} currency={currency} />
        <CashFlowRow label="= Left" budget={sum.leftToBudget} actual={sum.leftToSpend} currency={currency} total />
      </div>

      {/* Sections */}
      {KINDS.map(({ value, label }) => {
        const kindRows = rows.filter((r) => r.kind === value);
        const total = kindRows.reduce((a, r) => a + (r.actual || 0), 0);
        return (
          <div key={value}>
            <div className="section-title spread" style={{ display: "flex" }}>
              <span>{label}</span>
              <span>{fmtMoney(total, currency)}</span>
            </div>
            <div className="card" style={{ padding: "4px 16px" }} data-tour={`budget-rows-${value}`}>
              {kindRows.length === 0 ? (
                <div className="row">
                  <span className="muted" style={{ fontSize: 14 }}>Nothing here yet</span>
                </div>
              ) : (
                kindRows.map((r) => (
                  <MoneyRowView
                    key={r.id}
                    row={r}
                    currency={currency}
                    fundName={funds.find((f) => f.id === r.fundId)?.name}
                    onChange={(patch) => updateMoney(r.id, patch)}
                    onDelete={() => deleteMoney(r.id)}
                    highlight={highlightId === r.id}
                  />
                ))
              )}
              <button
                className="btn btn--ghost"
                style={{ padding: 12 }}
                onClick={() => {
                  setAddKind(value);
                  setAddOpen(true);
                }}
              >
                + Add {label.toLowerCase().replace(/s$/, "")}
              </button>
            </div>
          </div>
        );
      })}

      <IconTip label="Add income, a bill, or an expense">
        <button className="fab" aria-label="Add" data-tour="budget-fab" onClick={() => { setAddKind("expense"); setAddOpen(true); }}>
          <IconPlus />
        </button>
      </IconTip>

      <AddMoneySheet
        open={addOpen}
        kind={addKind}
        onKind={setAddKind}
        currency={currency}
        funds={funds}
        categories={categories}
        onClose={() => setAddOpen(false)}
        onAdd={(row) => { addMoney(row); setAddOpen(false); }}
      />

      <PeriodSheet
        open={periodOpen}
        onClose={() => setPeriodOpen(false)}
        periods={periods}
        currentId={period.id}
        onSelect={(id) => { setCurrent(id); setPeriodOpen(false); }}
        onCreate={(opts) => {
          const range =
            opts.cadence === "custom" && opts.endDate
              ? {
                  startDate: opts.startDate,
                  endDate: opts.endDate,
                  label: `${format(fromISO(opts.startDate), "MMM d")} – ${format(fromISO(opts.endDate), "MMM d")}`,
                }
              : computePeriodRange(opts.cadence, opts.startDate);
          addPeriod(
            { label: range.label, cadence: opts.cadence, startDate: range.startDate, endDate: range.endDate },
            { carryFrom: period.id, carryBalance: opts.carryBalance }
          );
          setPeriodOpen(false);
        }}
      />
    </>
  );
}

function Head() {
  return (
    <div className="screen-head">
      <div className="screen-head__eyebrow">Track every dollar</div>
      <h1 className="screen-head__title">
        Budget
        <HelpTip text="Track income, bills, expenses, debt and savings for a period, and see what's left to spend." />
      </h1>
    </div>
  );
}

function createPeriod(
  addPeriod: ReturnType<typeof useBudget.getState>["addPeriod"],
  cadence: BudgetCadence,
  carryFrom?: string,
  carryBalance = true
) {
  const range = computePeriodRange(cadence, todayISO());
  addPeriod(
    { label: range.label, cadence, startDate: range.startDate, endDate: range.endDate },
    carryFrom ? { carryFrom, carryBalance } : undefined
  );
}

function CashFlowRow({
  label,
  budget,
  actual,
  currency,
  total,
}: {
  label: string;
  budget: number;
  actual: number;
  currency: string;
  total?: boolean;
}) {
  return (
    <div className={`cf-row${total ? " cf-row--total" : ""}`}>
      <span className="cf-row__label">{label}</span>
      <span className={`cf-row__col${budget < 0 ? " neg" : ""}`}>{fmtMoney(budget, currency)}</span>
      <span className={`cf-row__col${actual < 0 ? " neg" : ""}`}>{fmtMoney(actual, currency)}</span>
    </div>
  );
}

function MoneyRowView({
  row,
  currency,
  fundName,
  onChange,
  onDelete,
  highlight,
}: {
  row: MoneyRow;
  currency: string;
  fundName?: string;
  onChange: (patch: Partial<MoneyRow>) => void;
  onDelete: () => void;
  highlight?: boolean;
}) {
  const diff = rowDiff(row);
  const over = diff < 0;
  return (
    <div id={`money-row-${row.id}`} className={`row${highlight ? " row--flash" : ""}`}>
      {(row.kind === "bill" || row.kind === "debt") && (
        <input
          type="checkbox"
          checked={row.paid}
          onChange={(e) => onChange({ paid: e.target.checked })}
          aria-label={`${row.name} paid`}
          style={{ width: 20, height: 20, accentColor: "var(--success)" }}
        />
      )}
      <div className="row__body">
        <div className="row__title">{row.name || "Untitled"}</div>
        <div className="row__sub">
          {row.category ? `${row.category} · ` : ""}
          {row.kind === "income" ? "Expected" : "Budget"} {fmtMoney(row.budgeted, currency)}
          {row.dueDate ? ` · ${dueLabel(row.dueDate)}` : ""}
          {fundName ? ` · → ${fundName}` : ""}
          {row.repeats && row.repeatsUntil ? ` · until ${dueLabel(row.repeatsUntil)}` : ""}
        </div>
      </div>
      <IconTip label={row.repeats
        ? row.repeatsUntil ? `Repeats until ${row.repeatsUntil}. Tap to make one-time` : "Repeats every period. Tap to make one-time"
        : "One-time. Tap to repeat every period"}>
        <button
          className="muted"
          onClick={() => onChange({ repeats: !row.repeats })}
          aria-label={row.repeats ? `Stop repeating ${row.name || "item"} each period` : `Repeat ${row.name || "item"} every period`}
          aria-pressed={row.repeats}
          title={row.repeats
            ? row.repeatsUntil ? `Repeats until ${row.repeatsUntil}. Tap to make one-time` : "Repeats every period. Tap to make one-time"
            : "One-time. Tap to repeat every period"}
          style={{ color: row.repeats ? "var(--accent)" : undefined }}
        >
          <IconRepeat size={16} />
        </button>
      </IconTip>
      {(row.kind === "bill" || row.kind === "debt") && (
        <IconTip label={row.dueDate
          ? row.remind ? `Turn off reminder for ${row.name || "item"}` : `Remind me about ${row.name || "item"}`
          : "Add a due date to enable the reminder"}>
          <button
            className="muted"
            onClick={() => onChange({ remind: !row.remind })}
            aria-label={row.remind ? `Turn off reminder for ${row.name || "item"}` : `Remind me about ${row.name || "item"}`}
            aria-pressed={row.remind}
            title={row.dueDate ? undefined : "Add a due date to enable the reminder"}
            style={{ color: row.remind ? "var(--accent)" : undefined }}
          >
            <IconBell size={16} />
          </button>
        </IconTip>
      )}
      <div style={{ textAlign: "right" }}>
        <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>
          Actual
        </div>
        {row.budgeted > 0 && row.actual !== row.budgeted && (
          <button
            type="button"
            onClick={() => onChange({ actual: row.budgeted })}
            aria-label={`Copy the budgeted amount, ${fmtMoney(row.budgeted, currency)}, into actual for ${row.name || "item"}`}
            style={{
              display: "flex", alignItems: "center", gap: 3, marginLeft: "auto", marginBottom: 4,
              padding: "3px 8px", borderRadius: 999, border: "none",
              background: "var(--accent-soft)", color: "var(--accent)",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}
          >
            <IconCheck size={11} />
            Use {fmtMoney(row.budgeted, currency)}
          </button>
        )}
        <input
          type="number"
          value={row.actual || ""}
          placeholder="0"
          onChange={(e) => onChange({ actual: Number(e.target.value) || 0 })}
          aria-label={`${row.name} actual`}
          style={{
            width: 84,
            textAlign: "right",
            padding: "6px 8px",
            borderRadius: 10,
            background: over ? "var(--alert-soft)" : "var(--surface-2)",
            color: over ? "var(--alert)" : "var(--ink)",
            border: "none",
            fontWeight: 700,
            fontSize: 15,
          }}
        />
        <div style={{ fontSize: 11, marginTop: 2 }} className={over ? "neg" : "muted"}>
          {over ? `(${fmtMoney(diff, currency)})` : fmtMoney(diff, currency)}
        </div>
      </div>
      <IconTip label={`Delete ${row.name || "item"}`}>
        <button className="muted" onClick={onDelete} aria-label={`Delete ${row.name || "item"}`}>
          <IconClose size={16} />
        </button>
      </IconTip>
    </div>
  );
}

function AddMoneySheet({
  open,
  kind,
  onKind,
  currency,
  funds,
  categories,
  onClose,
  onAdd,
}: {
  open: boolean;
  kind: MoneyKind;
  onKind: (k: MoneyKind) => void;
  currency: string;
  funds: ReturnType<typeof useFunds.getState>["items"];
  categories: string[];
  onClose: () => void;
  onAdd: (row: Partial<MoneyRow>) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [budgeted, setBudgeted] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fundId, setFundId] = useState("");
  const [remind, setRemind] = useState(false);
  // "Repeats" is what a NEW period's carry-over actually checks (see
  // carryOver() in budget.ts) — income/bills default ON since a paycheck or
  // rent showing up once and never again is the surprising case, not the
  // normal one; expenses/savings/debt default OFF since those are more often
  // logged per-occurrence than templated.
  const [repeats, setRepeats] = useState(kind === "income" || kind === "bill");
  const [repeatsUntil, setRepeatsUntil] = useState("");

  function submit() {
    if (!name.trim()) return;
    const hasDueDate = kind === "bill" || kind === "debt";
    onAdd({
      kind,
      name: name.trim(),
      category,
      budgeted: Number(budgeted) || 0,
      dueDate: hasDueDate ? dueDate : "",
      fundId: kind === "saving" ? fundId : "",
      remind: hasDueDate ? remind : false,
      repeats,
      repeatsUntil: repeats ? repeatsUntil : "",
    });
    setName("");
    setCategory("");
    setBudgeted("");
    setDueDate("");
    setFundId("");
    setRemind(false);
    setRepeats(kind === "income" || kind === "bill");
    setRepeatsUntil("");
  }

  const presets = NAME_PRESETS[kind];

  return (
    <BottomSheet open={open} title="Add line" onClose={onClose}>
      <div className="field">
        <label className="field__label">Type</label>
        <Segmented options={KINDS} value={kind} onChange={onKind} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="money-name">Name</label>
        <input id="money-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Groceries" onKeyDown={(e) => e.key === "Enter" && submit()} />
        {presets && (
          <ChipRow>
            {presets.map((p) => (
              <Chip key={p} active={name === p} onClick={() => setName(p)}>{p}</Chip>
            ))}
          </ChipRow>
        )}
      </div>
      {categories.length > 0 && (
        <div className="field">
          <label className="field__label">Category (optional)</label>
          <ChipRow>
            <Chip active={!category} onClick={() => setCategory("")}>None</Chip>
            {categories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? "" : c)}>{c}</Chip>
            ))}
          </ChipRow>
        </div>
      )}
      <div className="field">
        <label className="field__label" htmlFor="money-budgeted">
          {kind === "income" ? `Expected income (${currency})` : `Budgeted (${currency})`}
          <HelpTip
            text={
              kind === "income"
                ? "How much you expect to receive this period, e.g. your paycheck amount. You'll compare it to what actually comes in."
                : "How much you plan to spend. You'll compare it to what you actually spend."
            }
          />
        </label>
        <input id="money-budgeted" className="input" type="number" inputMode="decimal" value={budgeted}
          onChange={(e) => setBudgeted(e.target.value)} placeholder="0" />
      </div>
      <div className="field">
        <label className="check-label spread" style={{ cursor: "pointer" }}>
          <span className="field__label" style={{ margin: 0 }}>Repeats each period</span>
          <button
            role="switch"
            aria-checked={repeats}
            aria-label="Repeats each period"
            onClick={() => setRepeats((v) => !v)}
            style={{
              width: 50, height: 30, borderRadius: 999,
              background: repeats ? "var(--accent)" : "var(--surface-2)",
              position: "relative", transition: "background .2s",
            }}
          >
            <span style={{
              position: "absolute", top: 3, left: repeats ? 23 : 3, width: 24, height: 24,
              borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
              transition: "left .2s",
            }} />
          </button>
        </label>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {repeats
            ? "This line carries into every new budget period automatically."
            : "One-time. This line stays in this period only."}
        </p>
        {repeats && (
          <div style={{ marginTop: 10 }}>
            <label className="field__label" htmlFor="money-repeats-until">Stop repeating after (optional)</label>
            <input id="money-repeats-until" className="input" type="date" value={repeatsUntil}
              onChange={(e) => setRepeatsUntil(e.target.value)} />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Leave blank to repeat indefinitely. Set a date for something that repeats but
              ends: a loan with a few payments left, a subscription you know is ending.
            </p>
          </div>
        )}
      </div>
      {(kind === "bill" || kind === "debt") && (
        <div className="field">
          <label className="field__label" htmlFor="money-due-date">Due date</label>
          <input id="money-due-date" className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      )}
      {(kind === "bill" || kind === "debt") && (
        <div className="field">
          <label className="check-label spread" style={{ cursor: "pointer" }}>
            <span className="field__label" style={{ margin: 0 }}>
              Remind me
            </span>
            <button
              role="switch"
              aria-checked={remind}
              aria-label="Remind me"
              onClick={() => setRemind((v) => !v)}
              style={{
                width: 50,
                height: 30,
                borderRadius: 999,
                background: remind ? "var(--accent)" : "var(--surface-2)",
                position: "relative",
                transition: "background .2s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: remind ? 23 : 3,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                  transition: "left .2s",
                }}
              />
            </button>
          </label>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Creates a Google Calendar event once your account is connected and a due date is set.
          </p>
        </div>
      )}
      {kind === "saving" && funds.length > 0 && (
        <div className="field">
          <label className="field__label" htmlFor="money-fund">Sync to savings goal (optional)</label>
          <select id="money-fund" className="input" value={fundId} onChange={(e) => setFundId(e.target.value)}>
            <option value="">Not linked, track here only</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {fundId && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Entering an amount here will auto-add it to that goal's balance, no manual copying needed.
            </p>
          )}
        </div>
      )}
      <button className="btn btn--primary" onClick={submit} disabled={!name.trim()}>Add</button>
    </BottomSheet>
  );
}

function PeriodSheet({
  open,
  onClose,
  periods,
  currentId,
  onSelect,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  periods: BudgetPeriod[];
  currentId: string;
  onSelect: (id: string) => void;
  onCreate: (opts: {
    cadence: BudgetCadence;
    startDate: string;
    endDate?: string;
    carryBalance: boolean;
  }) => void;
}) {
  const [cadence, setCadence] = useState<BudgetCadence>("monthly");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [carryBalance, setCarryBalance] = useState(true);

  return (
    <BottomSheet open={open} title="Budget periods" onClose={onClose}>
      <div className="card" style={{ padding: "4px 16px", marginBottom: 16 }}>
        {periods.map((p) => (
          <button key={p.id} className="row" style={{ width: "100%", textAlign: "left", background: "none" }}
            onClick={() => onSelect(p.id)}>
            <div className="row__body">
              <div className="row__title">{p.label}</div>
              <div className="row__sub">
                {format(fromISO(p.startDate), "MMM d")} – {format(fromISO(p.endDate), "MMM d")}
              </div>
            </div>
            {p.id === currentId && <span className="chip chip--on">Current</span>}
          </button>
        ))}
      </div>

      <div className="field">
        <label className="field__label">Budget by</label>
        <ChipRow>
          {CADENCES.map((c) => (
            <Chip key={c.value} active={cadence === c.value} onClick={() => setCadence(c.value)}>
              {c.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="spread" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="field__label" htmlFor="period-start-date">Start date</label>
          <input id="period-start-date" className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        {cadence === "custom" && (
          <div className="field" style={{ flex: 1 }}>
            <label className="field__label" htmlFor="period-end-date">End date</label>
            <input id="period-end-date" className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        )}
      </div>

      <label className="spread" style={{ marginBottom: 16, cursor: "pointer" }}>
        <span style={{ fontWeight: 600 }}>Carry leftover balance forward</span>
        <input type="checkbox" checked={carryBalance} onChange={(e) => setCarryBalance(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
      </label>
      <p className="muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Any income or bill marked "Repeats each period" comes over automatically with actuals
        zeroed. Everything else was one-time and stays behind. No more duplicating a whole
        file each period, and no more guessing what carries over.
      </p>
      <button
        className="btn btn--primary"
        onClick={() =>
          onCreate({
            cadence,
            startDate,
            endDate: cadence === "custom" ? endDate : undefined,
            carryBalance,
          })
        }
      >
        + New period
      </button>
    </BottomSheet>
  );
}
