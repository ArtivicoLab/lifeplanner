// v2 module stores built on the CRUD factory, plus a couple with extra actions.
import { createCrud } from "./crud";
import * as db from "../lib/db";
import { newId, nowIso } from "../lib/id";
import { useSync } from "./useSync";
import { todayISO } from "../lib/dates";
import type {
  Debt,
  Fund,
  Goal,
  GroceryItem,
  HydrationEntry,
  Meal,
  Recipe,
  TimeBlock,
  WeightEntry,
  Workout,
} from "../lib/types";

export const useRecipes = createCrud<Recipe>("recipes", () => ({
  name: "",
  ingredients: "",
  slot: "any",
}));

export const useTimeBlocks = createCrud<TimeBlock>("timeblocks", () => ({
  date: todayISO(),
  time: "",
  item: "",
  done: false,
}));

export const useGoals = createCrud<Goal>("goals", () => ({
  title: "",
  area: "Growth",
  why: "",
  how: "",
  deadline: "",
  reward: "",
  status: "NotStarted",
  progress: 0,
  steps: [],
  cover: "target",
}));

export const useFunds = createCrud<Fund>("funds", () => ({
  name: "",
  icon: "piggy",
  goalAmount: 0,
  currentBalance: 0,
  startingAmount: 0,
  goalDate: "",
}));

export const useDebts = createCrud<Debt>("debts", () => ({
  name: "",
  startBalance: 0,
  currentBalance: 0,
  apr: 0,
  minPayment: 0,
  notes: "",
}));

export const useWorkouts = createCrud<Workout>("workouts", () => ({
  date: todayISO(),
  muscleGroup: "",
  restDay: false,
  exercise: "",
  sets: 3,
  reps: 10,
  weight: 0,
  rest: "",
  time: "",
  speed: "",
  distance: "",
  done: false,
}));

export const useWeight = createCrud<WeightEntry>("weight", () => ({
  participant: "Me",
  date: todayISO(),
  weight: 0,
  height: 0,
}));

export const useMeals = createCrud<Meal>("meals", () => ({
  date: todayISO(),
  slot: "breakfast",
  name: "",
  ingredients: "",
}));

export const useGrocery = createCrud<GroceryItem>("grocery", () => ({
  item: "",
  category: "Other",
  qty: "",
  unit: "",
  notes: "",
  checked: false,
  source: "manual",
}));

// ---- Hydration: one row per day; quick-add increments ml ----
interface HydrationState {
  items: HydrationEntry[];
  setAll: (items: HydrationEntry[]) => void;
  todayMl: () => number;
  addMl: (ml: number, date?: string) => void;
  setMl: (ml: number, date?: string) => void;
}

import { create } from "zustand";

export const useHydration = create<HydrationState>((set, get) => ({
  items: [],
  setAll: (items) => set({ items }),
  todayMl: () => get().items.find((h) => h.date === todayISO())?.ml ?? 0,
  addMl: (ml, date = todayISO()) => {
    const existing = get().items.find((h) => h.date === date);
    if (existing) {
      const updated = { ...existing, ml: Math.max(0, existing.ml + ml), updatedAt: nowIso() };
      set({ items: get().items.map((h) => (h.id === existing.id ? updated : h)) });
      void db.put("hydration", updated);
    } else {
      const entry: HydrationEntry = {
        id: newId(),
        date,
        ml: Math.max(0, ml),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      set({ items: [...get().items, entry] });
      void db.put("hydration", entry);
    }
    useSync.getState().touch();
  },
  setMl: (ml, date = todayISO()) => {
    const existing = get().items.find((h) => h.date === date);
    if (existing) {
      const updated = { ...existing, ml: Math.max(0, ml), updatedAt: nowIso() };
      set({ items: get().items.map((h) => (h.id === existing.id ? updated : h)) });
      void db.put("hydration", updated);
    } else {
      get().addMl(ml, date);
    }
    useSync.getState().touch();
  },
}));

/** Regenerate the grocery list from a set of meals (dedup by item name). */
export function generateGroceryFromMeals(meals: Meal[]) {
  const store = useGrocery.getState();
  // Remove existing meal-sourced items, keep manual ones.
  for (const g of store.items.filter((g) => g.source === "meal")) {
    store.remove(g.id);
  }
  const seen = new Set(
    store.items.filter((g) => g.source === "manual").map((g) => g.item.toLowerCase())
  );
  const items: string[] = [];
  for (const m of meals) {
    for (const raw of m.ingredients.split(/[\n,]+/)) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(name);
    }
  }
  for (const name of items) {
    store.add({ item: name, source: "meal", category: guessCategory(name) });
  }
}

