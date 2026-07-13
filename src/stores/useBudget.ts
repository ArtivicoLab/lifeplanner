import { create } from "zustand";
import * as db from "../lib/db";
import { newId, nowIso } from "../lib/id";
import { carryOver, summarize } from "../lib/budget";
import { cancelReminder, syncBillReminder } from "../lib/reminders";
import { useSync } from "./useSync";
import { useFunds, useDebts } from "./v2";
import type { BudgetPeriod, MoneyRow } from "../lib/types";

/** A "saving" row linked to a fund auto-adjusts that fund's balance by the
    delta in `actual` — the budget line and the sinking fund never drift apart. */
function syncFundBalance(row: MoneyRow, actualDelta: number) {
  if (row.kind !== "saving" || !row.fundId || !actualDelta) return;
  const fund = useFunds.getState().items.find((f) => f.id === row.fundId);
  if (!fund) return;
  useFunds.getState().update(fund.id, { currentBalance: fund.currentBalance + actualDelta });
}

/** A "debt" row linked to a Debt Payoff entry auto-REDUCES that debt's
    balance by the delta in `actual` — opposite direction from syncFundBalance
    above, since a debt payment pays it down instead of building it up.
    Clamped at 0 (matching Debt Payoff's own "− Payment"/"+ $50" buttons) —
    a debt can't owe less than nothing. Added 2026-07-13: before this, a
    Budget "debt" line had no connection to Debt Payoff at all. */
function syncDebtBalance(row: MoneyRow, actualDelta: number) {
  if (row.kind !== "debt" || !row.debtId || !actualDelta) return;
  const debt = useDebts.getState().items.find((d) => d.id === row.debtId);
  if (!debt) return;
  useDebts.getState().update(debt.id, { currentBalance: Math.max(0, debt.currentBalance - actualDelta) });
}

interface BudgetState {
  periods: BudgetPeriod[];
  money: MoneyRow[];
  currentPeriodId: string;
  setAll: (periods: BudgetPeriod[], money: MoneyRow[]) => void;
  setCurrent: (id: string) => void;

  addPeriod: (
    patch: Partial<BudgetPeriod>,
    opts?: { carryFrom?: string; carryBalance?: boolean }
  ) => BudgetPeriod;
  updatePeriod: (id: string, patch: Partial<BudgetPeriod>) => void;

  rowsFor: (periodId: string) => MoneyRow[];
  addMoney: (patch: Partial<MoneyRow>) => MoneyRow;
  updateMoney: (id: string, patch: Partial<MoneyRow>) => void;
  deleteMoney: (id: string) => void;
  /** Persists a Calendar sync result without re-triggering reminder sync (avoids a loop). */
  setCalendarEventId: (id: string, eventId: string) => void;
}

const touch = (collection?: "periods" | "money") => useSync.getState().touch(collection);

/** Fire-and-forget: sync the Calendar event, then persist the id via the
    loop-safe setter above (never through updateMoney/addMoney again). */
function fireReminderSync(row: MoneyRow, titleChanged: boolean) {
  void syncBillReminder(row, titleChanged).then((patch) => {
    if (!patch || patch.calendarEventId === undefined) return;
    const current = useBudget.getState().money.find((m) => m.id === row.id);
    if (!current || patch.calendarEventId === current.calendarEventId) return;
    useBudget.getState().setCalendarEventId(row.id, patch.calendarEventId);
  });
}

