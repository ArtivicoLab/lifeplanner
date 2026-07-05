import { describe, expect, it } from "vitest";
import { carryOver, computePeriodRange, rowDiff, summarize } from "../src/lib/budget";
import type { BudgetPeriod, MoneyRow } from "../src/lib/types";

const period: BudgetPeriod = {
  id: "p1",
  label: "Feb",
  cadence: "monthly",
  startDate: "2026-02-01",
  endDate: "2026-02-28",
  startBalance: 500,
  createdAt: "",
  updatedAt: "",
};

function money(p: Partial<MoneyRow>): MoneyRow {
  return {
    id: "m",
    periodId: "p1",
    kind: "expense",
    name: "x",
    category: "",
    budgeted: 0,
    actual: 0,
    dueDate: "",
    paid: false,
    remind: false,
    calendarEventId: "",
    createdAt: "",
    updatedAt: "",
    fundId: "",
    ...p,
  };
}

describe("summarize", () => {
  const rows: MoneyRow[] = [
    money({ id: "i", kind: "income", budgeted: 7000, actual: 6800 }),
    money({ id: "b", kind: "bill", budgeted: 890, actual: 690 }),
    money({ id: "e", kind: "expense", budgeted: 1600, actual: 1040 }),
    money({ id: "s", kind: "saving", budgeted: 1600, actual: 1600 }),
  ];

  it("computes left to spend from start balance + actual income - actual out", () => {
    const sum = summarize(period, rows);
    // available = 500 + 6800 = 7300; out = 690 + 1040 + 1600 = 3330
    expect(sum.leftToSpend).toBe(7300 - 3330);
    expect(sum.actualOut).toBe(3330);
    expect(sum.overspent).toBe(false);
  });

  it("left to budget uses budgeted amounts", () => {
    const sum = summarize(period, rows);
    // 500 + 7000 - (890 + 1600 + 1600) = 3410
    expect(sum.leftToBudget).toBe(500 + 7000 - (890 + 1600 + 1600));
  });

  it("flags overspend", () => {
    const sum = summarize(period, [
      money({ kind: "income", budgeted: 100, actual: 100 }),
      money({ kind: "expense", budgeted: 50, actual: 900 }),
    ]);
    expect(sum.leftToSpend).toBe(500 + 100 - 900);
    expect(sum.overspent).toBe(true);
  });
});

describe("rowDiff", () => {
  it("expense: budgeted - actual (negative = overspent)", () => {
    expect(rowDiff(money({ kind: "expense", budgeted: 100, actual: 150 }))).toBe(-50);
    expect(rowDiff(money({ kind: "expense", budgeted: 100, actual: 80 }))).toBe(20);
  });
  it("income: actual - budgeted", () => {
    expect(rowDiff(money({ kind: "income", budgeted: 100, actual: 120 }))).toBe(20);
  });
});

describe("carryOver", () => {
  it("copies structure, zeroes actuals, resets paid, new ids + period", () => {
    const prev = [
      money({ id: "a", kind: "bill", name: "Rent", budgeted: 1200, actual: 1200, paid: true }),
      money({ id: "b", kind: "income", name: "Pay", budgeted: 3000, actual: 3050 }),
    ];
    const next = carryOver(prev, "p2");
    expect(next).toHaveLength(2);
    expect(next.every((r) => r.periodId === "p2")).toBe(true);
    expect(next.every((r) => r.actual === 0)).toBe(true);
    expect(next.every((r) => r.paid === false)).toBe(true);
    expect(next.every((r) => r.id !== "a" && r.id !== "b")).toBe(true);
    expect(next[0].budgeted).toBe(1200); // budgeted preserved
    expect(next[0].name).toBe("Rent");
  });
});

describe("summarize with a debt line", () => {
  it("includes debt in actual/budgeted outflow", () => {
    const rows: MoneyRow[] = [
      money({ kind: "income", budgeted: 3000, actual: 3000 }),
      money({ kind: "debt", budgeted: 200, actual: 250 }),
    ];
    const sum = summarize(period, rows);
    expect(sum.debt).toBe(250);
    expect(sum.debtBudgeted).toBe(200);
    expect(sum.actualOut).toBe(250);
    expect(sum.budgetedOut).toBe(200);
  });
});

describe("computePeriodRange", () => {
  it("monthly spans the calendar month", () => {
    const r = computePeriodRange("monthly", "2026-02-05");
    expect(r.startDate).toBe("2026-02-05");
    expect(r.endDate).toBe("2026-02-28");
    expect(r.label).toBe("February 2026");
  });

  it("biweekly spans 14 days", () => {
    const r = computePeriodRange("biweekly", "2026-02-01");
    expect(r.endDate).toBe("2026-02-14");
  });

  it("weekly spans 7 days", () => {
    const r = computePeriodRange("weekly", "2026-02-01");
    expect(r.endDate).toBe("2026-02-07");
  });

  it("paycheck and custom default to a single-day range with a friendly label", () => {
    const paycheck = computePeriodRange("paycheck", "2026-02-01");
    expect(paycheck.endDate).toBe("2026-02-01");
    expect(paycheck.label).toContain("Paycheck");

    const custom = computePeriodRange("custom", "2026-02-01");
    expect(custom.endDate).toBe("2026-02-01");
  });
});
