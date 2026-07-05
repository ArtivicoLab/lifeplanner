// Small UI helpers shared across screens.

import type { Priority, Status } from "./types";

/** Map a category to one of the 5 signature pastel tokens (stable by hash). */
const PASTELS = [
  "var(--cat-pink)",
  "var(--cat-teal)",
  "var(--cat-lavender)",
  "var(--cat-butter)",
  "var(--cat-sky)",
];

const FIXED: Record<string, string> = {
  Home: "var(--cat-lavender)",
  Work: "var(--cat-sky)",
  Health: "var(--cat-teal)",
  Finance: "var(--cat-butter)",
  Growth: "var(--cat-pink)",
};

export function categoryColor(cat: string): string {
  if (FIXED[cat]) return FIXED[cat];
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return PASTELS[h % PASTELS.length];
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  VeryLow: "Very Low",
  Low: "Low",
  Medium: "Medium",
  High: "High",
  VeryHigh: "Very High",
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  VeryLow: "var(--cat-sky)",
  Low: "var(--success)",
  Medium: "var(--warn)",
  High: "#EE8A5B",
  VeryHigh: "var(--alert)",
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
