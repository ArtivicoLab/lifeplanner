// IndexedDB persistence (spec §2 storage layer). One object store per collection,
// each keyed by `id`. `kv` store holds settings + pointers. `queue` holds offline
// sync ops for the future Sheets layer.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { DB_NAME, DB_VERSION } from "./config";
import type {
  BudgetPeriod,
  Debt,
  Fund,
  Goal,
  GroceryItem,
  Habit,
  HabitLogEntry,
  HydrationEntry,
  Meal,
  MoneyRow,
  Recipe,
  Recurrence,
  Task,
  TimeBlock,
  WeightEntry,
  Workout,
} from "./types";

export type Collection =
  | "tasks"
  | "recurrences"
  | "habits"
  | "habitLog"
  | "periods"
  | "money"
  | "goals"
  | "funds"
  | "debts"
  | "meals"
  | "grocery"
  | "workouts"
  | "weight"
  | "hydration"
  | "recipes"
  | "timeblocks";

export const ALL_COLLECTIONS: Collection[] = [
  "tasks", "recurrences", "habits", "habitLog", "periods", "money",
  "goals", "funds", "debts", "meals", "grocery", "workouts", "weight", "hydration", "recipes", "timeblocks",
];

export interface SyncOp {
  opId: string;
  tab: string;
  rowId: string;
  type: "upsert" | "delete";
  payload: unknown;
  ts: string;
}

interface LP extends DBSchema {
  tasks: { key: string; value: Task };
  recurrences: { key: string; value: Recurrence };
  habits: { key: string; value: Habit };
  habitLog: { key: string; value: HabitLogEntry };
  periods: { key: string; value: BudgetPeriod };
  money: { key: string; value: MoneyRow };
  goals: { key: string; value: Goal };
  funds: { key: string; value: Fund };
  debts: { key: string; value: Debt };
  meals: { key: string; value: Meal };
  grocery: { key: string; value: GroceryItem };
  workouts: { key: string; value: Workout };
  weight: { key: string; value: WeightEntry };
  hydration: { key: string; value: HydrationEntry };
  recipes: { key: string; value: Recipe };
  timeblocks: { key: string; value: TimeBlock };
  kv: { key: string; value: unknown };
  queue: { key: string; value: SyncOp };
}

let dbp: Promise<IDBPDatabase<LP>> | null = null;

function db(): Promise<IDBPDatabase<LP>> {
  if (!dbp) {
    dbp = openDB<LP>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        for (const name of [
          "tasks",
          "recurrences",
          "habits",
          "habitLog",
          "periods",
          "money",
          "goals",
          "funds",
          "debts",
          "meals",
          "grocery",
          "workouts",
          "weight",
          "hydration",
          "recipes",
          "timeblocks",
        ] as const) {
          if (!d.objectStoreNames.contains(name)) {
            d.createObjectStore(name, { keyPath: "id" });
          }
        }
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
        if (!d.objectStoreNames.contains("queue"))
          d.createObjectStore("queue", { keyPath: "opId" });
      },
    });
  }
  return dbp;
}

export async function all<T>(store: Collection): Promise<T[]> {
  return (await db()).getAll(store) as Promise<T[]>;
}

export async function put<T extends { id: string }>(
  store: Collection,
  value: T
): Promise<void> {
  await (await db()).put(store, value as never);
}

export async function putMany<T extends { id: string }>(
  store: Collection,
  values: T[]
): Promise<void> {
  const d = await db();
  const tx = d.transaction(store, "readwrite");
  await Promise.all([
    ...values.map((v) => tx.store.put(v as never)),
    tx.done,
  ]);
}

export async function remove(store: Collection, id: string): Promise<void> {
  await (await db()).delete(store, id);
}

export async function clearStore(store: Collection): Promise<void> {
  await (await db()).clear(store);
}

// ---- key/value (settings, pointers, flags) ----
export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await db()).get("kv", key) as Promise<T | undefined>;
}
export async function setKV(key: string, value: unknown): Promise<void> {
  await (await db()).put("kv", value, key);
}

// ---- offline sync queue ----
export async function enqueue(op: SyncOp): Promise<void> {
  await (await db()).put("queue", op);
}
export async function queued(): Promise<SyncOp[]> {
  return (await db()).getAll("queue");
}
export async function dequeue(opId: string): Promise<void> {
  await (await db()).delete("queue", opId);
}

export async function wipeAll(): Promise<void> {
  const d = await db();
  await Promise.all(
    [...ALL_COLLECTIONS, "kv", "queue"].map((s) => d.clear(s as never))
  );
}
