import { useState } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { HabitGrid } from "../../components/HabitGrid";
import { EmptyState } from "../../components/EmptyState";
import { BottomSheet } from "../../components/BottomSheet";
import { Segmented } from "../../components/Segmented";
import { HelpTip } from "../../components/HelpTip";
import { confirmDialog } from "../../stores/useConfirm";
import { Icon, IconCheck, IconEdit, IconFlame, IconHabits, IconPlus, PICKABLE_ICON_NAMES } from "../../components/icons";
import { useHabits } from "../../stores/useHabits";
import { useSettings } from "../../stores/useSettings";
import { weekDaysISO, todayISO } from "../../lib/dates";
import { HabitMonthView } from "./HabitMonthView";
import type { Habit } from "../../lib/types";

type Tab = "habits" | "month";

export function HabitsScreen() {
  const { habits, log, toggle, isDone, streak, addHabit, updateHabit, archiveHabit } = useHabits();
  const { weekStart } = useSettings();
  const [tab, setTab] = useState<Tab>("habits");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("droplet");
  const [goal, setGoal] = useState(7);

  const active = habits.filter((h) => h.active).sort((a, b) => a.order - b.order);
  const week = weekDaysISO(todayISO(), weekStart);

  function openNew() {
    setEditingHabit(null);
    setName("");
    setIcon("droplet");
    setGoal(7);
    setSheetOpen(true);
  }

  function openEdit(h: Habit) {
    setEditingHabit(h);
    setName(h.name);
    setIcon(h.icon);
    setGoal(h.goalPerWeek);
    setSheetOpen(true);
  }

  function save() {
    if (!name.trim()) return;
    if (editingHabit) {
      updateHabit(editingHabit.id, { name: name.trim(), icon, goalPerWeek: goal });
    } else {
      addHabit({ name: name.trim(), icon, goalPerWeek: goal });
    }
    setSheetOpen(false);
  }

  async function removeHabit() {
    if (!editingHabit) return;
    const ok = await confirmDialog({
      title: "Delete this habit?",
      message: `"${editingHabit.name}" will be removed from your list. Its past check-ins stay in your Sheet, they just won't show here anymore.`,
      confirmLabel: "Delete habit",
      danger: true,
    });
    if (!ok) return;
    archiveHabit(editingHabit.id);
    setSheetOpen(false);
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Build consistency</div>
        <h1 className="screen-head__title">
          Habits
          <HelpTip text="Tap a day to mark a habit done. Switch to Month for the full picture: streaks, weekly rings, and a combined grid across all your habits." />
        </h1>
      </div>

      {active.length > 0 && (
        <div data-tour="habits-tabs">
          <Segmented
            options={[{ value: "habits", label: "Habits" }, { value: "month", label: "Month" }]}
            value={tab}
            onChange={(v) => setTab(v as Tab)}
          />
        </div>
      )}

      {tab === "month" && active.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <HabitMonthView />
        </div>
      ) : active.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconHabits size={28} />}
            title="No habits yet"
            sub="Start with one small daily habit. Momentum builds from there."
          >
            <button className="btn btn--primary" onClick={openNew}>
              Add your first habit
            </button>
          </EmptyState>
        </div>
      ) : (
        active.map((h) => {
          const doneDates = new Set(
            log.filter((l) => l.habitId === h.id && l.done).map((l) => l.date)
          );
          const weekDone = week.filter((d) => doneDates.has(d)).length;
          const s = streak(h.id);
          return (
            <div className="card" key={h.id}>
              <div className="spread" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span
                    style={{
                      width: 40, height: 40, borderRadius: 12, flex: "none",
                      display: "grid", placeItems: "center",
                      background: "var(--accent-soft)", color: "var(--accent)",
                    }}
                  >
                    <Icon name={h.icon} size={20} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{h.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Goal {h.goalPerWeek}×/week
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <button
                    className="muted"
                    aria-label={`Edit ${h.name}`}
                    onClick={() => openEdit(h)}
                    style={{ padding: 4 }}
                  >
                    <IconEdit size={16} />
                  </button>
                  {s > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 700 }}>
                      <IconFlame width={16} height={16} style={{ color: "#EE8A5B" }} />
                      {s}
                    </span>
                  )}
                  <ProgressRing
                    value={weekDone / h.goalPerWeek}
                    size={52}
                    stroke={6}
                    color="var(--success)"
                    ariaLabel={`${h.name}: ${weekDone} of ${h.goalPerWeek} this week`}
                    center={
                      <span style={{ fontSize: 12, fontWeight: 800 }}>
                        {weekDone}/{h.goalPerWeek}
                      </span>
                    }
                  />
                </div>
              </div>

              {/* Today — the one action someone does daily, kept big and obvious
                  rather than as one of seven equally-sized buttons. */}
              <button
                data-tour="habits-week"
                onClick={() => toggle(h.id, todayISO())}
                className="spread"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  marginBottom: 14,
                  borderRadius: 12,
                  background: isDone(h.id, todayISO()) ? "var(--success)" : "var(--surface-2)",
                  color: isDone(h.id, todayISO()) ? "#fff" : "var(--ink)",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  {isDone(h.id, todayISO()) ? "Done today" : "Mark today done"}
                </span>
                <span
                  style={{
                    width: 26, height: 26, borderRadius: 8, flex: "none",
                    display: "grid", placeItems: "center",
                    background: isDone(h.id, todayISO()) ? "rgba(255,255,255,.25)" : "var(--surface)",
                  }}
                >
                  {isDone(h.id, todayISO()) && <IconCheck size={16} />}
                </span>
              </button>

              {/* History grid — every square is one day; columns are weeks,
                  rows are weekdays (labeled on the left). Tap any square,
                  including today, to toggle that day — this is also how you
                  fix a day you missed earlier in the week. */}
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".04em" }}>
                Last 5 weeks · darker square = done
              </div>
              <HabitGrid
                doneDates={doneDates}
                weekStart={weekStart}
                showDayLabels
                cell={20}
                onTapDay={(d) => toggle(h.id, d)}
              />
            </div>
          );
        })
      )}

      {active.length > 0 && (
        <button className="fab" aria-label="Add habit" data-tour="habits-fab" onClick={openNew}>
          <IconPlus />
        </button>
      )}

      <BottomSheet open={sheetOpen} title={editingHabit ? "Edit habit" : "New habit"} onClose={() => setSheetOpen(false)}>
        <div className="field">
          <label className="field__label" htmlFor="habit-name">Name</label>
          <input
            id="habit-name"
            className="input"
            autoFocus
            placeholder="e.g. Drink water"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>
        <div className="field">
          <label className="field__label">Icon</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PICKABLE_ICON_NAMES.map((n) => (
              <button
                key={n}
                onClick={() => setIcon(n)}
                aria-label={`Select ${n} icon`}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  display: "grid",
                  placeItems: "center",
                  color: icon === n ? "var(--accent)" : "var(--muted)",
                  background: icon === n ? "var(--accent-soft)" : "var(--surface-2)",
                  border: icon === n ? "1.5px solid var(--accent)" : "1.5px solid transparent",
                }}
              >
                <Icon name={n} size={20} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="habit-goal">Weekly goal: {goal}×</label>
          <input
            id="habit-goal"
            type="range"
            min={1}
            max={7}
            value={goal}
            onChange={(e) => setGoal(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
        </div>
        <button className={`btn btn--primary${editingHabit ? " btn--stack" : ""}`} onClick={save} disabled={!name.trim()}>
          {editingHabit ? "Save changes" : "Add habit"}
        </button>
        {editingHabit && (
          <button className="btn btn--danger" onClick={removeHabit}>
            Delete habit
          </button>
        )}
      </BottomSheet>
    </>
  );
}
