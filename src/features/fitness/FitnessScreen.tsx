import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { Checkbox } from "../../components/Checkbox";
import { Segmented } from "../../components/Segmented";
import { EmptyState } from "../../components/EmptyState";
import { HelpTip } from "../../components/HelpTip";
import { IconChevron, IconClose, IconDumbbell, IconPlus } from "../../components/icons";
import { useWorkouts } from "../../stores/v2";
import { useSettings } from "../../stores/useSettings";
import { addDaysISO, fromISO, format, todayISO, weekDaysISO } from "../../lib/dates";
import { routeQuery } from "../../router";
import type { Workout } from "../../lib/types";

const MUSCLES = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Cardio"];

// A starter exercise library per muscle group — tap to autofill the name
// field instead of typing from scratch.
const EXERCISE_SUGGESTIONS: Record<string, string[]> = {
  Chest: ["Bench Press", "Incline Dumbbell Press", "Cable Crossovers", "Push-ups", "Chest Fly", "Dips"],
  Back: ["Deadlifts", "Pull-ups", "Bent-Over Rows", "Lat Pulldowns", "Seated Cable Rows", "Face Pulls"],
  Legs: ["Squats", "Leg Press", "Leg Curls", "Leg Extensions", "Lunges", "Calf Raises"],
  Shoulders: ["Overhead Press", "Arnold Press", "Lateral Raises", "Front Raises", "Rear Delt Flyes", "Shrugs"],
  Arms: ["Dumbbell Curls", "Hammer Curls", "Tricep Dips", "Overhead Tricep Extension", "Skull Crushers", "Cable Pushdowns"],
  Core: ["Ab Rollouts", "Hanging Leg Raises", "Bicycle Crunches", "Plank", "Russian Twists", "Sit-ups"],
  Cardio: ["Cycling", "Running", "Rowing", "Jump Rope", "Stair Climber", "Elliptical"],
};

type View = "day" | "week";

