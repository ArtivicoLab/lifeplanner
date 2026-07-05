// Budget math (spec §6.5, §10). Pure functions — unit-tested.

import type { BudgetCadence, BudgetPeriod, MoneyRow } from "./types";
import { newId, nowIso } from "./id";
import { addDaysISO, endOfMonthISO, fromISO, format } from "./dates";

export interface BudgetSummary {
  income: number; // actual income received
  incomeBudgeted: number;
  bills: number; // actual bills paid/spent
  billsBudgeted: number;
  expenses: number; // actual expenses
  expensesBudgeted: number;
  debt: number; // actual debt payments
  debtBudgeted: number;
  savings: number; // actual savings set aside
  savingsBudgeted: number;
  budgetedOut: number; // budgeted bills+expenses+debt+savings
  actualOut: number; // actual bills+expenses+debt+savings
  startBalance: number;
  leftToBudget: number; // income budget not yet allocated
  leftToSpend: number; // money remaining this period
  overspent: boolean;
}

const sumBy = (rows: MoneyRow[], f: (m: MoneyRow) => number): number =>
  rows.reduce((acc, m) => acc + f(m), 0);

export function summarize(
  period: BudgetPeriod,
  rows: MoneyRow[]
): BudgetSummary {
  const of = (kind: MoneyRow["kind"]) => rows.filter((r) => r.kind === kind);

  const incomeBudgeted = sumBy(of("income"), (m) => m.budgeted);
  const income = sumBy(of("income"), (m) => m.actual || 0);

  const billsBudgeted = sumBy(of("bill"), (m) => m.budgeted);
  const bills = sumBy(of("bill"), (m) => m.actual || 0);
  const expensesBudgeted = sumBy(of("expense"), (m) => m.budgeted);
  const expenses = sumBy(of("expense"), (m) => m.actual || 0);
  const debtBudgeted = sumBy(of("debt"), (m) => m.budgeted);
  const debt = sumBy(of("debt"), (m) => m.actual || 0);
  const savingsBudgeted = sumBy(of("saving"), (m) => m.budgeted);
  const savings = sumBy(of("saving"), (m) => m.actual || 0);

  const budgetedOut = sumBy(
    rows.filter((r) => r.kind !== "income"),
    (m) => m.budgeted
  );
  const actualOut = bills + expenses + debt + savings;

  const startBalance = period.startBalance || 0;
  const available = startBalance + income;

  // Left to budget: income you've planned to receive, minus what you've assigned out.
  const leftToBudget = startBalance + incomeBudgeted - budgetedOut;
  // Left to spend: real money left after actual outflows.
  const leftToSpend = available - actualOut;

  return {
    income,
    incomeBudgeted,
    bills,
    billsBudgeted,
    expenses,
    expensesBudgeted,
    debt,
    debtBudgeted,
    savings,
    savingsBudgeted,
    budgetedOut,
    actualOut,
    startBalance,
    leftToBudget,
    leftToSpend,
    overspent: leftToSpend < 0,
  };
}

export interface PeriodRange {
  startDate: string;
  endDate: string;
  label: string;
}

/** Compute a period's date range + a friendly label from its cadence + start date. */
export function computePeriodRange(cadence: BudgetCadence, startDate: string): PeriodRange {
  switch (cadence) {
    case "monthly": {
      const endDate = endOfMonthISO(startDate);
      return { startDate, endDate, label: format(fromISO(startDate), "MMMM yyyy") };
    }
    case "biweekly": {
      const endDate = addDaysISO(startDate, 13);
      return { startDate, endDate, label: rangeLabel(startDate, endDate) };
    }
    case "weekly": {
      const endDate = addDaysISO(startDate, 6);
      return { startDate, endDate, label: rangeLabel(startDate, endDate) };
    }
    case "paycheck":
      return { startDate, endDate: startDate, label: `Paycheck ${format(fromISO(startDate), "MMM d")}` };
    case "custom":
    default:
      return { startDate, endDate: startDate, label: rangeLabel(startDate, startDate) };
  }
}

function rangeLabel(startDate: string, endDate: string): string {
  return `${format(fromISO(startDate), "MMM d")} – ${format(fromISO(endDate), "MMM d")}`;
}

/** A single row's over/under vs budget. Negative diff = overspent. */
export function rowDiff(m: MoneyRow): number {
  if (m.kind === "income") return (m.actual || 0) - m.budgeted;
  return m.budgeted - (m.actual || 0);
}

/**
 * Carry a period's structure into a new one with actuals zeroed (spec §6.5:
 * "kills the annual duplicate-the-file ritual"). Budgeted amounts are kept.
 */
export function carryOver(
  prevRows: MoneyRow[],
  newPeriodId: string
): MoneyRow[] {
  const ts = nowIso();
  return prevRows.map((m) => ({
    ...m,
    id: newId(),
    periodId: newPeriodId,
    actual: 0,
    paid: false,
    calendarEventId: "",
    createdAt: ts,
    updatedAt: ts,
  }));
}
