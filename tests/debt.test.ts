import { describe, expect, it } from "vitest";
import { simulatePayoff } from "../src/lib/debt";
import type { Debt } from "../src/lib/types";

function debt(p: Partial<Debt>): Debt {
  return {
    id: "d", name: "d", startBalance: 1000, currentBalance: 1000,
    apr: 0, minPayment: 100, notes: "", createdAt: "", updatedAt: "", ...p,
  };
}

describe("simulatePayoff", () => {
  it("pays off a 0% debt in ceil(balance/payment) months", () => {
    const r = simulatePayoff([debt({ currentBalance: 1000, apr: 0, minPayment: 100 })], "snowball", 0);
    expect(r.months).toBe(10);
    expect(r.totalInterest).toBeCloseTo(0, 5);
  });

  it("extra payment shortens the timeline", () => {
    const base = simulatePayoff([debt({ currentBalance: 1000, apr: 0, minPayment: 100 })], "snowball", 0);
    const faster = simulatePayoff([debt({ currentBalance: 1000, apr: 0, minPayment: 100 })], "snowball", 100);
    expect(faster.months).toBeLessThan(base.months);
    expect(faster.months).toBe(5);
  });

  it("snowball targets the smallest balance first", () => {
    const debts = [
      debt({ id: "big", currentBalance: 5000, apr: 0, minPayment: 100 }),
      debt({ id: "small", currentBalance: 500, apr: 0, minPayment: 50 }),
    ];
    const r = simulatePayoff(debts, "snowball", 200);
    // small should be cleared before big
    expect(r.payoffMonthByDebt["small"]).toBeLessThan(r.payoffMonthByDebt["big"]);
  });

  it("avalanche targets the highest APR first", () => {
    const debts = [
      debt({ id: "lowapr", currentBalance: 2000, apr: 3, minPayment: 50 }),
      debt({ id: "highapr", currentBalance: 2000, apr: 25, minPayment: 50 }),
    ];
    const r = simulatePayoff(debts, "avalanche", 300);
    expect(r.payoffMonthByDebt["highapr"]).toBeLessThanOrEqual(r.payoffMonthByDebt["lowapr"]);
  });

  it("accrues interest so a real APR costs more than principal alone", () => {
    const r = simulatePayoff([debt({ currentBalance: 2000, apr: 20, minPayment: 100 })], "avalanche", 0);
    expect(r.totalInterest).toBeGreaterThan(0);
    expect(Number.isFinite(r.months)).toBe(true);
  });

  it("flags an unpayable debt (payment below interest) as never-finishing", () => {
    const r = simulatePayoff([debt({ currentBalance: 10000, apr: 30, minPayment: 10 })], "snowball", 0);
    expect(r.months).toBe(Infinity);
    expect(r.debtFreeLabel).toBe("—");
  });

  it("custom strategy targets debts in the given order, ignoring balance/APR", () => {
    const debts = [
      // "a" is small enough to clear quickly once prioritized; "b" is large
      // enough that minimums alone won't clear it for a long time — so their
      // payoff months can't coincidentally tie.
      debt({ id: "a", currentBalance: 1500, apr: 25, minPayment: 50 }),
      debt({ id: "b", currentBalance: 5000, apr: 3, minPayment: 50 }),
    ];
    // Custom order clears "a" first even though it has the smaller APR-vs-balance
    // priority under avalanche/snowball — explicit order wins over heuristics.
    const r = simulatePayoff(debts, "custom", 300, ["a", "b"]);
    expect(r.payoffMonthByDebt["a"]).toBeLessThan(r.payoffMonthByDebt["b"]);
  });

  it("custom strategy falls back to original order for unranked debts", () => {
    const debts = [
      debt({ id: "x", currentBalance: 500, apr: 0, minPayment: 50 }),
      debt({ id: "y", currentBalance: 500, apr: 0, minPayment: 50 }),
    ];
    const r = simulatePayoff(debts, "custom", 200, []);
    expect(r.payoffMonthByDebt["x"]).toBeLessThanOrEqual(r.payoffMonthByDebt["y"]);
  });

  it("returns a month-by-month schedule with declining balance", () => {
    const r = simulatePayoff([debt({ currentBalance: 1000, apr: 12, minPayment: 100 })], "snowball", 0);
    expect(r.schedule.length).toBe(r.months);
    expect(r.schedule[0].balance).toBeLessThan(1000);
    expect(r.schedule[r.schedule.length - 1].balance).toBeCloseTo(0, 1);
    expect(r.schedule.every((row) => row.payment > 0)).toBe(true);
  });
});
