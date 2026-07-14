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

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.453592;

/** Height formatted for its OWN unit system — feet+inches for imperial
    (e.g. 68 in → 5'8"), plain cm for metric. */
function formatHeight(height: number, system: "imperial" | "metric"): string {
  if (!height) return "";
  if (system === "imperial") {
    const ft = Math.floor(height / 12);
    const inch = Math.round(height % 12);
    return `${ft}'${inch}"`;
  }
  return `${Math.round(height)} cm`;
}

/** Same height, expressed in the OTHER unit system — so an imperial user
    also sees cm (and a metric user also sees feet/inches) without having to
    do the conversion themselves. Reported directly, 2026-07-14: "we can
    also tell them what it is in cm." */
function heightInOtherUnit(height: number, system: "imperial" | "metric"): string {
  if (!height) return "";
  return system === "imperial"
    ? `${Math.round(height * CM_PER_IN)} cm`
    : formatHeight(height / CM_PER_IN, "imperial");
}

/** Weight in the other unit system — lb ↔ kg. */
function weightInOtherUnit(weight: number, system: "imperial" | "metric"): string {
  if (!weight) return "";
  return system === "imperial"
    ? `${(weight * KG_PER_LB).toFixed(1)} kg`
    : `${(weight / KG_PER_LB).toFixed(1)} lb`;
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
                    {r.current.toFixed(1)} {wUnit} ({weightInOtherUnit(r.current, unitSystem)}) · BMI {r.bmi ? r.bmi.toFixed(1) : "—"}
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
          <div className="card" data-tour="weight-current">
            <div className="spread">
              <div>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>CURRENT</div>
                <div className="big-number">{latest.weight.toFixed(1)} <span style={{ fontSize: 18 }} className="muted">{wUnit}</span></div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {weightInOtherUnit(latest.weight, unitSystem)}
                  {latest.height ? ` · ${formatHeight(latest.height, unitSystem)} (${heightInOtherUnit(latest.height, unitSystem)})` : ""}
                </div>
                <div className={change < 0 ? "pos" : change > 0 ? "neg" : "muted"} style={{ fontSize: 13, fontWeight: 700 }}>
                  {change === 0 ? "No change" : `${change > 0 ? "+" : ""}${change.toFixed(1)} ${wUnit}`}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                  BMI
                  <HelpTip text="BMI (Body Mass Index) estimates whether your weight fits your height, using just those two numbers, nothing else to measure or track. That makes it useful for watching your own trend move over time, not as a single verdict on its own. Rough ranges: under 18.5 underweight, 18.5-24.9 typical, 25-29.9 above typical, 30+ well above typical. It doesn't account for muscle or build, so treat it as a screening number, not the full picture. Log a height to see it." />
                </div>
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
            <div className="card" data-tour="weight-bmi">
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

          <div className="card" data-tour="weight-history">
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
  // Metric height is a single cm field. Imperial height used to ALSO be a
  // single field (raw total inches, e.g. type "68" for 5'8") — technically
  // correct but nobody thinks in total inches; reported directly,
  // 2026-07-14: "it should be in feets and inches too let the user choose."
  // So imperial gets its own feet + inches pair instead, combined into the
  // same total-inches number WeightEntry.height already stores (no schema
  // change — this is purely how the number gets typed in).
  const [heightCm, setHeightCm] = useState(system === "metric" && lastHeight ? String(lastHeight) : "");
  const [feet, setFeet] = useState(system === "imperial" && lastHeight ? String(Math.floor(lastHeight / 12)) : "");
  const [inches, setInches] = useState(system === "imperial" && lastHeight ? String(Math.round(lastHeight % 12)) : "");
  const heightValue = system === "imperial"
    ? (Number(feet) || 0) * 12 + (Number(inches) || 0)
    : Number(heightCm) || 0;
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
      <div className="field">
        <label className="field__label" htmlFor="weight-value">Weight ({unit})</label>
        <input id="weight-value" className="input" type="number" inputMode="decimal" autoFocus value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0" />
        {!!Number(weight) && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>= {weightInOtherUnit(Number(weight), system)}</div>
        )}
      </div>
      <div className="field">
        <label className="field__label">Height</label>
        {system === "imperial" ? (
          <div className="spread" style={{ gap: 12 }}>
            <input aria-label="Height (feet)" className="input" type="number" inputMode="numeric"
              value={feet} onChange={(e) => setFeet(e.target.value)} placeholder="5" />
            <span className="muted" style={{ alignSelf: "center" }}>ft</span>
            <input aria-label="Height (inches)" className="input" type="number" inputMode="numeric"
              value={inches} onChange={(e) => setInches(e.target.value)} placeholder="8" />
            <span className="muted" style={{ alignSelf: "center" }}>in</span>
          </div>
        ) : (
          <input aria-label="Height (cm)" className="input" type="number" inputMode="decimal"
            value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="0" />
        )}
        {!!heightValue && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            = {heightInOtherUnit(heightValue, system)}
          </div>
        )}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="weight-date">Date</label>
        <input id="weight-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 180 }} />
      </div>
      <button className="btn btn--primary" disabled={!weight}
        onClick={() => weight && onAdd({ participant: participant.trim() || "Me", date, weight: Number(weight), height: heightValue })}>
        Add entry
      </button>
    </BottomSheet>
  );
}
