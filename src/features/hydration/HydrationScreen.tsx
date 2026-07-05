import { useMemo } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { Columns } from "../../components/Charts";
import { HelpTip } from "../../components/HelpTip";
import { IconDroplet } from "../../components/icons";
import { useHydration } from "../../stores/v2";
import { useSettings } from "../../stores/useSettings";
import { weekDaysISO, weekdayShort, todayISO } from "../../lib/dates";

const QUICK = [250, 350, 500];

export function HydrationScreen() {
  const { items, addMl, setMl } = useHydration();
  const { hydrationGoalMl, weekStart, update } = useSettings();
  const today = todayISO();
  const todayMl = items.find((h) => h.date === today)?.ml ?? 0;
  const goal = hydrationGoalMl || 2000;

  const week = weekDaysISO(today, weekStart);
  const weekData = useMemo(
    () => week.map((d) => ({ label: weekdayShort(d)[0], value: items.find((h) => h.date === d)?.ml ?? 0 })),
    [items, week]
  );
  const avg = Math.round(
    weekData.reduce((a, d) => a + d.value, 0) / (weekData.filter((d) => d.value > 0).length || 1)
  );

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Stay topped up</div>
        <h1 className="screen-head__title">
          Hydration
          <HelpTip text="Log water intake against your daily goal. Tap a quick-add amount or enter your own, and set your goal in Settings." />
        </h1>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <ProgressRing
          value={todayMl / goal}
          size={160}
          stroke={16}
          color="var(--cat-sky)"
          ariaLabel={`${todayMl} of ${goal} ml`}
          center={
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 800 }}>{todayMl}</div>
              <div className="muted" style={{ fontSize: 12 }}>of {goal} ml</div>
            </div>
          }
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {QUICK.map((ml) => (
            <button key={ml} className="chip chip--on" onClick={() => addMl(ml)}>
              <IconDroplet size={14} /> +{ml}
            </button>
          ))}
          <button className="chip" onClick={() => addMl(-250)} disabled={todayMl <= 0}>−250</button>
        </div>
      </div>

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>This week</div>
          <span className="muted" style={{ fontSize: 13 }}>avg {avg} ml/day</span>
        </div>
        <Columns points={weekData} color="var(--cat-sky)" />
      </div>

      <div className="card">
        <div className="spread">
          <label className="field__label" htmlFor="hydration-goal" style={{ margin: 0 }}>Daily goal (ml)</label>
          <input
            id="hydration-goal"
            className="input"
            type="number"
            value={goal}
            onChange={(e) => update({ hydrationGoalMl: Number(e.target.value) || 0 })}
            style={{ width: 110, textAlign: "right" }}
          />
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button className="chip" onClick={() => setMl(0)}>Reset today</button>
        </div>
      </div>
    </>
  );
}
