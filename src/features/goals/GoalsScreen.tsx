import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { ProgressRing } from "../../components/ProgressRing";
import { Checkbox } from "../../components/Checkbox";
import { HelpTip } from "../../components/HelpTip";
import { Icon, IconPlus, IconTarget, IconTrash, PICKABLE_ICON_NAMES } from "../../components/icons";
import { useGoals } from "../../stores/v2";
import { categoryColor } from "../../lib/ui";
import { dueLabel } from "../../lib/dates";
import { newId } from "../../lib/id";
import { routeQuery } from "../../router";
import type { Goal, GoalStep } from "../../lib/types";

const AREAS = ["Health", "Finance", "Career", "Growth", "Relationship"];

function stepProgress(steps: GoalStep[]): number {
  if (steps.length === 0) return 0;
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
}

export function GoalsScreen() {
  const { items, add, update, remove } = useGoals();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Goal | null>(null);

  // A calendar click or a quick-add toast's "View" jumps here with ?id= —
  // open that exact goal's editor directly instead of just landing on the list.
  useEffect(() => {
    const id = routeQuery().get("id");
    if (!id) return;
    const g = useGoals.getState().items.find((x) => x.id === id);
    if (g) {
      setEdit(g);
      setOpen(true);
    }
  }, []);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.status === "Completed" ? 1 : 0) - (b.status === "Completed" ? 1 : 0)),
    [items]
  );

  function toggleStep(goal: Goal, stepId: string) {
    const steps = (goal.steps ?? []).map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
    const progress = stepProgress(steps);
    update(goal.id, {
      steps,
      progress,
      status: progress >= 100 ? "Completed" : progress > 0 ? "InProgress" : "NotStarted",
    });
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">What · why · how</div>
        <h1 className="screen-head__title">
          Goals
          <HelpTip text="Big goals broken into a why, a how, and a checklist of steps. Check steps off and progress updates on its own." />
        </h1>
      </div>

      {sorted.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconTarget size={28} />} title="No goals yet" sub="Name what you want, why it matters, and how you'll get there.">
            <button className="btn btn--primary" onClick={() => { setEdit(null); setOpen(true); }}>Add a goal</button>
          </EmptyState>
        </div>
      ) : (
        sorted.map((g) => {
          const steps = g.steps ?? [];
          const doneSteps = steps.filter((s) => s.done).length;
          return (
            <div key={g.id} className="card" data-tour="goals-list">
              <button style={{ width: "100%", textAlign: "left", background: "none" }}
                onClick={() => { setEdit(g); setOpen(true); }}>
                <div className="spread" style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 12, minWidth: 0, flex: 1 }}>
                    <span className="goal-cover">
                      <Icon name={g.cover} size={20} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <ChipRow>
                        <Chip dotColor={categoryColor(g.area)}>{g.area}</Chip>
                        {g.deadline && <Chip>{dueLabel(g.deadline)}</Chip>}
                      </ChipRow>
                      <div style={{ fontWeight: 800, fontSize: 18, marginTop: 8 }}>{g.title}</div>
                    </div>
                  </div>
                  <ProgressRing value={g.progress / 100} size={58} stroke={7} showPct
                    color={g.status === "Completed" ? "var(--success)" : "var(--accent)"}
                    ariaLabel={`${g.title}: ${g.progress}% complete`} />
                </div>
                {g.reward && <div className="muted" style={{ fontSize: 13 }}>Reward: {g.reward}</div>}
                {g.why && <div style={{ fontSize: 13, marginTop: 6 }}><b>Why:</b> {g.why}</div>}
              </button>

              {steps.length > 0 && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    STEPS TO REACH GOAL · {doneSteps}/{steps.length}
                  </div>
                  {steps.map((st) => (
                    <div key={st.id} className={`row${st.done ? " row--done" : ""}`} style={{ padding: "5px 0" }}>
                      <Checkbox checked={st.done} onChange={() => toggleStep(g, st.id)} label={st.text} />
                      <span className="row__title" style={{ fontSize: 14 }}>{st.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {sorted.length > 0 && (
        <button className="fab" aria-label="Add goal" data-tour="goals-fab" onClick={() => { setEdit(null); setOpen(true); }}>
          <IconPlus />
        </button>
      )}

      <GoalSheet
        open={open}
        goal={edit}
        onClose={() => setOpen(false)}
        onSave={(patch) => { edit ? update(edit.id, patch) : add(patch); setOpen(false); }}
        onDelete={edit ? () => { remove(edit.id); setOpen(false); } : undefined}
      />
    </>
  );
}

function GoalSheet({
  open, goal, onClose, onSave, onDelete,
}: {
  open: boolean;
  goal: Goal | null;
  onClose: () => void;
  onSave: (patch: Partial<Goal>) => void;
  onDelete?: () => void;
}) {
  if (!open) return null;
  return <GoalSheetInner goal={goal} onClose={onClose} onSave={onSave} onDelete={onDelete} />;
}

function GoalSheetInner({
  goal, onClose, onSave, onDelete,
}: {
  goal: Goal | null;
  onClose: () => void;
  onSave: (patch: Partial<Goal>) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [area, setArea] = useState(goal?.area ?? "Growth");
  const [cover, setCover] = useState(goal?.cover ?? "target");
  const [why, setWhy] = useState(goal?.why ?? "");
  const [how, setHow] = useState(goal?.how ?? "");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [reward, setReward] = useState(goal?.reward ?? "");
  const [progress, setProgress] = useState(goal?.progress ?? 0);
  const [steps, setSteps] = useState<GoalStep[]>(goal?.steps ?? []);
  const [newStep, setNewStep] = useState("");

  const computedProgress = steps.length > 0 ? stepProgress(steps) : progress;

  function addStep() {
    const text = newStep.trim();
    if (!text) return;
    setSteps((s) => [...s, { id: newId(), text, done: false }]);
    setNewStep("");
  }
  function toggleStep(id: string) {
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, done: !st.done } : st)));
  }
  function removeStep(id: string) {
    setSteps((s) => s.filter((st) => st.id !== id));
  }

  function save() {
    if (!title.trim()) return;
    const finalProgress = steps.length > 0 ? stepProgress(steps) : progress;
    const status = finalProgress >= 100 ? "Completed" : finalProgress > 0 ? "InProgress" : "NotStarted";
    onSave({ title: title.trim(), area, cover, why, how, deadline, reward, steps, progress: finalProgress, status });
  }

  return (
    <BottomSheet open title={goal ? "Edit goal" : "New goal"} onClose={onClose}>
      <div className="field">
        <label className="field__label" htmlFor="goal-title">What do you want to achieve?</label>
        <input id="goal-title" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Run a 10K" />
      </div>

      <div className="field">
        <label className="field__label">Cover</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PICKABLE_ICON_NAMES.map((n) => (
            <button key={n} onClick={() => setCover(n)} aria-label={`Select ${n} icon as cover`}
              style={{
                width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center",
                color: cover === n ? "var(--accent)" : "var(--muted)",
                background: cover === n ? "var(--accent-soft)" : "var(--surface-2)",
                border: cover === n ? "1.5px solid var(--accent)" : "1.5px solid transparent",
              }}>
              <Icon name={n} size={18} />
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field__label">Area</label>
        <ChipRow>
          {AREAS.map((a) => (
            <Chip key={a} active={area === a} dotColor={categoryColor(a)} onClick={() => setArea(a)}>{a}</Chip>
          ))}
        </ChipRow>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="goal-why">Why it matters</label>
        <textarea id="goal-why" className="input" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Your motivation" />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="goal-how">How you'll measure success</label>
        <textarea id="goal-how" className="input" value={how} onChange={(e) => setHow(e.target.value)} placeholder="The steps / metric" />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="goal-deadline">Deadline</label>
        <input id="goal-deadline" className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ width: 180 }} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="goal-reward">Reward</label>
        <input id="goal-reward" className="input" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Treat yourself when done" />
      </div>

      <div className="field">
        <label className="field__label" id="goal-steps-label">Steps to reach goal</label>
        {steps.map((st) => (
          <div key={st.id} className="row" style={{ padding: "6px 0" }}>
            <Checkbox checked={st.done} onChange={() => toggleStep(st.id)} label={st.text} />
            <span className="row__title" style={{ flex: 1, fontSize: 14 }}>{st.text}</span>
            <button className="muted" aria-label={`Remove step "${st.text}"`} onClick={() => removeStep(st.id)}>
              <IconTrash size={15} />
            </button>
          </div>
        ))}
        <div className="spread" style={{ gap: 8, marginTop: 8 }}>
          <input className="input" value={newStep} placeholder="Add a step…"
            aria-label="Add a step"
            aria-describedby="goal-steps-label"
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStep(); } }} />
          <button className="btn btn--ghost" style={{ width: "auto", padding: "0 16px" }} onClick={addStep}>Add</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {steps.length > 0
            ? `Progress is calculated automatically from your steps (${computedProgress}%).`
            : "Add steps to auto-track progress, or set it manually below."}
        </p>
      </div>

      {steps.length === 0 && (
        <div className="field">
          <label className="field__label" htmlFor="goal-progress">Progress: {progress}%</label>
          <input id="goal-progress" type="range" min={0} max={100} step={5} value={progress}
            onChange={(e) => setProgress(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
        </div>
      )}

      <button className="btn btn--primary" onClick={save} disabled={!title.trim()}>{goal ? "Save" : "Add goal"}</button>
      {onDelete && <button className="btn btn--danger" style={{ marginTop: 10 }} onClick={onDelete}>Delete</button>}
    </BottomSheet>
  );
}