export const useBudget = create<BudgetState>((set, get) => ({
  periods: [],
  money: [],
  currentPeriodId: "",
  setAll: (periods, money) =>
    set({
      periods,
      money,
      currentPeriodId: get().currentPeriodId || periods[0]?.id || "",
    }),
  setCurrent: (currentPeriodId) => set({ currentPeriodId }),

  addPeriod: (patch, opts) => {
    const ts = nowIso();
    const p: BudgetPeriod = {
      id: newId(),
      label: "New period",
      cadence: "monthly",
      startDate: "",
      endDate: "",
      startBalance: 0,
      createdAt: ts,
      updatedAt: ts,
      ...patch,
    };

    const prevPeriod = opts?.carryFrom ? get().periods.find((pp) => pp.id === opts.carryFrom) : undefined;

    if (prevPeriod && opts?.carryBalance !== false && patch.startBalance === undefined) {
      const prevRows = get().money.filter((m) => m.periodId === opts?.carryFrom);
      p.startBalance = summarize(prevPeriod, prevRows).leftToSpend;
    }

    set((s) => ({ periods: [...s.periods, p], currentPeriodId: p.id }));
    void db.put("periods", p);

    if (prevPeriod) {
      const prevRows = get().money.filter((m) => m.periodId === prevPeriod.id);
      const copied = carryOver(prevRows, p.id, prevPeriod.startDate, p.startDate);
      set((s) => ({ money: [...s.money, ...copied] }));
      void db.putMany("money", copied);
      touch("money");
    }
    touch("periods");
    return p;
  },

  updatePeriod: (id, patch) => {
    let updated: BudgetPeriod | undefined;
    set((s) => ({
      periods: s.periods.map((p) => {
        if (p.id !== id) return p;
        updated = { ...p, ...patch, updatedAt: nowIso() };
        return updated;
      }),
    }));
    if (updated) void db.put("periods", updated);
    touch("periods");
  },

  rowsFor: (periodId) => get().money.filter((m) => m.periodId === periodId),

  addMoney: (patch) => {
    const ts = nowIso();
    const m: MoneyRow = {
      id: newId(),
      periodId: get().currentPeriodId,
      kind: "expense",
      name: "",
      category: "",
      budgeted: 0,
      actual: 0,
      dueDate: "",
      paid: false,
      remind: false,
      calendarEventId: "",
      createdAt: ts,
      updatedAt: ts,
      fundId: "",
      debtId: "",
      repeats: false,
      repeatsUntil: "",
      ...patch,
    };
    // Auto-create and link a matching Fund/Debt when the row didn't pick an
    // existing one — without this, a "debt"/"saving" line just sits in
    // Budget with nothing to show for it on Debt Payoff/Savings at all
    // (confirmed 2026-07-13, reported directly by a real buyer: "our first
    // user still see[s] 'No debts tracked' even when they have debt entered
    // under budget"). The dropdown in AddMoneySheet still lets someone pick
    // an ALREADY-existing Fund/Debt instead, which skips this.
    if (m.kind === "saving" && !m.fundId && m.name.trim()) {
      const fund = useFunds.getState().add({
        name: m.name.trim(), icon: "piggy", goalAmount: 0, currentBalance: 0,
        startingAmount: 0, goalDate: "",
      });
      m.fundId = fund.id;
    }
    if (m.kind === "debt" && !m.debtId && m.name.trim()) {
      const debt = useDebts.getState().add({
        name: m.name.trim(), startBalance: 0, currentBalance: 0, apr: 0,
        minPayment: m.budgeted, notes: "",
      });
      m.debtId = debt.id;
    }
    set((s) => ({ money: [...s.money, m] }));
    void db.put("money", m);
    syncFundBalance(m, m.actual);
    syncDebtBalance(m, m.actual);
    touch("money");
    fireReminderSync(m, true);
    return m;
  },

  updateMoney: (id, patch) => {
    let prev: MoneyRow | undefined;
    let updated: MoneyRow | undefined;
    let prevActual = 0;
    set((s) => ({
      money: s.money.map((m) => {
        if (m.id !== id) return m;
        prev = m;
        prevActual = m.actual;
        updated = { ...m, ...patch, updatedAt: nowIso() };
        return updated;
      }),
    }));
    if (updated) {
      void db.put("money", updated);
      if (patch.actual !== undefined) {
        syncFundBalance(updated, updated.actual - prevActual);
        syncDebtBalance(updated, updated.actual - prevActual);
      }
    }
    touch("money");
    // Only touch the Calendar API when a reminder-relevant field actually
    // changed — marking a bill paid (or any other incidental edit) must
    // never re-request the calendar.events scope, which can surface a real
    // Google consent popup out of nowhere.
    const remindRelevant =
      patch.remind !== undefined || patch.dueDate !== undefined || patch.name !== undefined;
    if (updated && prev && remindRelevant) {
      const nameOrDateChanged =
        (patch.name !== undefined && patch.name !== prev.name) ||
        (patch.dueDate !== undefined && patch.dueDate !== prev.dueDate);
      fireReminderSync(updated, nameOrDateChanged);
    }
  },

  setCalendarEventId: (id, eventId) => {
    let updated: MoneyRow | undefined;
    set((s) => ({
      money: s.money.map((m) => {
        if (m.id !== id) return m;
        updated = { ...m, calendarEventId: eventId, updatedAt: nowIso() };
        return updated;
      }),
    }));
    if (updated) void db.put("money", updated);
    touch("money");
  },

  deleteMoney: (id) => {
    const existing = get().money.find((m) => m.id === id);
    set((s) => ({ money: s.money.filter((m) => m.id !== id) }));
    void db.remove("money", id);
    touch("money");
    if (existing?.calendarEventId) void cancelReminder(existing.calendarEventId);
  },
}));