export function FitnessScreen() {
  const { items, add, update, remove } = useWorkouts();
  const { weekStart } = useSettings();
  // Honor a ?date= target (e.g. a calendar quick-add's "View" jump) so the day
  // view opens on the entry instead of always defaulting to today.
  const targetDate = routeQuery().get("date");
  const [date, setDate] = useState(targetDate || todayISO());
  // Remember the Day/Week choice across reloads; a targeted date jump forces Day
  // so the entry is front and center.
  const [view, setView] = useState<View>(
    targetDate ? "day" : ((localStorage.getItem("lp.fitnessView") as View) || "day")
  );
  useEffect(() => {
    localStorage.setItem("lp.fitnessView", view);
  }, [view]);
  const [open, setOpen] = useState(false);

  const today = todayISO();
  const week = weekDaysISO(date, weekStart);

  const dayItems = items.filter((w) => w.date === date && !w.restDay);
  const restToday = items.some((w) => w.date === date && w.restDay);
  const restRow = items.find((w) => w.date === date && w.restDay);
  const doneCount = dayItems.filter((w) => w.done).length;

  const workoutDaysThisWeek = week.filter((d) => items.some((w) => w.date === d && !w.restDay)).length;
  const restDaysThisWeek = week.filter((d) => items.some((w) => w.date === d && w.restDay)).length;

  function toggleRest() {
    if (restRow) remove(restRow.id);
    else add({ date, restDay: true, exercise: "Rest day", muscleGroup: "" });
  }

  function step(dir: -1 | 1) {
    setDate(addDaysISO(date, dir * (view === "week" ? 7 : 1)));
  }

  const rangeLabel =
    view === "week"
      ? `${format(fromISO(week[0]), "MMM d")} – ${format(fromISO(week[6]), "MMM d")}`
      : format(fromISO(date), "EEEE, MMM d");

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Sets · reps · rest</div>
        <h1 className="screen-head__title">
          Fitness
          <HelpTip text="Log workouts by muscle group, with sets, reps, weight and rest, or switch to Cardio for time, speed and distance. Mark rest days so your streaks stay honest." />
        </h1>
      </div>

      <Segmented
        options={[
          { value: "day" as View, label: "Day" },
          { value: "week" as View, label: "Week" },
        ]}
        value={view}
        onChange={setView}
      />

      <div className="card spread" data-tour="fitness-nav" style={{ marginTop: 12 }}>
        <button className="chip" aria-label={view === "week" ? "Previous week" : "Previous day"}
          style={{ transform: "scaleX(-1)", padding: 8 }} onClick={() => step(-1)}>
          <IconChevron size={16} />
        </button>
        <button style={{ background: "none", textAlign: "center" }} onClick={() => setDate(today)}>
          <div style={{ fontWeight: 700 }}>{rangeLabel}</div>
          {date !== today && <div className="muted" style={{ fontSize: 11 }}>Tap for today</div>}
        </button>
        <button className="chip" aria-label={view === "week" ? "Next week" : "Next day"} style={{ padding: 8 }}
          onClick={() => step(1)}>
          <IconChevron size={16} />
        </button>
      </div>

      {view === "week" && (
        <div className="statgrid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
          <div className="stat" style={{ cursor: "default" }}>
            <span className="stat__value">{workoutDaysThisWeek}</span>
            <span className="stat__label">Workout days</span>
          </div>
          <div className="stat" style={{ cursor: "default" }}>
            <span className="stat__value">{restDaysThisWeek}</span>
            <span className="stat__label">Rest days</span>
          </div>
        </div>
      )}

      {view === "day" ? (
        <>
          <div className="spread" style={{ margin: "12px 2px" }}>
            <label className="spread" style={{ gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={restToday} onChange={toggleRest}
                style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
              <span style={{ fontWeight: 600 }}>Rest day</span>
            </label>
            {!restToday && dayItems.length > 0 && (
              <span className="muted" style={{ fontSize: 13 }}>{doneCount}/{dayItems.length} done</span>
            )}
          </div>

          {restToday ? (
            <div className="card">
              <EmptyState icon={<IconDumbbell size={28} />} title="Rest day" sub="Recovery is part of the plan. Enjoy it." />
            </div>
          ) : dayItems.length === 0 ? (
            <div className="card">
              <EmptyState icon={<IconDumbbell size={28} />} title="No exercises yet" sub="Add your first set for the day.">
                <button className="btn btn--primary" onClick={() => setOpen(true)}>Add exercise</button>
              </EmptyState>
            </div>
          ) : (
            dayItems.map((w) => <WorkoutCard key={w.id} w={w} onUpdate={(p) => update(w.id, p)} onDelete={() => remove(w.id)} />)
          )}

          {!restToday && (
            <button className="fab" aria-label="Add exercise" data-tour="fitness-fab" onClick={() => setOpen(true)}><IconPlus /></button>
          )}
        </>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "12px 4px 16px", margin: "16px -4px 0" }}>
          {week.map((d) => {
            const dExercises = items.filter((w) => w.date === d && !w.restDay);
            const dRest = items.some((w) => w.date === d && w.restDay);
            return (
              <button
                key={d}
                onClick={() => { setDate(d); setView("day"); }}
                className="card"
                style={{
                  minWidth: 130,
                  flex: "1 0 130px",
                  textAlign: "left",
                  opacity: dRest ? 0.55 : 1,
                  background: d === today ? "var(--accent-soft)" : undefined,
                }}
              >
                <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                  {format(fromISO(d), "EEE")}
                </div>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>{format(fromISO(d), "MMM d")}</div>
                {dRest ? (
                  <div className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>Rest day</div>
                ) : dExercises.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12 }}>+ Add</div>
                ) : (
                  dExercises.slice(0, 4).map((w) => (
                    <div
                      key={w.id}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--accent)",
                        background: "var(--accent-soft)",
                        borderRadius: 8,
                        padding: "3px 8px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 4,
                      }}
                    >
                      {w.exercise}
                    </div>
                  ))
                )}
                {dExercises.length > 4 && <div className="muted" style={{ fontSize: 11 }}>+{dExercises.length - 4} more</div>}
              </button>
            );
          })}
        </div>
      )}

      <AddExercise
        open={open}
        onClose={() => setOpen(false)}
        onAdd={(ex, muscle) => { add({ date, exercise: ex, muscleGroup: muscle }); setOpen(false); }}
      />
    </>
  );
}

