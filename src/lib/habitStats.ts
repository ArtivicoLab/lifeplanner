// Pure month-analytics math for the Habits "Month" view — overall %, per-week
// rings, daily trend, and a per-habit stats table. No store/React here.

import { daysInMonthISO } from "./dates";
import type { Habit, HabitLogEntry } from "./types";

export interface DayStat {
  date: string;
  pct: number; // 0..100
  label: string; // day-of-month number as string
}

export interface WeekStat {
  label: string;
  pct: number;
  start: string;
  end: string;
}

export interface HabitStat {
  habitId: string;
  name: string;
  icon: string;
  count: number;
  total: number;
  pct: number;
  longestStreak: number;
}

export interface MonthStats {
  days: string[];
  perDay: DayStat[];
  perWeek: WeekStat[];
  overallDone: number;
  overallTotal: number;
  overallPct: number;
  perHabit: HabitStat[];
}

export function computeMonthStats(
  habits: Habit[],
  log: HabitLogEntry[],
  monthIso: string,
  longestStreakEver: (habitId: string) => number
): MonthStats {
  const active = habits.filter((h) => h.active);
  const days = daysInMonthISO(monthIso);

  const doneSet = new Set(log.filter((l) => l.done).map((l) => `${l.habitId}|${l.date}`));
  const isDone = (habitId: string, date: string) => doneSet.has(`${habitId}|${date}`);

  const perDay: DayStat[] = days.map((date) => {
    const done = active.filter((h) => isDone(h.id, date)).length;
    return {
      date,
      pct: active.length ? Math.round((done / active.length) * 100) : 0,
      label: String(Number(date.slice(8))),
    };
  });

  const perWeek: WeekStat[] = [];
  for (let i = 0; i < perDay.length; i += 7) {
    const chunk = perDay.slice(i, i + 7);
    const avg = chunk.length ? Math.round(chunk.reduce((a, d) => a + d.pct, 0) / chunk.length) : 0;
    perWeek.push({
      label: `Week ${perWeek.length + 1}`,
      pct: avg,
      start: chunk[0].date,
      end: chunk[chunk.length - 1].date,
    });
  }

  const overallDone = active.reduce((a, h) => a + days.filter((d) => isDone(h.id, d)).length, 0);
  const overallTotal = active.length * days.length;

  const perHabit: HabitStat[] = active
    .map((h) => {
      const count = days.filter((d) => isDone(h.id, d)).length;
      return {
        habitId: h.id,
        name: h.name,
        icon: h.icon,
        count,
        total: days.length,
        pct: days.length ? Math.round((count / days.length) * 100) : 0,
        longestStreak: longestStreakEver(h.id),
      };
    })
    .sort((a, b) => b.pct - a.pct);

  return {
    days,
    perDay,
    perWeek,
    overallDone,
    overallTotal,
    overallPct: overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0,
    perHabit,
  };
}
