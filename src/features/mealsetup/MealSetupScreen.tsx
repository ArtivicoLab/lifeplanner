import { useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { HelpTip } from "../../components/HelpTip";
import { IconMeal, IconPlus, IconTrash } from "../../components/icons";
import { useRecipes } from "../../stores/v2";
import { navigate } from "../../router";
import type { MealSlot, Recipe } from "../../lib/types";

const SLOTS: { value: MealSlot | "any"; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

const slotLabel = (s: MealSlot | "any") =>
  SLOTS.find((x) => x.value === s)?.label ?? "Any";

export function MealSetupScreen() {
  const { items, add, update, remove } = useRecipes();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Recipe | null>(null);

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Your recipe library</div>
        <h1 className="screen-head__title">
          Meal Setup
          <HelpTip text="Build reusable recipes here once, then plan them onto specific days and slots over in Meals." />
        </h1>
      </div>

      <div className="card" style={{ background: "var(--accent-soft)", fontSize: 13 }}>
        Save meals here once, then pick them in the{" "}
        <button className="hero__name" style={{ textDecoration: "underline" }} onClick={() => navigate("meals")}>
          Meal Planner
        </button>{" "}
        with no retyping ingredients.
      </div>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconMeal size={28} />} title="No recipes yet" sub="Build a small library of go-to meals.">
            <button className="btn btn--primary" onClick={() => { setEdit(null); setOpen(true); }}>Add a recipe</button>
          </EmptyState>
        </div>
      ) : (
        <div className="card" style={{ padding: "4px 16px" }}>
          {items.map((r) => (
            <div key={r.id} className="row">
              <button className="row__body" style={{ background: "none", textAlign: "left" }}
                onClick={() => { setEdit(r); setOpen(true); }}>
                <div className="row__title">{r.name}</div>
                <div className="row__sub">{slotLabel(r.slot)} · {r.ingredients || "no ingredients"}</div>
              </button>
              <button className="muted" aria-label={`Delete ${r.name}`} onClick={() => remove(r.id)}>
                <IconTrash size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <button className="fab" aria-label="Add recipe" data-tour="mealsetup-fab" onClick={() => { setEdit(null); setOpen(true); }}>
          <IconPlus />
        </button>
      )}

      <RecipeSheet
        open={open}
        recipe={edit}
        onClose={() => setOpen(false)}
        onSave={(patch) => { edit ? update(edit.id, patch) : add(patch); setOpen(false); }}
      />
    </>
  );
}

function RecipeSheet({
  open, recipe, onClose, onSave,
}: {
  open: boolean;
  recipe: Recipe | null;
  onClose: () => void;
  onSave: (patch: Partial<Recipe>) => void;
}) {
  if (!open) return null;
  return <RecipeSheetInner recipe={recipe} onClose={onClose} onSave={onSave} />;
}

function RecipeSheetInner({
  recipe, onClose, onSave,
}: {
  recipe: Recipe | null;
  onClose: () => void;
  onSave: (patch: Partial<Recipe>) => void;
}) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [ingredients, setIngredients] = useState(recipe?.ingredients ?? "");
  const [slot, setSlot] = useState<MealSlot | "any">(recipe?.slot ?? "any");

  return (
    <BottomSheet open title={recipe ? "Edit recipe" : "New recipe"} onClose={onClose}>
      <div className="field">
        <label className="field__label" htmlFor="recipe-name">Name</label>
        <input id="recipe-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken salad" />
      </div>
      <div className="field">
        <label className="field__label">Default meal</label>
        <ChipRow>
          {SLOTS.map((s) => (
            <Chip key={s.value} active={slot === s.value} onClick={() => setSlot(s.value)}>{s.label}</Chip>
          ))}
        </ChipRow>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="recipe-ingredients">Ingredients (comma separated)</label>
        <textarea id="recipe-ingredients" className="input" value={ingredients} onChange={(e) => setIngredients(e.target.value)}
          placeholder="Chicken breast, Lettuce, Tomato" />
      </div>
      <button className="btn btn--primary" disabled={!name.trim()}
        onClick={() => name.trim() && onSave({ name: name.trim(), ingredients, slot })}>
        {recipe ? "Save" : "Add recipe"}
      </button>
    </BottomSheet>
  );
}
