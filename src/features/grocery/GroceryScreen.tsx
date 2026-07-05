import { useMemo, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Checkbox } from "../../components/Checkbox";
import { EmptyState } from "../../components/EmptyState";
import { HelpTip } from "../../components/HelpTip";
import { IconCart, IconClose, IconPlus } from "../../components/icons";
import { useGrocery, GROCERY_CATEGORIES } from "../../stores/v2";
import type { GroceryItem } from "../../lib/types";

const UNITS = ["pc", "cup", "tbsp", "tsp", "oz", "lb", "g", "kg", "ml", "L", "pack", "bottle", "box", "bag", "bunch", "can", "jar"];

export function GroceryScreen() {
  const { items, add, update, remove } = useGrocery();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<GroceryItem | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const c of GROCERY_CATEGORIES) map.set(c, []);
    for (const it of items) {
      const key = map.has(it.category) ? it.category : "Other";
      map.get(key)!.push(it);
    }
    return [...map.entries()].filter(([, arr]) => arr.length > 0);
  }, [items]);

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Auto from your meals</div>
        <h1 className="screen-head__title">
          Grocery
          <HelpTip text="Your shopping list. Items fill in from planned Meals automatically, or add your own by hand. Tap an item to edit its qty, unit, category or notes." />
        </h1>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<IconCart size={28} />} title="List is empty" sub="Add items, or generate from your meal plan.">
            <button className="btn btn--primary" onClick={() => { setEdit(null); setOpen(true); }}>Add an item</button>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="spread" style={{ margin: "4px 2px 8px" }}>
            <span className="muted" style={{ fontSize: 13 }}>{checkedCount}/{items.length} in the cart</span>
            {checkedCount > 0 && (
              <button className="chip" onClick={() => items.filter((i) => i.checked).forEach((i) => remove(i.id))}>
                Clear checked
              </button>
            )}
          </div>
          {grouped.map(([category, arr]) => (
            <div key={category}>
              <div className="section-title">{category}</div>
              <div className="card" style={{ padding: "4px 16px" }}>
                {arr.map((it) => (
                  <div key={it.id} className={`row${it.checked ? " row--done" : ""}`}>
                    <Checkbox checked={it.checked} onChange={() => update(it.id, { checked: !it.checked })} label={it.item} />
                    <button className="row__body" style={{ textAlign: "left", background: "none" }}
                      onClick={() => { setEdit(it); setOpen(true); }}>
                      <div className="row__title">{it.item}</div>
                      {(it.qty || it.unit || it.notes) && (
                        <div className="row__sub">
                          {[it.qty, it.unit].filter(Boolean).join(" ")}
                          {it.notes ? `${it.qty || it.unit ? " · " : ""}${it.notes}` : ""}
                        </div>
                      )}
                    </button>
                    <button className="muted" aria-label={`Delete ${it.item}`} onClick={() => remove(it.id)}><IconClose size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {items.length > 0 && (
        <button className="fab" aria-label="Add item" onClick={() => { setEdit(null); setOpen(true); }}><IconPlus /></button>
      )}

      <GroceryItemSheet
        open={open}
        item={edit}
        onClose={() => setOpen(false)}
        onSave={(patch) => { edit ? update(edit.id, patch) : add({ ...patch, source: "manual" }); setOpen(false); }}
        onDelete={edit ? () => { remove(edit.id); setOpen(false); } : undefined}
      />
    </>
  );
}

function GroceryItemSheet({
  open, item, onClose, onSave, onDelete,
}: {
  open: boolean;
  item: GroceryItem | null;
  onClose: () => void;
  onSave: (patch: Partial<GroceryItem>) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState("Other");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");

  useMemo(() => {
    if (!open) return;
    setName(item?.item ?? "");
    setCat(item?.category ?? "Other");
    setQty(item?.qty ?? "");
    setUnit(item?.unit ?? "");
    setNotes(item?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  function submit() {
    if (!name.trim()) return;
    onSave({ item: name.trim(), category: cat, qty: qty.trim(), unit, notes: notes.trim() });
  }

  return (
    <BottomSheet open={open} title={item ? "Edit item" : "Add item"} onClose={onClose}>
      <div className="field">
        <label className="field__label" htmlFor="grocery-item">Item</label>
        <input id="grocery-item" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="e.g. Eggs" />
      </div>
      <div className="spread" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="field__label" htmlFor="grocery-qty">Qty</label>
          <input id="grocery-qty" className="input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 2" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="field__label" htmlFor="grocery-unit">Unit</label>
          <select id="grocery-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">—</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field__label">Category</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {GROCERY_CATEGORIES.map((c) => (
            <button key={c} className={`chip${cat === c ? " chip--on" : ""}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="grocery-notes">Notes</label>
        <input id="grocery-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. brand, size" />
      </div>
      <button className="btn btn--primary" onClick={submit} disabled={!name.trim()}>{item ? "Save" : "Add"}</button>
      {onDelete && <button className="btn btn--danger" style={{ marginTop: 10 }} onClick={onDelete}>Delete</button>}
    </BottomSheet>
  );
}
