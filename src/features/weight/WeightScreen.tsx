import { useMemo, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Segmented } from "../../components/Segmented";
import { Chip, ChipRow } from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { Columns } from "../../components/Charts";
import { HelpTip } from "../../components/HelpTip";
import { IconPlus, IconScale } from "../../components/icons";
import { useWeight } from "../../stores/v2";
import { useSettings } from "../../stores/useSettings";
import { fromISO, format, todayISO } from "../../lib/dates";
import type { WeightEntry } from "../../lib/types";

function bmi(weight: number, height: number, system: "imperial" | "metric"): number {
  if (!weight || !height) return 0;
  return system === "imperial"
    ? (703 * weight) / (height * height) // lb + inches
    : weight / Math.pow(height / 100, 2); // kg + cm
}

export function WeightScreen() {
  const { items, add, remove } = useWeight();
  const { unitSystem, householdMembers, update: updateSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const participants = useMemo(
    () => [...new Set(items.map((e) => e.participant))].sort(),
    [items]
  );
  const [who, setWho] = useState<string>("");
  const active = who || participants[0] || "Me";

  const entries = useMemo(
    () => items.filter((e) => e.participant === active).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [items, active]
  );

  const latest = entries[entries.length - 1];
  const prev = entries[entries.length - 2];
  const change = latest && prev ? latest.weight - prev.weight : 0;
  const wUnit = unitSystem === "imperial" ? "lb" : "kg";

  // Most-recent-first history with day-over-day change, like a real ledger.
  const history = useMemo(() => {
    const asc = entries;
    return [...asc].reverse().map((e, i) => {
      const p = asc[asc.length - 2 - i];
      return {
        entry: e,
        change: p ? e.weight - p.weight : 0,
        bmi: e.height ? bmi(e.weight, e.height, unitSystem) : 0,
      };
    });
  }, [entries, unitSystem]);
  const historyRows = showAllHistory ? history : history.slice(0, 14);

  // Everyone at a glance — latest weight/BMI/change per participant.
  const compareRows = useMemo(() => {
    return participants.map((name) => {
      const es = items.filter((e) => e.participant === name).sort((a, b) => (a.date < b.date ? -1 : 1));
      const l = es[es.length - 1];
      const pv = es[es.length - 2];
      return {
        name,
        current: l?.weight ?? 0,
        change: l && pv ? l.weight - pv.weight : 0,
        bmi: l?.height ? bmi(l.weight, l.height, unitSystem) : 0,
        points: es.slice(-10).map((e) => ({ label: format(fromISO(e.date), "d"), value: e.weight })),
      };
    });
  }, [items, participants, unitSystem]);

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Trend & BMI</div>
        <h1 className="screen-head__title">
          Weight
          <HelpTip text="Log weight over time and see your trend, BMI, and day-over-day change. Switch units (imperial/metric) in Settings. Compare everyone in the house from one view." />
        </h1>
      </div>

      <div className="card" data-tour="weight-units" style={{ marginBottom: 12 }}>
        <Segmented
          options={[{ value: "imperial", label: "Imperial (lb)" }, { value: "metric", label: "Metric (kg)" }]}
          value={unitSystem}
          onChange={(v) => updateSettings({ unitSystem: v as typeof unitSystem })}
        />
      </div>

      {participants.length > 1 && (
        <div className="spread" style={{ margin: "0 2px 10px" }}>
          <ChipRow>
            {participants.map((p) => (
              <Chip key={p} active={!compare && active === p} onClick={() => { setWho(p); setCompare(false); }}>{p}</Chip>
            ))}
          </ChipRow>
          <button className={`chip${compare ? " chip--on" : ""}`} onClick={() => setCompare((v) => !v)}>
            Compare all
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconScale size={28} />} title="No entries yet" sub="Log your weight to see the trend and BMI.">
            <button className="btn btn--primary" onClick={() => setOpen(true)}>Add entry</button>
          </EmptyState>
        </div>
      ) : compare ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {compareRows.map((r) => (
            <div key={r.name} className="card">
              <div className="spread">
                <div>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.current.toFixed(1)} {wUnit} · BMI {r.bmi ? r.bmi.toFixed(1) : "—"}
                  </div>
                  <div className={r.change < 0 ? "pos" : r.change > 0 ? "neg" : "muted"} style={{ fontSize: 12, fontWeight: 700 }}>
                    {r.change === 0 ? "No change" : `${r.change > 0 ? "+" : ""}${r.change.toFixed(1)} ${wUnit}`}
                  </div>
                </div>
                {r.points.length > 1 && (
                  <div style={{ width: 140 }}>
                    <Columns points={r.points} height={48} color="var(--accent)" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="card">
            <div className="spread">
              <div>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>CURRENT</div>
                <div className="big-number">{latest.weight.toFixed(1)} <span style={{ fontSize: 18 }} className="muted">{wUnit}</span></div>
                <div className={change < 0 ? "pos" : change > 0 ? "neg" : "muted"} style={{ fontSize: 13, fontWeight: 700 }}>
                  {change === 0 ? "No change" : `${change > 0 ? "+" : ""}${change.toFixed(1)} ${wUnit}`}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>BMI</div>
                <div style={{ fontWeight: 800, fontSize: 26 }}>
                  {latest.height ? bmi(latest.weight, latest.height, unitSystem).toFixed(1) : "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="card" data-tour="weight-charts">
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Weight: last {Math.min(entries.length, 14)} entries
            </div>
            <Columns
              points={entries.slice(-14).map((e) => ({ label: format(fromISO(e.date), "d"), value: e.weight }))}
              color="var(--accent)"
            />
          </div>

          {entries.some((e) => e.height) && (
            <div className="card">
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>
                BMI: last {Math.min(entries.length, 14)} entries
              </div>
              <Columns
                points={entries.slice(-14).map((e) => ({
                  label: format(fromISO(e.date), "d"),
                  value: e.height ? bmi(e.weight, e.height, unitSystem) : 0,
                }))}
                color="var(--cat-teal)"
              />
            </div>
          )}

          <div className="card">
            <div className="section-title" style={{ margin: "0 0 12px" }}>History</div>
            <div className="spread muted" style={{ fontSize: 11, fontWeight: 700, padding: "0 0 6px" }}>
              <span style={{ flex: 1 }}>DATE</span>
              <span style={{ width: 70, textAlign: "right" }}>WEIGHT</span>
              <span style={{ width: 70, textAlign: "right" }}>CHANGE</span>
              <span style={{ width: 60, textAlign: "right" }}>BMI</span>
            </div>
            {historyRows.map((r) => (
              <div key={r.entry.id} className="spread" style={{ fontSize: 13, padding: "7px 0", borderTop: "1px solid var(--hairline)" }}>
                <span style={{ flex: 1 }}>{format(fromISO(r.entry.date), "MMM d, yyyy")}</span>
                <span style={{ width: 70, textAlign: "right", fontWeight: 700 }}>{r.entry.weight.toFixed(1)}</span>
                <span style={{ width: 70, textAlign: "right" }} className={r.change < 0 ? "pos" : r.change > 0 ? "neg" : "muted"}>
                  {r.change === 0 ? "—" : `${r.change > 0 ? "+" : ""}${r.change.toFixed(1)}`}
                </span>
                <span style={{ width: 60, textAlign: "right" }} className="muted">{r.bmi ? r.bmi.toFixed(1) : "—"}</span>
              </div>
            ))}
            {!showAllHistory && history.length > 14 && (
              <button className="btn btn--ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => setShowAllHistory(true)}>
                Show all {history.length} entries
              </button>
            )}
          </div>
        </>
      )}

      <button className="fab" aria-label="Add entry" data-tour="weight-fab" onClick={() => setOpen(true)}><IconPlus /></button>

      <AddWeight
        open={open}
        unit={wUnit}
        system={unitSystem}
        lastHeight={latest?.height ?? 0}
        participants={participants}
        householdMembers={householdMembers}
        onClose={() => setOpen(false)}
        onAdd={(e) => { add(e); setOpen(false); }}
      />
    </>
  );
}

function AddWeight({
  open, unit, system, lastHeight, participants, householdMembers, onClose, onAdd,
}: {
  open: boolean;
  unit: string;
  system: "imperial" | "metric";
  lastHeight: number;
  participants: string[];
  householdMembers: string[];
  onClose: () => void;
  onAdd: (e: Partial<WeightEntry>) => void;
}) {
  const [participant, setParticipant] = useState(participants[0] || "Me");
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState(lastHeight ? String(lastHeight) : "");
  const hUnit = system === "imperial" ? "in" : "cm";
  // Suggestions: household roster first, plus anyone who already has entries
  // but isn't formally on the roster (e.g. a guest).
  const suggestions = [...new Set([...householdMembers, ...participants])];

  return (
    <BottomSheet open={open} title="Log weight" onClose={onClose}>
      <div className="field">
        <label className="field__label" htmlFor="weight-who">Who</label>
        {suggestions.length > 0 && (
          <ChipRow>
            {suggestions.map((m) => (
              <Chip key={m} active={participant === m} onClick={() => setParticipant(m)}>{m}</Chip>
            ))}
          </ChipRow>
        )}
        <input id="weight-who" className="input" value={participant} onChange={(e) => setParticipant(e.target.value)} placeholder="Me" />
      </div>
      <div className="spread" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="field__label" htmlFor="weight-value">Weight ({unit})</label>
          <input id="weight-value" className="input" type="number" inputMode="decimal" autoFocus value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="field__label" htmlFor="weight-height">Height ({hUnit})</label>
          <input id="weight-height" className="input" type="number" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="weight-date">Date</label>
        <input id="weight-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 180 }} />
      </div>
      <button className="btn btn--primary" disabled={!weight}
        onClick={() => weight && onAdd({ participant: participant.trim() || "Me", date, weight: Number(weight), height: Number(height) || 0 })}>
        Add entry
      </button>
    </BottomSheet>
  );
}