function WorkoutCard({ w, onUpdate, onDelete }: { w: Workout; onUpdate: (p: Partial<Workout>) => void; onDelete: () => void }) {
  const isCardio = w.muscleGroup === "Cardio";
  return (
    <div className="card">
      <div className="row" style={{ padding: 0 }}>
        <Checkbox checked={w.done} onChange={() => onUpdate({ done: !w.done })} label={w.exercise} />
        <div className="row__body">
          <div className="row__title" style={{ textDecoration: w.done ? "line-through" : "none", color: w.done ? "var(--muted)" : "var(--ink)" }}>
            {w.exercise}
          </div>
          <div className="row__sub">{w.muscleGroup}</div>
        </div>
        <button className="muted" aria-label={`Delete ${w.exercise}`} onClick={onDelete}><IconClose size={16} /></button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {isCardio ? (
          <>
            <TextField label="Time" value={w.time} onChange={(v) => onUpdate({ time: v })} placeholder="30 min" />
            <TextField label="Speed" value={w.speed} onChange={(v) => onUpdate({ speed: v })} placeholder="6 mph" />
            <TextField label="Distance" value={w.distance} onChange={(v) => onUpdate({ distance: v })} placeholder="3 mi" />
          </>
        ) : (
          <>
            <NumField label="Sets" value={w.sets} onChange={(n) => onUpdate({ sets: n })} />
            <NumField label="Reps" value={w.reps} onChange={(n) => onUpdate({ reps: n })} />
            <NumField label="Weight" value={w.weight} onChange={(n) => onUpdate({ weight: n })} />
            <TextField label="Rest" value={w.rest} onChange={(v) => onUpdate({ rest: v })} placeholder="1 min" />
          </>
        )}
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ flex: "1 1 70px", textAlign: "center" }}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
      <input type="number" value={value || ""} onChange={(e) => onChange(Number(e.target.value) || 0)}
        aria-label={label}
        style={{ width: "100%", textAlign: "center", padding: "8px 4px", borderRadius: 10, background: "var(--surface-2)", border: "none", fontWeight: 700 }} />
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ flex: "1 1 70px", textAlign: "center" }}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{ width: "100%", textAlign: "center", padding: "8px 4px", borderRadius: 10, background: "var(--surface-2)", border: "none", fontWeight: 700 }} />
    </div>
  );
}

function AddExercise({ open, onClose, onAdd }: {
  open: boolean;
  onClose: () => void;
  onAdd: (ex: string, muscle: string) => void;
}) {
  const [ex, setEx] = useState("");
  const [muscle, setMuscle] = useState("Chest");

  useMemo(() => {
    if (!open) return;
    setEx("");
    setMuscle("Chest");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <BottomSheet open={open} title="Add exercise" onClose={onClose}>
      <div className="field">
        <label className="field__label">Muscle group</label>
        <ChipRow>
          {MUSCLES.map((m) => <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>{m}</Chip>)}
        </ChipRow>
      </div>
      <div className="field">
        <label className="field__label">Suggestions</label>
        <ChipRow>
          {(EXERCISE_SUGGESTIONS[muscle] ?? []).map((s) => (
            <Chip key={s} active={ex === s} onClick={() => setEx(s)}>{s}</Chip>
          ))}
        </ChipRow>
      </div>
      <div className="field">
        <label className="field__label">Exercise</label>
        <input className="input" autoFocus value={ex} onChange={(e) => setEx(e.target.value)} placeholder="e.g. Bench press" />
      </div>
      <button className="btn btn--primary" disabled={!ex.trim()} onClick={() => ex.trim() && onAdd(ex.trim(), muscle)}>Add</button>
    </BottomSheet>
  );
}
