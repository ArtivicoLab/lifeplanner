import { create } from "zustand";
import * as db from "../lib/db";
import { newId, nowIso } from "../lib/id";
import { carryOver, summarize } from "../lib/budget";
import { cancelReminder, syncBillReminder } from "../lib/reminders";
import { useSync } from "./useSync";
import { useFunds } from "./v2";
import type { BudgetPeriod, MoneyRow } from "../lib/types";

/** A "saving" row linked to a fund auto-adjusts that fund's balance by the
    delta in `actual` — the budget line and the sinking fund never drift apart. */
function syncFundBalance(row: MoneyRow, actualDelta: number) {
  if (row.kind !== "saving" || !row.fundId || !actualDelta) return;
  const fund = useFunds.getState().items.find((f) => f.id === row.fundId);
  if (!fund) return;
  useFunds.getState().update(fund.id, { currentBalance: fund.currentBalance + actualDelta });
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
  addMoney: (patch: Partial<MoneyRow>) => void;
  updateMoney: (id: string, patch: Partial<MoneyRow>) => void;
  deleteMoney: (id: string) => void;
  /** Persists a Calendar sync result without re-triggering reminder sync (avoids a loop). */
  setCalendarEventId: (id: string, eventId: string) => void;
}

const touch = () => useSync.getState().touch();

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

    if (opts?.carryFrom && opts.carryBalance !== false && patch.startBalance === undefined) {
      const prevPeriod = get().periods.find((pp) => pp.id === opts.carryFrom);
      if (prevPeriod) {
        const prevRows = get().money.filter((m) => m.periodId === opts.carryFrom);
        p.startBalance = summarize(prevPeriod, prevRows).leftToSpend;
      }
    }

    set((s) => ({ periods: [...s.periods, p], currentPeriodId: p.id }));
    void db.put("periods", p);

    if (opts?.carryFrom) {
      const prevRows = get().money.filter((m) => m.periodId === opts.carryFrom);
      const copied = carryOver(prevRows, p.id);
      set((s) => ({ money: [...s.money, ...copied] }));
      void db.putMany("money", copied);
    }
    touch();
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
    touch();
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
      ...patch,
    };
    set((s) => ({ money: [...s.money, m] }));
    void db.put("money", m);
    syncFundBalance(m, m.actual);
    touch();
    fireReminderSync(m, true);
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
      if (patch.actual !== undefined) syncFundBalance(updated, updated.actual - prevActual);
    }
    touch();
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
    touch();
  },

  deleteMoney: (id) => {
    const existing = get().money.find((m) => m.id === id);
    set((s) => ({ money: s.money.filter((m) => m.id !== id) }));
    void db.remove("money", id);
    touch();
    if (existing?.calendarEventId) void cancelReminder(existing.calendarEventId);
  },
}));
