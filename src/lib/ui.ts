// Small UI helpers shared across screens.

import type { Priority, Status } from "./types";
import { useSettings } from "../stores/useSettings";

const FIXED: Record<string, string> = {
  Home: "var(--cat-lavender)",
  Work: "var(--cat-sky)",
  Health: "var(--cat-teal)",
  Finance: "var(--cat-butter)",
  Growth: "var(--cat-pink)",
};

// A separate pool for user-created categories, distinct from the 5 tokens
// FIXED already claims — otherwise every custom category is guaranteed to
// hash onto a color one of the 5 defaults already uses (5 buckets, 5
// defaults = 100% collision), making it visually indistinguishable from an
// existing category.
const EXTENDED_PASTELS = [
  "var(--cat-mint)",
  "var(--cat-rose)",
  "var(--cat-gold)",
  "var(--cat-plum)",
  "var(--cat-steel)",
  "var(--cat-clay)",
];

// All swatch tokens are pickable for any category — used by the Settings
// color-tag picker. Order matches FIXED then EXTENDED_PASTELS.
export const PICKABLE_CATEGORY_COLORS = [
  "var(--cat-lavender)", "var(--cat-sky)", "var(--cat-teal)", "var(--cat-butter)", "var(--cat-pink)",
  "var(--cat-mint)", "var(--cat-rose)", "var(--cat-gold)", "var(--cat-plum)", "var(--cat-steel)", "var(--cat-clay)",
];

export function categoryColor(cat: string): string {
  const picked = useSettings.getState().categoryColors[cat];
  if (picked) return picked;
  if (FIXED[cat]) return FIXED[cat];
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return EXTENDED_PASTELS[h % EXTENDED_PASTELS.length];
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  VeryLow: "Very Low",
  Low: "Low",
  Medium: "Medium",
  High: "High",
  VeryHigh: "Very High",
};

// Own dedicated ramp — these used to reuse --cat-sky/--success/--warn/--alert
// directly, which made a priority chip pixel-identical to a category or
// status chip shown in the very same filter row (see tokens.css).
export const PRIORITY_COLOR: Record<Priority, string> = {
  VeryLow: "var(--pri-verylow)",
  Low: "var(--pri-low)",
  Medium: "var(--pri-medium)",
  High: "var(--pri-high)",
  VeryHigh: "var(--pri-veryhigh)",
};

export const STATUS_LABEL: Record<Status, string> = {
  Completed: "Completed",
  Delayed: "Delayed",
  OnHold: "On Hold",
  Pending: "Pending",
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Cancelled: "Cancelled",
};

export const STATUS_COLOR: Record<Status, string> = {
  Completed: "var(--success)", // green
  Delayed: "var(--warn)", // amber
  OnHold: "var(--accent-2)", // periwinkle
  Pending: "#e487a9", // rose pink
  NotStarted: "#aeb6c7", // slate
  InProgress: "#8e7be6", // violet
  Cancelled: "var(--alert)", // red
};

export function money(n: number, symbol = "$"): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${symbol}${abs.toLocaleString(undefined, {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Human label for a recurrence frequency string. */
export function frequencyLabel(freq: string): string {
  switch (freq) {
    case "daily": return "Every day";
    case "weekly": return "Every week";
    case "biweekly": return "Every 2 weeks";
    case "monthly": return "Every month";
    case "yearly": return "Every year";
    default: {
      const [name, n] = freq.split(":");
      if (name === "every_n_weeks") return `Every ${n} weeks`;
      if (name === "every_n_months") return `Every ${n} months`;
      return freq;
    }
  }
}
