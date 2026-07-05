import { create } from "zustand";
import * as db from "../lib/db";
import { newId, nowIso } from "../lib/id";
import { todayISO, weekDaysISO, daysBetween } from "../lib/dates";
import { useSync } from "./useSync";
import type { Habit, HabitLogEntry } from "../lib/types";

interface HabitsState {
  habits: Habit[];
  log: HabitLogEntry[];
  setAll: (habits: Habit[], log: HabitLogEntry[]) => void;

  addHabit: (patch: Partial<Habit>) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  archiveHabit: (id: string) => void;

  isDone: (habitId: string, date: string) => boolean;
  toggle: (habitId: string, date: string) => void;

  streak: (habitId: string, ref?: string) => number;
  weekCount: (habitId: string, weekStart: 0 | 1, ref?: string) => number;
  /** Longest-ever run of consecutive done days (all-time, not just current streak). */
  longestStreakEver: (habitId: string) => number;
}

const touch = () => useSync.getState().touch();

export const useHabits = create<HabitsState>((set, get) => ({
  habits: [],
  log: [],
  setAll: (habits, log) => set({ habits, log }),

  addHabit: (patch) => {
    const ts = nowIso();
    const order = get().habits.length;
    const h: Habit = {
      id: newId(),
      name: "",
      icon: "check",
      goalPerWeek: 7,
      active: true,
      order,
      createdAt: ts,
      updatedAt: ts,
      ...patch,
    };
    set((s) => ({ habits: [...s.habits, h] }));
    void db.put("habits", h);
    touch();
  },

  updateHabit: (id, patch) => {
    let updated: Habit | undefined;
    set((s) => ({
      habits: s.habits.map((h) => {
        if (h.id !== id) return h;
        updated = { ...h, ...patch, updatedAt: nowIso() };
        return updated;
      }),
    }));
    if (updated) void db.put("habits", updated);
    touch();
  },

  archiveHabit: (id) => get().updateHabit(id, { active: false }),

  isDone: (habitId, date) =>
    get().log.some((l) => l.habitId === habitId && l.date === date && l.done),

  toggle: (habitId, date) => {
    const existing = get().log.find(
      (l) => l.habitId === habitId && l.date === date
    );
    if (existing) {
      const updated = { ...existing, done: !existing.done };
      set((s) => ({
        log: s.log.map((l) => (l.id === existing.id ? updated : l)),
      }));
      void db.put("habitLog", updated);
    } else {
      const entry: HabitLogEntry = {
        id: newId(),
        habitId,
        date,
        done: true,
      };
      set((s) => ({ log: [...s.log, entry] }));
      void db.put("habitLog", entry);
    }
    touch();
  },

  streak: (habitId, ref = todayISO()) => {
    let count = 0;
    for (let i = 0; i < 365; i++) {
      const date = daysBetween(ref, ref) === 0 ? offset(ref, -i) : offset(ref, -i);
      if (get().isDone(habitId, date)) count++;
      else break;
    }
    return count;
  },

  weekCount: (habitId, weekStart, ref = todayISO()) => {
    const days = weekDaysISO(ref, weekStart);
    return days.filter((d) => get().isDone(habitId, d)).length;
  },

  longestStreakEver: (habitId) => {
    const dates = get()
      .log.filter((l) => l.habitId === habitId && l.done)
      .map((l) => l.date)
      .sort();
    if (dates.length === 0) return 0;
    let longest = 1;
    let current = 1;
    for (let i = 1; i < dates.length; i++) {
      const gap = daysBetween(dates[i - 1], dates[i]);
      if (gap === 1) {
        current++;
        longest = Math.max(longest, current);
      } else if (gap !== 0) {
        current = 1;
      }
    }
    return longest;
  },
}));

function offset(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}
