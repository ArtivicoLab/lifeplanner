import { describe, expect, it } from "vitest";
import { computeMonthStats } from "../src/lib/habitStats";
import type { Habit, HabitLogEntry } from "../src/lib/types";

function habit(p: Partial<Habit>): Habit {
  return {
    id: "h", name: "Habit", icon: "check", goalPerWeek: 7, active: true,
    order: 0, createdAt: "", updatedAt: "", ...p,
  };
}
function entry(habitId: string, date: string, done = true): HabitLogEntry {
  return { id: `${habitId}-${date}`, habitId, date, done };
}

// January 2026 has 31 days.
const MONTH = "2026-01-15";

describe("computeMonthStats", () => {
  it("computes overall done/total across active habits for every day of the month", () => {
    const habits = [habit({ id: "a" }), habit({ id: "b" })];
    const log = [entry("a", "2026-01-01"), entry("a", "2026-01-02")];
    const stats = computeMonthStats(habits, log, MONTH, () => 0);
    expect(stats.days).toHaveLength(31);
    expect(stats.overallTotal).toBe(31 * 2);
    expect(stats.overallDone).toBe(2);
  });

  it("ignores inactive habits", () => {
    const habits = [habit({ id: "a" }), habit({ id: "b", active: false })];
    const log = [entry("b", "2026-01-01")]; // logged against an inactive habit
    const stats = computeMonthStats(habits, log, MONTH, () => 0);
    expect(stats.overallTotal).toBe(31); // only habit "a" counted
    expect(stats.overallDone).toBe(0);
  });

  it("perDay reflects the fraction of active habits done that day", () => {
    const habits = [habit({ id: "a" }), habit({ id: "b" })];
    const log = [entry("a", "2026-01-05"), entry("b", "2026-01-05")];
    const stats = computeMonthStats(habits, log, MONTH, () => 0);
    const day5 = stats.perDay.find((d) => d.date === "2026-01-05")!;
    expect(day5.pct).toBe(100);
    const day6 = stats.perDay.find((d) => d.date === "2026-01-06")!;
    expect(day6.pct).toBe(0);
  });

  it("chunks the month into 7-day weeks, last week possibly shorter", () => {
    const habits = [habit({ id: "a" })];
    const stats = computeMonthStats(habits, [], MONTH, () => 0);
    // 31 days -> 5 chunks (7,7,7,7,3)
    expect(stats.perWeek).toHaveLength(5);
    expect(stats.perWeek[4].end).toBe("2026-01-31");
  });

  it("perHabit reports count/total/pct and sorts by pct descending", () => {
    const habits = [habit({ id: "a", name: "Water" }), habit({ id: "b", name: "Read" })];
    const log = [
      entry("a", "2026-01-01"), entry("a", "2026-01-02"), entry("a", "2026-01-03"),
      entry("b", "2026-01-01"),
    ];
    const stats = computeMonthStats(habits, log, MONTH, () => 0);
    expect(stats.perHabit[0].name).toBe("Water"); // 3/31 > 1/31
    expect(stats.perHabit[0].count).toBe(3);
    expect(stats.perHabit[1].name).toBe("Read");
    expect(stats.perHabit[1].count).toBe(1);
  });

  it("passes through the longestStreakEver function per habit", () => {
    const habits = [habit({ id: "a" })];
    const stats = computeMonthStats(habits, [], MONTH, (id) => (id === "a" ? 12 : 0));
    expect(stats.perHabit[0].longestStreak).toBe(12);
  });
});
