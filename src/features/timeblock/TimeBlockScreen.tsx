import { useEffect, useMemo, useState } from "react";
import { Segmented } from "../../components/Segmented";
import { ProgressRing } from "../../components/ProgressRing";
import { Checkbox } from "../../components/Checkbox";
import { HelpTip } from "../../components/HelpTip";
import { IconChevron } from "../../components/icons";
import { buildAgenda, sortAgenda } from "../tasks/agenda";
import { useTasks } from "../../stores/useTasks";
import { useTimeBlocks } from "../../stores/v2";
import { useSettings } from "../../stores/useSettings";
import { addDaysISO, fromISO, format, todayISO } from "../../lib/dates";
import { routeQuery } from "../../router";

const DAY_END = 24 * 60; // slots run through the end of the day (up to 23:xx, exclusive of midnight itself)

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fmt12(hhmm: string): string {
  let [h] = hhmm.split(":").map(Number);
  const m = hhmm.split(":")[1];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function TimeBlockScreen() {
  const { tasks, recurrences } = useTasks();
  const { items, add, update, remove } = useTimeBlocks();
  const { timeblockStart, timeblockInterval, update: updateSettings } = useSettings();

  const [date, setDate] = useState(todayISO());

  // A calendar item's "open" jumps here with ?date= — land on that exact day
  // instead of always today, same pattern as Budget/CalendarScreen's openItem.
  useEffect(() => {
    const d = routeQuery().get("date");
    if (d) setDate(d);
  }, []);

  const slots = useMemo(() => {
    const out: string[] = [];
    for (let t = toMin(timeblockStart || "06:30"); t < DAY_END; t += timeblockInterval || 30) {
      out.push(toHHMM(t));
    }
    return out;
  }, [timeblockStart, timeblockInterval]);

  const dayBlocks = items.filter((b) => b.date === date);
  const blockAt = (time: string) => dayBlocks.find((b) => b.time === time);

  const dayTasks = useMemo(
    () =>
      sortAgenda(buildAgenda(tasks, recurrences, date, date))
        .filter((i) => i.date === date && !i.done)
        .map((i) => i.title),
    [tasks, recurrences, date]
  );

  const filled = dayBlocks.filter((b) => b.item.trim());
  const doneCount = filled.filter((b) => b.done).length;

  function setSlot(time: string, item: string) {
    const existing = blockAt(time);
    const val = item.trim();
    if (!val) {
      if (existing) remove(existing.id);
    } else if (existing) {
      update(existing.id, { item: val });
    } else {
      add({ date, time, item: val });
    }
  }

  function fillFromTasks() {
    let ti = 0;
    for (const time of slots) {
      if (ti >= dayTasks.length) break;
      if (blockAt(time)?.item.trim()) continue;
      const title = dayTasks[ti++];
      // skip titles already scheduled today
      if (dayBlocks.some((b) => b.item === title)) continue;
      add({ date, time, item: title });
    }
  }

  function clearDay() {
    for (const b of dayBlocks) remove(b.id);
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Plan your day, hour by hour</div>
        <h1 className="screen-head__title">
          Time Blocking
          <HelpTip text="Drop your tasks into time slots so today has an actual plan, not just a list. Set your start time and slot length in Settings." />
        </h1>
      </div>

      <div className="card spread">
        <button className="chip" aria-label="Previous day" style={{ transform: "scaleX(-1)", padding: 8 }}
          onClick={() => setDate(addDaysISO(date, -1))}><IconChevron size={16} /></button>
        <div style={{ fontWeight: 700 }}>{format(fromISO(date), "EEEE, MMM d")}</div>
        <button className="chip" aria-label="Next day" style={{ padding: 8 }}
          onClick={() => setDate(addDaysISO(date, 1))}><IconChevron size={16} /></button>
      </div>

      {/* Setup + daily ring */}
      <div className="card" data-tour="timeblock-setup">
        <div className="spread" style={{ alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field__label" htmlFor="timeblock-start">Start time</label>
              <input id="timeblock-start" className="input" type="time" value={timeblockStart}
                onChange={(e) => updateSettings({ timeblockStart: e.target.value || "06:30" })}
                style={{ width: 140 }} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field__label">Slot length</label>
              <Segmented
                options={[{ value: "15", label: "15 min" }, { value: "30", label: "30 min" }, { value: "60", label: "60 min" }]}
                value={String(timeblockInterval)}
                onChange={(v) => updateSettings({ timeblockInterval: Number(v) })}
              />
            </div>
          </div>
          <ProgressRing
            value={filled.length ? doneCount / filled.length : 0}
            size={92}
            stroke={10}
            dotted={filled.length === 0}
            ariaLabel={`${doneCount} of ${filled.length} time slots done`}
            center={
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {filled.length ? Math.round((doneCount / filled.length) * 100) : 0}%
                </div>
                <div className="muted" style={{ fontSize: 10 }}>day progress</div>
              </div>
            }
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn" style={{ flex: 1 }} data-tour="timeblock-fill" onClick={fillFromTasks} disabled={dayTasks.length === 0}>
            Fill from today's tasks
          </button>
          {dayBlocks.length > 0 && (
            <button className="btn btn--danger" style={{ flex: "none", width: "auto", padding: "15px 18px" }} onClick={clearDay}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Slots */}
      <div className="card" data-tour="timeblock-slots" style={{ padding: "4px 14px" }}>
        <datalist id="tb-tasks">
          {dayTasks.map((t) => <option key={t} value={t} />)}
        </datalist>
        {slots.map((time) => {
          const block = blockAt(time);
          return (
            <div key={time} className={`tb-slot${block?.done ? " tb-slot--done" : ""}`}>
              <span className="tb-time">{fmt12(time)}</span>
              {block?.item ? (
                <Checkbox checked={block.done} label={block.item} onChange={() => update(block.id, { done: !block.done })} />
              ) : (
                <span className="tb-dot" aria-hidden />
              )}
              <input
                key={`${time}:${block?.item ?? ""}`}
                className="tb-item"
                list="tb-tasks"
                defaultValue={block?.item ?? ""}
                placeholder="Add a block…"
                aria-label={`Task for ${fmt12(time)}`}
                onBlur={(e) => setSlot(time, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: 12, margin: "12px 2px" }}>
        Type into any slot, or pick one of today's tasks from the dropdown. Tick a block when
        it's done and the ring tracks your day. Change the start time or slot length up top.
      </p>
    </>
  );
}
