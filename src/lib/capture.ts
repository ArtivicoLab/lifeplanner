// Calendar quick-capture: classify free text typed into a day cell and route
// it to the right domain store (Task/Habit/Goal/Fund/Debt/Meal/Grocery/
// Workout/Weight/Hydration/Money) instead of always creating a Task.
import type { LucideIcon } from "lucide-react";
import {
  IconTasks,
  IconHabits,
  IconTarget,
  IconPiggy,
  IconCard,
  IconMeal,
  IconCart,
  IconDumbbell,
  IconScale,
  IconDroplet,
} from "../components/icons";
import { useTasks } from "../stores/useTasks";
import { useHabits } from "../stores/useHabits";
import { useBudget } from "../stores/useBudget";
import {
  useGoals,
  useFunds,
  useDebts,
  useMeals,
  useGrocery,
  useWorkouts,
  useWeight,
  useHydration,
  guessCategory,
} from "../stores/v2";

export type CaptureDomain =
  | "task"
  | "habit"
  | "goal"
  | "fund"
  | "debt"
  | "meal"
  | "grocery"
  | "workout"
  | "weight"
  | "hydration"
  | "money";

export interface ParsedCapture {
  domain: CaptureDomain;
  title: string;
  amount?: number;
  confidence: "prefix" | "keyword" | "default";
}

export type CommitResult = { ok: true } | { ok: false; reason: "needs-amount" };

export const CAPTURE_DOMAINS: CaptureDomain[] = [
  "task", "habit", "goal", "fund", "debt", "meal",
  "grocery", "workout", "weight", "hydration", "money",
];

export const DOMAIN_META: Record<CaptureDomain, { label: string; icon: LucideIcon; color: string }> = {
  task: { label: "Task", icon: IconTasks, color: "var(--cat-sky)" },
  habit: { label: "Habit", icon: IconHabits, color: "var(--cat-teal)" },
  goal: { label: "Goal", icon: IconTarget, color: "var(--cat-pink)" },
  fund: { label: "Fund", icon: IconPiggy, color: "var(--cat-teal)" },
  debt: { label: "Debt", icon: IconCard, color: "var(--cat-pink)" },
  meal: { label: "Meal", icon: IconMeal, color: "var(--cat-butter)" },
  grocery: { label: "Grocery", icon: IconCart, color: "var(--cat-sky)" },
  workout: { label: "Workout", icon: IconDumbbell, color: "var(--cat-lavender)" },
  weight: { label: "Weight", icon: IconScale, color: "var(--cat-teal)" },
  hydration: { label: "Water", icon: IconDroplet, color: "var(--cat-sky)" },
  money: { label: "Bill", icon: IconCard, color: "var(--cat-butter)" },
};

// Explicit shorthand prefixes, e.g. "goal: save $500". Checked before any
// keyword guessing so a deliberate prefix always wins.
const PREFIXES: Record<string, CaptureDomain> = {
  goal: "goal", dream: "goal",
  habit: "habit",
  fund: "fund", save: "fund", saving: "fund",
  debt: "debt", owe: "debt",
  meal: "meal", eat: "meal",
  grocery: "grocery", buy: "grocery",
  workout: "workout", exercise: "workout", gym: "workout",
  weight: "weight",
  water: "hydration", hydration: "hydration",
  bill: "money", expense: "money", income: "money",
};

const PREFIX_RE = /^\s*([a-zA-Z]+)\s*:\s*(.*)$/;

// Unprefixed fallback guesses — deliberately restricted to domains with no
// financial or health stakes. Never guess into debt/fund/weight/hydration
// without an explicit prefix; those default to a plain Task instead.
const KEYWORD_RULES: { re: RegExp; domain: CaptureDomain }[] = [
  { re: /\b(workout|gym|reps?|sets?)\b/i, domain: "workout" },
  { re: /\b(milk|eggs?|groceries?)\b/i, domain: "grocery" },
  { re: /\b(dinner|lunch|breakfast|meal prep)\b/i, domain: "meal" },
  { re: /\b(habit|every day|daily)\b/i, domain: "habit" },
];

const AMOUNT_RE = /\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:lbs?|kg|ml|oz)\b|^(\d+(?:\.\d+)?)$/i;

export function extractAmount(text: string): number | undefined {
  const m = text.match(AMOUNT_RE);
  if (!m) return undefined;
  const n = Number(m[1] ?? m[2] ?? m[3]);
  return Number.isFinite(n) ? n : undefined;
}

export function parseCapture(text: string): ParsedCapture {
  const raw = text.trim();
  const prefixMatch = raw.match(PREFIX_RE);
  if (prefixMatch) {
    const domain = PREFIXES[prefixMatch[1].toLowerCase()];
    if (domain) {
      const title = prefixMatch[2].trim();
      return { domain, title, amount: extractAmount(title), confidence: "prefix" };
    }
  }
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(raw)) {
      return { domain: rule.domain, title: raw, amount: extractAmount(raw), confidence: "keyword" };
    }
  }
  return { domain: "task", title: raw, amount: extractAmount(raw), confidence: "default" };
}

export function commitCapture(
  parsed: ParsedCapture,
  date: string,
  domainOverride?: CaptureDomain,
  overrideAmount?: number,
  overrideCategory?: string
): CommitResult {
  const domain = domainOverride ?? parsed.domain;
  const title = parsed.title;
  const amount = overrideAmount ?? parsed.amount;

  switch (domain) {
    case "task":
      useTasks.getState().addTask({ title, dueDate: date, category: overrideCategory || "Home" });
      return { ok: true };
    case "goal":
      useGoals.getState().add({ title, deadline: date });
      return { ok: true };
    case "fund":
      useFunds.getState().add({ name: title, goalDate: date });
      return { ok: true };
    case "debt":
      useDebts.getState().add({ name: title });
      return { ok: true };
    case "meal":
      useMeals.getState().add({ name: title, date });
      return { ok: true };
    case "grocery":
      useGrocery.getState().add({ item: title, category: guessCategory(title), source: "manual" });
      return { ok: true };
    case "workout":
      useWorkouts.getState().add({ exercise: title, date });
      return { ok: true };
    case "money":
      useBudget.getState().addMoney({ name: title, kind: "bill", dueDate: date, budgeted: amount ?? 0 });
      return { ok: true };
    case "habit": {
      const key = title.toLowerCase();
      const existing = useHabits.getState().habits.find((h) => {
        const hn = h.name.toLowerCase().trim();
        if (!hn) return false;
        return hn === key || (hn.length >= 3 && (hn.includes(key) || key.includes(hn)));
      });
      if (existing) {
        useHabits.getState().toggle(existing.id, date);
      } else {
        useHabits.getState().addHabit({ name: title });
        const habits = useHabits.getState().habits;
        const created = habits[habits.length - 1];
        if (created) useHabits.getState().toggle(created.id, date);
      }
      return { ok: true };
    }
    case "weight":
      if (amount == null) return { ok: false, reason: "needs-amount" };
      useWeight.getState().add({ date, weight: amount });
      return { ok: true };
    case "hydration":
      if (amount == null) return { ok: false, reason: "needs-amount" };
      useHydration.getState().addMl(amount, date);
      return { ok: true };
    default: {
      const _exhaustive: never = domain;
      return _exhaustive;
    }
  }
}
