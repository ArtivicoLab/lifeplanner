import { useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { Segmented } from "../../components/Segmented";
import { IconChevron, IconMeal } from "../../components/icons";
import { EmptyState } from "../../components/EmptyState";
import { HelpTip } from "../../components/HelpTip";
import { useMeals, useGrocery, useRecipes, generateGroceryFromMeals } from "../../stores/v2";
import { useSettings } from "../../stores/useSettings";
import { addDaysISO, fromISO, format, todayISO, weekDaysISO } from "../../lib/dates";
import { navigate } from "../../router";
import type { Meal, MealSlot, Recipe } from "../../lib/types";

const SLOTS: { key: MealSlot; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
];

type View = "day" | "week";
interface EditTarget {
  date: string;
  slot: MealSlot;
}

export function MealsScreen() {
  const { items, add, update, remove } = useMeals();
  const grocery = useGrocery();
  const recipes = useRecipes().items;
  const { weekStart } = useSettings();
  const [date, setDate] = useState(todayISO());
  const [view, setView] = useState<View>("day");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const today = todayISO();
  const week = weekDaysISO(date, weekStart); // the 7 ISO dates of the week containing `date`
  // Auto-generated list is scoped to THIS week's meals — not every meal ever
  // entered — so it never drags in ingredients from bygone weeks.
  const weekMeals = items.filter((m) => week.includes(m.date));

  const mealFor = (d: string, slot: MealSlot) => items.find((m) => m.date === d && m.slot === slot);

  const editingMeal = editTarget ? mealFor(editTarget.date, editTarget.slot) : undefined;

  function step(dir: -1 | 1) {
    setDate(addDaysISO(date, dir * (view === "week" ? 7 : 1)));
  }

  const rangeLabel =
    view === "week"
      ? `${format(fromISO(week[0]), "MMM d")} – ${format(fromISO(week[6]), "MMM d")}`
      : format(fromISO(date), "EEEE, MMM d");

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Plan & shop</div>
        <h1 className="screen-head__title">
          Meals
          <HelpTip text="Plan what you're eating by day or by week, using recipes from Meal Setup. Ingredients flow straight into your Grocery list, scoped to the week you're viewing." />
        </h1>
      </div>

      <Segmented
        options={[
          { value: "day" as View, label: "Day" },
          { value: "week" as View, label: "Week" },
        ]}
        value={view}
        onChange={setView}
      />

      <div className="card spread" style={{ marginTop: 12 }}>
        <button className="chip" aria-label={view === "week" ? "Previous week" : "Previous day"}
          style={{ transform: "scaleX(-1)", padding: 8 }} onClick={() => step(-1)}>
          <IconChevron size={16} />
        </button>
        <button style={{ background: "none", textAlign: "center" }} onClick={() => setDate(today)}>
          <div style={{ fontWeight: 700 }}>{rangeLabel}</div>
          {date !== today && <div className="muted" style={{ fontSize: 11 }}>Tap for today</div>}
        </button>
        <button className="chip" aria-label={view === "week" ? "Next week" : "Next day"} style={{ padding: 8 }}
          onClick={() => step(1)}>
          <IconChevron size={16} />
        </button>
      </div>

      {view === "day" ? (
        SLOTS.map(({ key, label }) => {
          const meal = mealFor(date, key);
          return (
            <button key={key} className="card" style={{ width: "100%", textAlign: "left" }}
              onClick={() => setEditTarget({ date, slot: key })}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
              {meal ? (
                <>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{meal.name}</div>
                  {meal.ingredients && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{meal.ingredients}</div>}
                </>
              ) : (
                <div className="muted" style={{ marginTop: 4 }}>+ Add a meal</div>
              )}
            </button>
          );
        })
      ) : (
        <div className="card" style={{ padding: 12, overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(7, minmax(120px, 1fr))`, gap: 8, minWidth: 840 }}>
            {week.map((d) => (
              <div key={d} className="muted" style={{ fontSize: 11, fontWeight: 700, textAlign: "center", padding: "0 0 4px" }}>
                <div style={{ textTransform: "uppercase" }}>{format(fromISO(d), "EEE")}</div>
                <div style={{ color: d === today ? "var(--accent)" : undefined, fontSize: 13, fontWeight: 800 }}>
                  {format(fromISO(d), "MMM d")}
                </div>
              </div>
            ))}
            {SLOTS.map(({ key, label }) =>
              week.map((d) => {
                const meal = mealFor(d, key);
                return (
                  <button
                    key={`${d}-${key}`}
                    onClick={() => setEditTarget({ date: d, slot: key })}
                    style={{
                      background: d === today ? "var(--accent-soft)" : "var(--surface-2)",
                      borderRadius: 10,
                      padding: "8px 8px",
                      minHeight: 62,
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <span className="muted" style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>{label}</span>
                    {meal ? (
                      <span style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {meal.name}
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>+ Add</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      <button className="btn btn--primary" style={{ marginTop: 16 }}
        onClick={() => { generateGroceryFromMeals(weekMeals); navigate("grocery"); }}>
        Generate grocery list from this week ({weekMeals.length} meal{weekMeals.length === 1 ? "" : "s"} · {grocery.items.length} items)
      </button>

      {items.length === 0 && (
        <div style={{ marginTop: 8 }}>
          <EmptyState icon={<IconMeal size={28} />} title="Plan your week" sub="Add meals, then auto-build a categorized shopping list." />
        </div>
      )}

      <MealSheet
        open={editTarget !== null}
        slot={editTarget?.slot ?? null}
        meal={editingMeal}
        recipes={recipes}
        onClose={() => setEditTarget(null)}
        onSave={(name, ingredients) => {
          if (editingMeal) update(editingMeal.id, { name, ingredients });
          else if (editTarget) add({ date: editTarget.date, slot: editTarget.slot, name, ingredients });
          setEditTarget(null);
        }}
        onDelete={editingMeal ? () => { remove(editingMeal.id); setEditTarget(null); } : undefined}
      />
    </>
  );
}

function MealSheet({
  open, slot, meal, recipes, onClose, onSave, onDelete,
}: {
  open: boolean;
  slot: MealSlot | null;
  meal?: Meal;
  recipes: Recipe[];
  onClose: () => void;
  onSave: (name: string, ingredients: string) => void;
  onDelete?: () => void;
}) {
  if (!open) return null;
  return (
    <MealSheetInner
      slot={slot}
      meal={meal}
      recipes={recipes}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
    />
  );
}

function MealSheetInner({
  slot, meal, recipes, onClose, onSave, onDelete,
}: {
  slot: MealSlot | null;
  meal?: Meal;
  recipes: Recipe[];
  onClose: () => void;
  onSave: (name: string, ingredients: string) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(meal?.name ?? "");
  const [ingredients, setIngredients] = useState(meal?.ingredients ?? "");

  // Suggest recipes matching this slot first, then the rest.
  const suggestions = [...recipes].sort((a, b) => {
    const am = a.slot === slot ? 0 : 1;
    const bm = b.slot === slot ? 0 : 1;
    return am - bm;
  });

  return (
    <BottomSheet open title={slot ? slot[0].toUpperCase() + slot.slice(1) : "Meal"} onClose={onClose}>
      {suggestions.length > 0 && (
        <div className="field">
          <label className="field__label">From your library</label>
          <ChipRow>
            {suggestions.map((r) => (
              <Chip key={r.id} onClick={() => { setName(r.name); setIngredients(r.ingredients); }}>
                {r.name}
              </Chip>
            ))}
          </ChipRow>
          <button className="hero__name" style={{ fontSize: 13, textDecoration: "underline", marginTop: 2 }}
            onClick={() => navigate("mealsetup")}>
            Manage library
          </button>
        </div>
      )}
      <div className="field">
        <label className="field__label" htmlFor="meal-name">Meal</label>
        <input id="meal-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken salad" />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="meal-ingredients">Ingredients (comma separated)</label>
        <textarea id="meal-ingredients" className="input" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="Chicken breast, Lettuce, Tomato" />
      </div>
      <button className="btn btn--primary" onClick={() => name.trim() && onSave(name.trim(), ingredients)} disabled={!name.trim()}>
        {meal ? "Save" : "Add meal"}
      </button>
      {onDelete && <button className="btn btn--danger" style={{ marginTop: 10 }} onClick={onDelete}>Remove</button>}
    </BottomSheet>
  );
}
