import { useMemo } from "react";
import { useTasks } from "../stores/useTasks";
import { useGoals } from "../stores/v2";
import { useBudget } from "../stores/useBudget";
import { todayISO } from "./dates";
import { computeDueToday, type DueTodayBreakdown } from "./dueToday";

/** Live "what's due today" breakdown, kept in sync with the underlying
    stores — see dueToday.ts's doc comment for why this is one shared hook
    instead of every consumer computing its own count. */
export function useDueToday(): DueTodayBreakdown {
  const { tasks, recurrences } = useTasks();
  const { items: goals } = useGoals();
  const { money } = useBudget();
  return useMemo(
    () => computeDueToday(tasks, recurrences, goals, money, todayISO()),
    [tasks, recurrences, goals, money]
  );
}
