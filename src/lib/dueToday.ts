// One shared "what's due today, broken down by section" calculation — used by
// the Sidebar/TabBar nav badge, the browser-tab title/favicon badge
// (components/TabNotifier.tsx), and the Dashboard's per-section badges.
// Kept in ONE place instead of four call sites computing their own count so
// the nav badge's total and each section's own number can never drift out of
// sync with each other — see CLAUDE.md's own history of bugs that shipped
// exactly because the same "which rows count as due" logic got duplicated
// and one copy fell out of date with another.
import { dueCountOn } from "../features/tasks/agenda";
import type { Goal, MoneyRow, Recurrence, Task } from "./types";

export interface DueTodayBreakdown {
  tasks: number;
  goals: number;
  bills: number;
  total: number;
}

export function computeDueToday(
  tasks: Task[],
  recurrences: Recurrence[],
  goals: Goal[],
  money: MoneyRow[],
  date: string
): DueTodayBreakdown {
  const taskCount = dueCountOn(tasks, recurrences, date);
  const goalCount = goals.filter((g) => g.deadline === date && g.status !== "Completed").length;
  const billCount = money.filter((m) => m.kind === "bill" && m.dueDate === date && !m.paid).length;
  return {
    tasks: taskCount,
    goals: goalCount,
    bills: billCount,
    total: taskCount + goalCount + billCount,
  };
}