// A full pantry's worth of categories — matches a spreadsheet-grade grocery
// tracker, not just a phone-app shortlist. Order = display/grouping order.
export const GROCERY_CATEGORIES = [
  "Produce",
  "Meat & Poultry",
  "Seafood",
  "Dairy",
  "Eggs",
  "Bread & Bakery",
  "Grains & Pasta",
  "Frozen Foods",
  "Condiments & Sauces",
  "Oils & Fats",
  "Spreads & Nut Butters",
  "Nuts & Seeds",
  "Beverages",
  "Snacks",
  "Household",
  "Other",
] as const;

/**
 * Guess a grocery category from a free-text item name. Checks run most- to
 * least-specific so compound phrases (e.g. "peanut butter") aren't caught by
 * a broader rule (e.g. plain "butter" → Dairy) meant for a different word.
 */
export function guessCategory(name: string): string {
  const n = name.toLowerCase();
  if (/\begg(s)?\b/.test(n)) return "Eggs";
  if (/peanut butter|almond butter|cashew butter|sunflower (seed )?butter|nutella|\bjam\b|jelly|maple syrup/.test(n))
    return "Spreads & Nut Butters";
  if (/almond|walnut|cashew|pecan|pistachio|\bpeanuts?\b|chia seed|flax\s?seed|pumpkin seed|sesame seed/.test(n))
    return "Nuts & Seeds";
  if (/milk|cheese|yogurt|butter|cream|half.and.half|sour cream/.test(n)) return "Dairy";
  if (/chicken|beef|pork|turkey|bacon|sausage|ground (beef|turkey|pork)|steak|\bham\b/.test(n))
    return "Meat & Poultry";
  if (/fish|salmon|tuna|shrimp|crab|lobster|tilapia|\bcod\b|scallop/.test(n)) return "Seafood";
  if (/frozen|ice cream/.test(n)) return "Frozen Foods";
  if (/bread|bagel|tortilla|\bbun\b|dinner roll|croissant|muffin|\bcake\b/.test(n)) return "Bread & Bakery";
  if (/\brice\b|pasta|noodle|flour|\boats?\b|cereal|quinoa|couscous|barley/.test(n)) return "Grains & Pasta";
  if (/lettuce|tomato|onion|pepper|carrot|spinach|broccoli|cucumber|potato|garlic|celery|zucchini|mushroom|\bcorn\b|cabbage|kale|veg(etable)?s?\b/.test(n))
    return "Produce";
  if (/apple|banana|berry|berries|orange|grape|lemon|lime|melon|peach|pear|mango|avocado|pineapple|\bfruit\b/.test(n))
    return "Produce";
  if (/\boil\b|olive oil|vegetable oil|coconut oil|margarine|shortening/.test(n)) return "Oils & Fats";
  if (/ketchup|mustard|\bmayo\b|mayonnaise|\bsauce\b|dressing|vinegar|salsa|soy sauce|barbecue|\bbbq\b/.test(n))
    return "Condiments & Sauces";
  if (/juice|\bsoda\b|coffee|\btea\b|\bwine\b|\bbeer\b|sparkling water/.test(n)) return "Beverages";
  if (/chips|crackers|popcorn|pretzel|granola bar|\bcookies?\b/.test(n)) return "Snacks";
  if (/paper towel|toilet paper|detergent|soap|dish\s?washing|trash bag|foil|cling wrap/.test(n)) return "Household";
  return "Other";
}
