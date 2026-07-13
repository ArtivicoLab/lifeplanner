import { describe, expect, it } from "vitest";
import {
  moneyToRow,
  rowToMoney,
  rowToTask,
  taskToRow,
  rowToRecurrence,
  recurrenceToRow,
  goalToRow,
  rowToGoal,
  debtToRow,
  rowToDebt,
} from "../src/lib/schema";
import type { Debt, Goal, MoneyRow, Recurrence, Task } from "../src/lib/types";

describe("schema serialize -> deserialize roundtrip", () => {
  it("Task roundtrips", () => {
    const t: Task = {
      id: "t1",
      title: "Buy milk",
      notes: "2%",
      category: "Home",
      priority: "High",
      status: "InProgress",
      assignee: "Alice",
      dueDate: "2026-07-04",
      recurrenceId: "r9",
      occurrenceDate: "2026-07-04",
      remind: true,
      calendarEventId: "evt1",
      completedAt: "",
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-02T00:00:00Z",
    };
    expect(rowToTask(taskToRow(t))).toEqual(t);
  });

  it("Recurrence roundtrips incl. boolean fields", () => {
    const r: Recurrence = {
      id: "r1",
      title: "Water plants",
      notes: "",
      category: "Home",
      priority: "Low",
      assignee: "Bob",
      frequency: "every_n_weeks:3",
      anchorDate: "2026-01-01",
      endDate: "2026-12-31",
      remind: false,
      active: true,
      createdAt: "a",
      updatedAt: "b",
    };
    expect(rowToRecurrence(recurrenceToRow(r))).toEqual(r);
  });

  it("Money roundtrips numbers + booleans", () => {
    const m: MoneyRow = {
      id: "m1",
      periodId: "p1",
      kind: "bill",
      name: "Electric",
      category: "Utilities",
      budgeted: 60,
      actual: 72.5,
      dueDate: "2026-07-15",
      paid: false,
      remind: true,
      calendarEventId: "",
      createdAt: "a",
      updatedAt: "b",
      fundId: "",
      debtId: "",
      repeats: true,
      repeatsUntil: "2026-12-15",
    };
    expect(rowToMoney(moneyToRow(m))).toEqual(m);
  });

  it("tolerates blank/short rows without throwing", () => {
    expect(() => rowToTask([])).not.toThrow();
    expect(rowToTask([]).priority).toBe("Medium");
  });

  it("Goal roundtrips including its packed steps checklist", () => {
    const g: Goal = {
      id: "g1",
      title: "Run a 10K",
      area: "Health",
      why: "Feel stronger",
      how: "3 runs/week",
      deadline: "2026-09-01",
      reward: "New shoes",
      status: "InProgress",
      progress: 40,
      steps: [
        { id: "s1", text: "Buy shoes", done: true },
        { id: "s2", text: "Run a 5K test, with a comma", done: false },
      ],
      cover: "run",
      createdAt: "a",
      updatedAt: "b",
    };
    expect(rowToGoal(goalToRow(g))).toEqual(g);
  });

  it("Goal with no steps roundtrips to an empty array", () => {
    const g: Goal = {
      id: "g2", title: "x", area: "Growth", why: "", how: "", deadline: "",
      reward: "", status: "NotStarted", progress: 0, steps: [], cover: "target",
      createdAt: "a", updatedAt: "b",
    };
    expect(rowToGoal(goalToRow(g)).steps).toEqual([]);
  });

  it("packed steps never contain a raw ASCII control character", () => {
    // Google Sheets does not reliably preserve real control chars (0x1E/0x1F)
    // in a cell value — they get silently stripped on the way in, which once
    // concatenated every step's id/text/done together with nothing between
    // them (confirmed 2026-07-13 from an actual synced Sheet). This test
    // fails loudly if the delimiter ever regresses back to a real control
    // char instead of the printable Unicode "control picture" glyphs.
    const g: Goal = {
      id: "g3", title: "x", area: "Growth", why: "", how: "", deadline: "",
      reward: "", status: "NotStarted", progress: 0, cover: "target",
      steps: [
        { id: "s1", text: "First step", done: true },
        { id: "s2", text: "Second step", done: false },
      ],
      createdAt: "a", updatedAt: "b",
    };
    const stepsCell = goalToRow(g)[11];
    for (let i = 0; i < stepsCell.length; i++) {
      expect(stepsCell.codePointAt(i)).toBeGreaterThanOrEqual(32);
    }
    expect(rowToGoal(goalToRow(g))).toEqual(g);
  });

  it("Debt roundtrips including notes", () => {
    const d: Debt = {
      id: "d1", name: "Credit card", startBalance: 4000, currentBalance: 2400,
      apr: 19.9, minPayment: 80, notes: "Autopay on the 3rd",
      createdAt: "a", updatedAt: "b",
    };
    expect(rowToDebt(debtToRow(d))).toEqual(d);
  });
});
