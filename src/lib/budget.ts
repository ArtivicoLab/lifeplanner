// Budget math (spec §6.5, §10). Pure functions — unit-tested.

import type { BudgetCadence, BudgetPeriod, MoneyRow } from "./types";
import { newId, nowIso } from "./id";
import { addDaysISO, daysBetween, endOfMonthISO, fromISO, format } from "./dates";

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

/**
 * Converts an amount from a given budget cadence to its monthly equivalent —
 * needed because Debt Payoff's `simulatePayoff()` (debt.ts) treats a Debt's
 * `minPayment` as strictly monthly (interest compounds once per loop
 * iteration = one month), but a Budget row's `budgeted`/`actual` amount is
 * only ever "per THIS period," whatever cadence that period happens to be.
 * Auto-linking a "debt" row straight to `minPayment` without this (confirmed
 * 2026-07-13, reported directly: "the current balance in debt payoff is the
 * monthly payment in budget or weekly it depends") silently fed a WEEKLY
 * $50 payment into the simulation as a MONTHLY $50 minimum — understating
 * the real monthly equivalent (~$217) by more than 4x, so the projected
 * payoff date and interest were both badly wrong with no error or warning.
 * Monthly/biweekly/weekly have fixed, well-known annual occurrence counts,
 * so the conversion is exact. "paycheck" and "custom" do NOT — a paycheck
 * period is stored as a single placeholder day (see computePeriodRange
 * above), so there is no reliable length to convert from; those two pass
 * the amount through unchanged rather than guess.
 */
export function toMonthlyAmount(amount: number, cadence: BudgetCadence): number {
  switch (cadence) {
    case "monthly": return amount;
    // Rounded to cents — 26/12 and 52/12 don't divide evenly, and an
    // unrounded result (e.g. $216.66666666666666) reads as a display bug the
    // moment anyone opens the auto-created debt, even though the math itself
    // is correct.
    case "biweekly": return Math.round(((amount * 26) / 12) * 100) / 100;
    case "weekly": return Math.round(((amount * 52) / 12) * 100) / 100;
    case "paycheck":
    case "custom":
    default:
      return amount;
  }
}

/** A single row's over/under vs budget. Negative diff = overspent. */
export function rowDiff(m: MoneyRow): number {
  if (m.kind === "income") return (m.actual || 0) - m.budgeted;
  return m.budgeted - (m.actual || 0);
}

/**
 * Carry ONLY the rows marked `repeats: true` into a new period, actuals
 * zeroed (spec §6.5: "kills the annual duplicate-the-file ritual"). Budgeted
 * amounts are kept. A one-time bonus or a single medical bill (repeats:
 * false) is correctly left behind — it was never supposed to come back.
 * This replaced an earlier all-or-nothing "copy budget structure" toggle
 * that carried every row with no way to say "this one repeats, that one
 * doesn't" (confirmed confusing: "not straightforward if the paycheck gets
 * repeated or not," 2026-07-13).
 *
 * Two more correctness pieces:
 * - `repeatsUntil`, if set, stops the carry once the NEW period starts after
 *   it — "repeats" alone was an all-or-nothing forever switch with no way to
 *   represent something that repeats but ends (a car loan with 8 payments
 *   left, a subscription ending in December).
 * - `dueDate` is SHIFTED to land the same number of days into the new
 *   period as it was into the old one, not copied verbatim — copying it
 *   verbatim (the original bug) left a carried-over bill still due on last
 *   period's date, showing on the wrong day (or a day already in the past)
 *   on the calendar.
 */
export function carryOver(
  prevRows: MoneyRow[],
  newPeriodId: string,
  prevPeriodStart: string,
  newPeriodStart: string
): MoneyRow[] {
  const ts = nowIso();
  return prevRows
    .filter((m) => m.repeats && (!m.repeatsUntil || newPeriodStart <= m.repeatsUntil))
    .map((m) => ({
      ...m,
      id: newId(),
      periodId: newPeriodId,
      dueDate: m.dueDate ? addDaysISO(newPeriodStart, daysBetween(prevPeriodStart, m.dueDate)) : m.dueDate,
      actual: 0,
      paid: false,
      calendarEventId: "",
      createdAt: ts,
      updatedAt: ts,
    }));
}
