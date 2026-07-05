// Debt payoff simulation (snowball / avalanche / custom order). Pure + testable.
import type { Debt } from "./types";
import { addMonthsISO, todayISO, format, fromISO } from "./dates";

export type Strategy = "snowball" | "avalanche" | "custom";

export interface ScheduleRow {
  month: number; // 1-based
  label: string; // e.g. "Aug 2026"
  payment: number; // total paid across all debts this month
  interest: number; // total interest accrued this month
  balance: number; // total remaining balance after this month's payment
}

export interface PayoffResult {
  months: number; // months to debt-free (Infinity if never with this budget)
  debtFreeDate: string; // ISO ("" if never)
  debtFreeLabel: string;
  totalInterest: number;
  totalStart: number;
  totalCurrent: number;
  payoffMonthByDebt: Record<string, number>; // debtId -> month index paid off
  schedule: ScheduleRow[]; // month-by-month amortization (capped at 600 months)
}

/**
 * Order debts by payoff priority. "custom" ranks by position in `customOrder`
 * (a list of debt ids); any debt not present falls to the end, in its
 * original relative order.
 */
function priorityOrder(debts: Debt[], strategy: Strategy, customOrder: string[] = []): Debt[] {
  const active = debts.filter((d) => d.currentBalance > 0.005);
  if (strategy === "custom") {
    const rank = new Map(customOrder.map((id, i) => [id, i]));
    return [...active].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  }
  return [...active].sort((a, b) =>
    strategy === "snowball"
      ? a.currentBalance - b.currentBalance
      : b.apr - a.apr
  );
}

export function simulatePayoff(
  debts: Debt[],
  strategy: Strategy,
  monthlyExtra: number,
  customOrder: string[] = []
): PayoffResult {
  const totalStart = debts.reduce((a, d) => a + d.startBalance, 0);
  const totalCurrent = debts.reduce((a, d) => a + d.currentBalance, 0);
  const bal = new Map(debts.map((d) => [d.id, d.currentBalance]));
  const meta = new Map(debts.map((d) => [d.id, d]));
  const payoffMonthByDebt: Record<string, number> = {};
  const schedule: ScheduleRow[] = [];

  const totalMin = debts.reduce((a, d) => a + d.minPayment, 0);
  const budget = totalMin + Math.max(0, monthlyExtra);

  let totalInterest = 0;
  let month = 0;
  const MAX = 600;

  const anyLeft = () => [...bal.values()].some((b) => b > 0.005);

  while (anyLeft() && month < MAX) {
    month++;
    let monthInterest = 0;
    let monthPaid = 0;

    // 1) accrue interest
    for (const [id, b] of bal) {
      if (b <= 0.005) continue;
      const apr = meta.get(id)!.apr;
      const interest = (b * apr) / 1200;
      monthInterest += interest;
      totalInterest += interest;
      bal.set(id, b + interest);
    }
    // 2) pay minimums
    let available = budget;
    for (const [id, b] of bal) {
      if (b <= 0.005) continue;
      const pay = Math.min(b, meta.get(id)!.minPayment);
      bal.set(id, b - pay);
      monthPaid += pay;
      available -= pay;
    }
    // 3) throw the rest at the priority debt(s)
    for (const d of priorityOrder(
      [...meta.values()].map((m) => ({ ...m, currentBalance: bal.get(m.id)! })),
      strategy,
      customOrder
    )) {
      if (available <= 0.005) break;
      const b = bal.get(d.id)!;
      if (b <= 0.005) continue;
      const pay = Math.min(b, available);
      bal.set(d.id, b - pay);
      monthPaid += pay;
      available -= pay;
    }
    // 4) record newly-cleared debts
    for (const [id, b] of bal) {
      if (b <= 0.005 && payoffMonthByDebt[id] === undefined && (meta.get(id)!.currentBalance > 0)) {
        payoffMonthByDebt[id] = month;
      }
    }

    const balance = [...bal.values()].reduce((a, b) => a + Math.max(0, b), 0);
    schedule.push({
      month,
      label: format(fromISO(addMonthsISO(todayISO(), month)), "MMM yyyy"),
      payment: monthPaid,
      interest: monthInterest,
      balance,
    });

    // Guard: if budget can't cover interest, we'll never finish.
    if (month >= MAX) break;
  }

  const finished = !anyLeft();
  const months = finished ? month : Infinity;
  const debtFreeDate = finished ? addMonthsISO(todayISO(), month) : "";
  const debtFreeLabel = finished ? format(fromISO(debtFreeDate), "MMM yyyy") : "—";

  return {
    months,
    debtFreeDate,
    debtFreeLabel,
    totalInterest,
    totalStart,
    totalCurrent,
    payoffMonthByDebt,
    schedule,
  };
}
