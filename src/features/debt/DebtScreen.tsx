import { useMemo, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Segmented } from "../../components/Segmented";
import { EmptyState } from "../../components/EmptyState";
import { CountUp } from "../../components/CountUp";
import { Columns } from "../../components/Charts";
import { HelpTip } from "../../components/HelpTip";
import { IconCard, IconChevron, IconLink, IconPlus } from "../../components/icons";
import { useDebts } from "../../stores/v2";
import { useBudget } from "../../stores/useBudget";
import { useSettings } from "../../stores/useSettings";
import { simulatePayoff, type Strategy } from "../../lib/debt";
import { money as fmtMoney, pct } from "../../lib/ui";
import type { Debt } from "../../lib/types";

/** Effective payoff order: settings.debtOrder first (for ids that still exist),
    then any debts not yet ranked, in their natural order. */
function effectiveOrder(items: Debt[], debtOrder: string[]): string[] {
  const known = debtOrder.filter((id) => items.some((d) => d.id === id));
  const rest = items.filter((d) => !known.includes(d.id)).map((d) => d.id);
  return [...known, ...rest];
}

export function DebtScreen() {
  const { items, add, update, remove } = useDebts();
  const { money } = useBudget();
  const { currency, debtStrategy, debtOrder, monthlyExtra, update: updateSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Debt | null>(null);
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  const order = useMemo(() => effectiveOrder(items, debtOrder), [items, debtOrder]);

  // Maps debtId -> every Budget "debt" line feeding it (can be more than
  // one), so a linked debt card/editor can name them directly instead of
  // leaving the connection invisible (mirrors SavingsScreen's
  // linkedFundNames — same confusion, same fix, including locking the
  // manual "Current" field and the quick payment buttons once linked so
  // there's only one write path to the balance, not two silently
  // coexisting ones).
  const linkedDebtNames = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of money) {
      if (m.kind === "debt" && m.debtId) {
        const list = map.get(m.debtId) ?? [];
        list.push(m.name || "a Budget line");
        map.set(m.debtId, list);
      }
    }
    return map;
  }, [money]);

  const result = useMemo(
    () => simulatePayoff(items, debtStrategy, monthlyExtra, order),
    [items, debtStrategy, monthlyExtra, order]
  );

  const payoffColumns = items
    .filter((d) => result.payoffMonthByDebt[d.id] !== undefined)
    .map((d) => ({ label: d.name.split(" ")[0], value: result.payoffMonthByDebt[d.id] }))
    .sort((a, b) => a.value - b.value);

  const sortedDebts = useMemo(() => {
    if (debtStrategy === "custom") {
      return [...items].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }
    return [...items].sort((a, b) =>
      debtStrategy === "snowball" ? a.currentBalance - b.currentBalance : b.apr - a.apr
    );
  }, [items, debtStrategy, order]);

  function moveInCustomOrder(id: string, dir: -1 | 1) {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    updateSettings({ debtOrder: next });
  }

  const scheduleRows = showFullSchedule ? result.schedule : result.schedule.slice(0, 12);
  const scheduleTruncated = !showFullSchedule && result.schedule.length > 12;

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Snowball · Avalanche · Custom</div>
        <h1 className="screen-head__title">
          Debt Payoff
          <HelpTip text="See your debt-free date and simulate paying it off faster. Extra money goes to one debt at a time based on your strategy. Link a Budget debt line to one of these and it pays it down automatically." />
        </h1>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconCard size={28} />} title="No debts tracked" sub="Add a debt to see your debt-free date.">
            <button className="btn btn--primary" onClick={() => { setEdit(null); setOpen(true); }}>Add a debt</button>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="card" data-tour="debt-overview">
            <div className="spread spread--top">
              <div>
                <div className="muted eyebrow-12">DEBT-FREE</div>
                <div className="big-number">{result.debtFreeLabel}</div>
                <div className="muted fs-13">
                  {Number.isFinite(result.months) ? `${result.months} months` : "Raise your payment to finish"}
                </div>
              </div>
              <div className="text-right">
                <div className="muted eyebrow-12">TOTAL OWED</div>
                <div className="debt-total-value">
                  <CountUp value={result.totalCurrent} format={(n) => fmtMoney(n, currency)} />
                </div>
                <div className="neg fs-12">
                  Interest {fmtMoney(result.totalInterest, currency)}
                </div>
              </div>
            </div>
          </div>

          {payoffColumns.length > 0 && (
            <div className="card" data-tour="debt-months-chart">
              <div className="muted eyebrow-12 mb-3" style={{ display: "flex", alignItems: "center" }}>
                MONTHS TO DEBT-FREE
                <HelpTip text="One bar per debt: how many months from today until THAT debt is paid off, projected from its current balance, APR, and minimum payment, with your strategy (Snowball, Avalanche, or Custom) deciding which debt your extra payment attacks first each month. Not a history of what you've paid, a forward projection based on where things stand right now." />
              </div>
              <Columns points={payoffColumns} height={120} color="var(--cat-teal)" />
            </div>
          )}

          <div className="card" data-tour="debt-strategy">
            <label className="field__label">
              Strategy
              <HelpTip text="Snowball pays the smallest balance first (fast wins). Avalanche pays the highest APR first (saves the most interest). Custom lets you pick the order." />
            </label>
            <Segmented
              options={[
                { value: "snowball", label: "Snowball" },
                { value: "avalanche", label: "Avalanche" },
                { value: "custom", label: "Custom" },
              ]}
              value={debtStrategy}
              onChange={(v) => updateSettings({ debtStrategy: v as Strategy })}
            />
            <div className="spread debt-extra-row">
              <label htmlFor="debt-extra-monthly" className="field__label field__label--flush">
                Extra per month
                <HelpTip text="On top of every debt's own minimum, this whole amount goes to whichever debt your strategy prioritizes. Once a debt is fully paid off, its old minimum payment doesn't just disappear, it rolls into this same pool too, so the total paid each month can be noticeably more than the sum of what's still owed in minimums." />
              </label>
              <input
                id="debt-extra-monthly"
                className="input debt-extra-input"
                type="number"
                inputMode="decimal"
                value={monthlyExtra || ""}
                onChange={(e) => updateSettings({ monthlyExtra: Number(e.target.value) || 0 })}
              />
            </div>

            {debtStrategy === "custom" && (
              <div className="mt-4">
                <div className="muted eyebrow-12 mb-2">PAYOFF ORDER</div>
                {order.map((id, i) => {
                  const d = items.find((x) => x.id === id);
                  if (!d) return null;
                  return (
                    <div key={id} className="row row--pad8">
                      <span className="muted debt-order-num">{i + 1}</span>
                      <div className="row__body"><div className="row__title row__title--sm">{d.name}</div></div>
                      <button className="muted" aria-label="Move up" disabled={i === 0}
                        onClick={() => moveInCustomOrder(id, -1)} style={{ opacity: i === 0 ? 0.3 : 1 }}>
                        <IconChevron size={16} className="ic-rotate-up" />
                      </button>
                      <button className="muted" aria-label="Move down" disabled={i === order.length - 1}
                        onClick={() => moveInCustomOrder(id, 1)} style={{ opacity: i === order.length - 1 ? 0.3 : 1 }}>
                        <IconChevron size={16} className="ic-rotate-down" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {sortedDebts.map((d) => {
            const paidPct = d.startBalance ? pct(d.startBalance - d.currentBalance, d.startBalance) : 0;
            const payoffMonth = result.payoffMonthByDebt[d.id];
            const feedingLines = linkedDebtNames.get(d.id) ?? [];
            const linked = feedingLines.length > 0;
            return (
              <div className="card" key={d.id}>
                <div className="spread">
                  <button className="debt-row-btn"
                    onClick={() => { setEdit(d); setOpen(true); }}>
                    <div className="txt-strong">{d.name}</div>
                    <div className="muted fs-12">
                      {d.apr}% APR · min {fmtMoney(d.minPayment, currency)}
                      {payoffMonth ? ` · clear in ${payoffMonth}mo` : ""}
                    </div>
                    {d.notes && (
                      <div className="muted debt-notes">{d.notes}</div>
                    )}
                    {linked && (
                      <div
                        className="muted"
                        style={{ fontSize: 11, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 3 }}
                      >
                        <IconLink size={11} aria-hidden />
                        Fed by {feedingLines.map((n) => `"${n}"`).join(", ")} in Budget
                      </div>
                    )}
                  </button>
                  <div className="text-right">
                    <div className="txt-strong-800">{fmtMoney(d.currentBalance, currency)}</div>
                    <div className="muted fs-11">of {fmtMoney(d.startBalance, currency)}</div>
                  </div>
                </div>
                <div className="pbar mt-10">
                  <div className="pbar__fill" style={{ width: `${paidPct}%`, background: "var(--success)" }} />
                </div>
                <div className="spread mt-2">
                  <span className="muted fs-12">{paidPct}% paid off</span>
                  {linked ? (
                    <span className="muted fs-11">Update the amount in Budget instead</span>
                  ) : (
                    <span className="debt-actions">
                      <button className="chip" onClick={() => update(d.id, { currentBalance: Math.max(0, d.currentBalance - d.minPayment) })}>
                        − Payment
                      </button>
                      <button className="chip" onClick={() => update(d.id, { currentBalance: d.currentBalance + 50 })}>
                        + $50
                      </button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {result.schedule.length > 0 && (
            <div className="card" data-tour="debt-schedule">
              <div className="section-title section-title--compact">
                Payment schedule
                <HelpTip text="A month-by-month projection, not a record of actual payments. Starting from every debt's current balance, it assumes you pay the minimums plus your extra every month from today forward, and shows what would be left after each month. Payment can be more than the minimums add up to: once a debt is fully paid off, its old minimum rolls into the pool attacking the next one instead of disappearing. Change a balance, APR, strategy, or the extra amount and this recalculates instantly." />
              </div>
              <div className="col-stack">
                <div className="spread muted debt-schedule__head">
                  <span className="debt-col-month">MONTH</span>
                  <span className="debt-col-amt">PAYMENT</span>
                  <span className="debt-col-amt">INTEREST</span>
                  <span className="debt-col-bal">BALANCE</span>
                </div>
                {scheduleRows.map((r) => (
                  <div key={r.month} className="spread debt-schedule__row">
                    <span className="debt-col-month">{r.label}</span>
                    <span className="debt-col-amt">{fmtMoney(r.payment, currency)}</span>
                    <span className="debt-col-amt neg">{fmtMoney(r.interest, currency)}</span>
                    <span className="debt-col-bal txt-strong">{fmtMoney(r.balance, currency)}</span>
                  </div>
                ))}
              </div>
              {scheduleTruncated && (
                <button className="btn btn--ghost mt-10"
                  onClick={() => setShowFullSchedule(true)}>
                  Show all {result.schedule.length} months
                </button>
              )}
              {showFullSchedule && result.schedule.length > 12 && (
                <button className="btn btn--ghost mt-10"
                  onClick={() => setShowFullSchedule(false)}>
                  Show fewer
                </button>
              )}
            </div>
          )}
        </>
      )}

      {items.length > 0 && (
        <button className="fab" aria-label="Add debt" onClick={() => { setEdit(null); setOpen(true); }}>
          <IconPlus />
        </button>
      )}

      <DebtSheet
        open={open}
        debt={edit}
        currency={currency}
        linkedLines={edit ? linkedDebtNames.get(edit.id) ?? [] : []}
        onClose={() => setOpen(false)}
        onSave={(patch) => { edit ? update(edit.id, patch) : add(patch); setOpen(false); }}
        onDelete={edit ? () => { remove(edit.id); setOpen(false); } : undefined}
      />
    </>
  );
}

function DebtSheet({
  open, debt, currency, linkedLines, onClose, onSave, onDelete,
}: {
  open: boolean;
  debt: Debt | null;
  currency: string;
  linkedLines: string[];
  onClose: () => void;
  onSave: (patch: Partial<Debt>) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState("");
  const [startBalance, setStart] = useState("");
  const [currentBalance, setCurrent] = useState("");
  const [apr, setApr] = useState("");
  const [minPayment, setMin] = useState("");
  const [notes, setNotes] = useState("");

  useMemo(() => {
    if (!open) return;
    setName(debt?.name ?? "");
    setStart(debt ? String(debt.startBalance) : "");
    setCurrent(debt ? String(debt.currentBalance) : "");
    setApr(debt ? String(debt.apr) : "");
    setMin(debt ? String(debt.minPayment) : "");
    setNotes(debt?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A debt auto-created from a Budget line (see addMoney()/backfillMoneyLinks()
  // in useBudget.ts/bootstrap.ts) always starts at startBalance 0 — nobody
  // told the app what's actually owed yet. If "Current" then locks
  // unconditionally the moment it's linked, there is NO path left to ever
  // enter the real balance: Budget's `actual` only ever SUBTRACTS a payment
  // delta, it can never set an absolute starting amount (confirmed
  // 2026-07-13, reported directly: "when we add debt to the budget it all
  // get[s] messed up in the debt payoff since we cant edit it there"). So:
  // still-uninitialized (startBalance 0) is a one-time exception — saving
  // "Start balance" here also sets Current to match, since there's nothing
  // real to protect yet. Once a real balance exists, it goes back to fully
  // locked as before, so a later edit to Start (fixing a typo, say) never
  // retroactively overwrites Current and erases tracked payments.
  const wasUninitialized = linkedLines.length > 0 && (debt?.startBalance ?? 0) === 0;

  function save() {
    if (!name.trim()) return;
    const start = Number(startBalance) || 0;
    onSave({
      name: name.trim(),
      startBalance: start,
      ...(linkedLines.length === 0
        ? { currentBalance: Number(currentBalance) || start }
        : wasUninitialized
        ? { currentBalance: start }
        : {}),
      apr: Number(apr) || 0,
      minPayment: Number(minPayment) || 0,
      notes: notes.trim(),
    });
  }

  return (
    <BottomSheet open={open} title={debt ? "Edit debt" : "New debt"} onClose={onClose}>
      <div className="field">
        <label className="field__label" htmlFor="debt-name">Name</label>
        <input id="debt-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Credit card" />
      </div>
      <div className="spread">
        <div className="field field--flex">
          <label className="field__label" htmlFor="debt-start-balance">Start balance ({currency})</label>
          <input
            id="debt-start-balance"
            className="input"
            type="number"
            value={startBalance}
            onChange={(e) => {
              setStart(e.target.value);
              // Uninitialized + linked: Start doubles as Current too, since
              // there's no real balance to protect yet — see save()'s comment.
              if (wasUninitialized) setCurrent(e.target.value);
            }}
            placeholder="0"
          />
        </div>
        <div className="field field--flex">
          <label className="field__label" htmlFor="debt-current-balance">Current ({currency})</label>
          <input
            id="debt-current-balance"
            className="input"
            type="number"
            value={currentBalance}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="0"
            disabled={linkedLines.length > 0 && !wasUninitialized}
          />
        </div>
      </div>
      {wasUninitialized ? (
        <p className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>
          Linked to {linkedLines.map((n) => `"${n}"`).join(", ")} in Budget, but no starting
          balance has been set yet. Enter what you actually owe in Start balance above, it'll
          also become Current. After that, Current locks and updates automatically from your
          payments in Budget.
        </p>
      ) : linkedLines.length > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>
          Linked to {linkedLines.map((n) => `"${n}"`).join(", ")} in Budget, so Current updates
          automatically from there and can't be edited directly here. Log the payment on that
          line instead.
        </p>
      )}
      <div className="spread">
        <div className="field field--flex">
          <label className="field__label" htmlFor="debt-apr">APR %</label>
          <input id="debt-apr" className="input" type="number" value={apr} onChange={(e) => setApr(e.target.value)} placeholder="0" />
        </div>
        <div className="field field--flex">
          <label className="field__label" htmlFor="debt-min-payment">Min payment ({currency})</label>
          <input id="debt-min-payment" className="input" type="number" value={minPayment} onChange={(e) => setMin(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="debt-notes">Notes</label>
        <textarea id="debt-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Autopay on the 3rd" />
      </div>
      <button className="btn btn--primary" onClick={save} disabled={!name.trim()}>{debt ? "Save" : "Add debt"}</button>
      {onDelete && <button className="btn btn--danger mt-10" onClick={onDelete}>Delete</button>}
    </BottomSheet>
  );
}
