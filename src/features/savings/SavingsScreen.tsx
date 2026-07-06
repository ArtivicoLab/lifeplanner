import { useMemo, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { EmptyState } from "../../components/EmptyState";
import { ProgressRing } from "../../components/ProgressRing";
import { CountUp } from "../../components/CountUp";
import { HelpTip } from "../../components/HelpTip";
import { Icon, IconPiggy, IconPlus, IconRepeat, PICKABLE_ICON_NAMES } from "../../components/icons";
import { useFunds } from "../../stores/v2";
import { useBudget } from "../../stores/useBudget";
import { useSettings } from "../../stores/useSettings";
import { money as fmtMoney } from "../../lib/ui";
import { fromISO, format } from "../../lib/dates";
import type { Fund } from "../../lib/types";

export function SavingsScreen() {
  const { items, add, update, remove } = useFunds();
  const { money } = useBudget();
  const { currency } = useSettings();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Fund | null>(null);

  const linkedFundIds = useMemo(
    () => new Set(money.filter((m) => m.kind === "saving" && m.fundId).map((m) => m.fundId)),
    [money]
  );

  const totals = useMemo(() => {
    const goal = items.reduce((a, f) => a + f.goalAmount, 0);
    const saved = items.reduce((a, f) => a + f.currentBalance, 0);
    const met = items.filter((f) => f.goalAmount > 0 && f.currentBalance >= f.goalAmount).length;
    return { goal, saved, left: Math.max(0, goal - saved), met };
  }, [items]);

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Sinking funds</div>
        <h1 className="screen-head__title">
          Savings
          <HelpTip text="Funds for specific things you're saving toward, tracking balance vs. goal. Link a Budget savings line to one and it updates automatically." />
        </h1>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconPiggy size={28} />} title="No funds yet" sub="Create a goal card and watch the ring fill.">
            <button className="btn btn--primary" onClick={() => { setEdit(null); setOpen(true); }}>Add a fund</button>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="card" data-tour="savings-totals">
            <div className="spread">
              <div>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>TOTAL SAVED</div>
                <div className="big-number"><CountUp value={totals.saved} format={(n) => fmtMoney(n, currency)} /></div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {fmtMoney(totals.left, currency)} to go · {fmtMoney(totals.goal, currency)} goal
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  {totals.met} of {items.length} goal{items.length === 1 ? "" : "s"} met
                </div>
              </div>
              <ProgressRing value={totals.goal ? totals.saved / totals.goal : 0} size={72} stroke={8} showPct color="var(--success)"
                ariaLabel={`${fmtMoney(totals.saved, currency)} saved of ${fmtMoney(totals.goal, currency)} goal`} />
            </div>
          </div>

          <div className="hub-grid" data-tour="savings-funds" style={{ marginTop: 12, gridTemplateColumns: "1fr 1fr" }}>
            {items.map((f) => {
              const p = f.goalAmount ? f.currentBalance / f.goalAmount : 0;
              const done = p >= 1;
              const leftToSave = Math.max(0, f.goalAmount - f.currentBalance);
              const synced = linkedFundIds.has(f.id);
              return (
                <button key={f.id} className="card" style={{ display: "block", textAlign: "center" }}
                  onClick={() => { setEdit(f); setOpen(true); }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                    <ProgressRing
                      value={p}
                      size={92}
                      stroke={9}
                      color={done ? "var(--success)" : "var(--accent)"}
                      ariaLabel={`${f.name}: ${fmtMoney(f.currentBalance, currency)} of ${fmtMoney(f.goalAmount, currency)}`}
                      center={
                        <span style={{ color: "var(--accent)" }}>
                          <Icon name={f.icon} size={22} />
                        </span>
                      }
                    />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {f.name}
                    {synced && <IconRepeat size={12} style={{ color: "var(--muted)" }} aria-label="Synced with budget" />}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {fmtMoney(f.currentBalance, currency)} / {fmtMoney(f.goalAmount, currency)}
                  </div>
                  {f.goalDate && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>
                      By {format(fromISO(f.goalDate), "MMM d, yyyy")}
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }} className={done ? "pos" : "muted"}>
                    {done
                      ? "Congratulations! Goal reached!"
                      : `Keep going! ${fmtMoney(leftToSave, currency)} away`}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {items.length > 0 && (
        <button className="fab" aria-label="Add fund" data-tour="savings-fab" onClick={() => { setEdit(null); setOpen(true); }}>
          <IconPlus />
        </button>
      )}

      <FundSheet
        open={open}
        fund={edit}
        currency={currency}
        onClose={() => setOpen(false)}
        onSave={(patch) => { edit ? update(edit.id, patch) : add(patch); setOpen(false); }}
        onDelete={edit ? () => { remove(edit.id); setOpen(false); } : undefined}
      />
    </>
  );
}

function FundSheet({
  open, fund, currency, onClose, onSave, onDelete,
}: {
  open: boolean;
  fund: Fund | null;
  currency: string;
  onClose: () => void;
  onSave: (patch: Partial<Fund>) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("piggy");
  const [goalAmount, setGoalAmount] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [goalDate, setGoalDate] = useState("");

  useMemo(() => {
    if (!open) return;
    setName(fund?.name ?? "");
    setIcon(fund?.icon ?? "piggy");
    setGoalAmount(fund ? String(fund.goalAmount) : "");
    setCurrentBalance(fund ? String(fund.currentBalance) : "");
    setGoalDate(fund?.goalDate ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <BottomSheet open={open} title={fund ? "Edit fund" : "New fund"} onClose={onClose}>
      <div className="field">
        <label className="field__label" htmlFor="fund-name">Name</label>
        <input id="fund-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vacation" />
      </div>
      <div className="field">
        <label className="field__label">Icon</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PICKABLE_ICON_NAMES.map((n) => (
            <button key={n} onClick={() => setIcon(n)} aria-label={`Select ${n} icon`}
              style={{
                width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center",
                color: icon === n ? "var(--accent)" : "var(--muted)",
                background: icon === n ? "var(--accent-soft)" : "var(--surface-2)",
                border: icon === n ? "1.5px solid var(--accent)" : "1.5px solid transparent",
              }}>
              <Icon name={n} size={20} />
            </button>
          ))}
        </div>
      </div>
      <div className="spread" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="field__label" htmlFor="fund-goal">Goal ({currency})</label>
          <input id="fund-goal" className="input" type="number" inputMode="decimal" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} placeholder="0" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="field__label" htmlFor="fund-saved">Saved ({currency})</label>
          <input id="fund-saved" className="input" type="number" inputMode="decimal" value={currentBalance} onChange={(e) => setCurrentBalance(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="fund-date">Target date</label>
        <input id="fund-date" className="input" type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} style={{ width: 180 }} />
        {goalDate && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>By {format(fromISO(goalDate), "MMM d, yyyy")}</p>}
      </div>
      <button className="btn btn--primary" disabled={!name.trim()}
        onClick={() => {
          if (!name.trim()) return;
          const balance = Number(currentBalance) || 0;
          onSave({
            name: name.trim(), icon,
            goalAmount: Number(goalAmount) || 0,
            currentBalance: balance,
            goalDate,
            // Baseline is set once at creation, then left alone on edits.
            ...(fund ? {} : { startingAmount: balance }),
          });
        }}>
        {fund ? "Save" : "Add fund"}
      </button>
      {onDelete && <button className="btn btn--danger" style={{ marginTop: 10 }} onClick={onDelete}>Delete</button>}
    </BottomSheet>
  );
}
