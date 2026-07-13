// Universal quick-add for the Calendar: type anything, we guess which domain
// it belongs to (Task/Habit/Goal/Fund/Debt/Meal/Grocery/Workout/Weight/
// Hydration/Bill) and show a pill so the guess can be corrected before saving.
import { useMemo, useRef, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { useSettings } from "../../stores/useSettings";
import { useToast } from "../../stores/useToast";
import { navigate } from "../../router";
import { categoryColor } from "../../lib/ui";
import { fromISO, format, todayISO } from "../../lib/dates";
import { IconTag } from "../../components/icons";
import { GROCERY_CATEGORIES } from "../../stores/v2";
import {
  CAPTURE_DOMAINS,
  DOMAIN_META,
  MONEY_KIND_LABEL,
  commitCapture,
  parseCapture,
  type CaptureDomain,
} from "../../lib/capture";

interface QuickCaptureProps {
  date: string;
  placeholder?: string;
  className?: string;
  inputStyle?: React.CSSProperties;
  compact?: boolean;
  /** Seed the input (used by the coach tour to demo the pickers). */
  initialDraft?: string;
  /** Demo mode for the coach tour: shows the pickers but never commits/closes. */
  demo?: boolean;
  /** Called on Escape, or on blur after a successful (or empty) commit. */
  onClose: () => void;
}

export function QuickCapture({ date, placeholder = "Type anything…", className, inputStyle, compact, initialDraft, demo, onClose }: QuickCaptureProps) {
  const { categories } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [overrideDomain, setOverrideDomain] = useState<CaptureDomain | null>(null);
  const [pendingAmount, setPendingAmount] = useState("");
  const [category, setCategory] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catPickerOpen, setCatPickerOpen] = useState(false);

  const parsed = useMemo(() => parseCapture(draft), [draft]);
  const domain = overrideDomain ?? parsed.domain;
  const meta = DOMAIN_META[domain];
  const Icon = meta.icon;

  const needsAmount = domain === "weight" || domain === "hydration";
  // Whether the field should be MOUNTED depends only on the main text (not on
  // what's being typed into the field itself — that would unmount it mid-type).
  const showAmountField = needsAmount && draft.trim() !== "" && parsed.amount == null;
  const showCategoryPicker = (domain === "task" || domain === "money") && draft.trim() !== "";
  const showGroceryCategoryPicker = domain === "grocery" && draft.trim() !== "";
  const catOptions = domain === "grocery" ? GROCERY_CATEGORIES : categories;

  function resetDraft() {
    setDraft("");
    setOverrideDomain(null);
    setPendingAmount("");
    setCategory("");
  }

  function submit(collapseAfter: boolean) {
    if (demo) return; // coach demo: pickers are live to explore, but nothing saves
    const t = draft.trim();
    if (!t) {
      if (collapseAfter) onClose();
      return;
    }
    const pendingNum = pendingAmount.trim() !== "" ? Number(pendingAmount) : undefined;
    const amount = pendingNum != null && Number.isFinite(pendingNum) ? pendingNum : undefined;
    const result = commitCapture(parsed, date, overrideDomain ?? undefined, amount, category || undefined);
    if (!result.ok) return; // needs a number — leave the row open with the amount field showing
    // Confirm what was added and where it landed. Entries filed by date can
    // hide on a screen that opens on today, so name the day and offer a jump.
    const label = result.moneyKind ? MONEY_KIND_LABEL[result.moneyKind] : DOMAIN_META[result.domain].label;
    const onDate = result.dateBased && result.date && result.date !== todayISO();
    useToast.getState().show({
      message: onDate
        ? `${label} added · ${format(fromISO(result.date), "MMM d")}`
        : `${label} added`,
      actionLabel: "View",
      onAction: () => {
        const query: Record<string, string> = {};
        if (result.date) query.date = result.date;
        if (result.id) query.id = result.id;
        navigate(result.route, Object.keys(query).length ? query : undefined);
      },
    });
    resetDraft();
    if (collapseAfter) onClose();
  }

  function cancel() {
    if (demo) return; // the coach tour owns closing the demo
    resetDraft();
    onClose();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
        <input
          ref={inputRef}
          className={className}
          autoFocus={!demo}
          value={draft}
          placeholder={placeholder}
          aria-label={`Quick add an item for ${date}`}
          readOnly={demo}
          style={{ flex: 1, minWidth: 0, ...inputStyle }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(false);
            if (e.key === "Escape") cancel();
          }}
          onBlur={() => { if (!pickerOpen && !catPickerOpen) submit(true); }}
        />
        <span className="qc-pickers" data-tour="capture-pickers">
          {draft.trim() !== "" && (
            <button
              type="button"
              className="chip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPickerOpen(true)}
              style={{ padding: 2, flex: "none" }}
              aria-label={`Detected: ${meta.label}. Tap to change.`}
              title={`Detected: ${meta.label}`}
            >
              <span className="qc-badge" style={{ background: meta.color }}>
                <Icon size={13} />
              </span>
              {!compact && <span>{meta.label}</span>}
            </button>
          )}
          {(showCategoryPicker || showGroceryCategoryPicker) && (
            <button
              type="button"
              className="chip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setCatPickerOpen(true)}
              style={{ padding: 2, flex: "none" }}
              aria-label={category ? `Category: ${category}. Tap to change.` : "Pick a category"}
              title={category || "Pick a category"}
            >
              <span className="qc-badge" style={{ background: category ? categoryColor(category) : "var(--surface-2)" }}>
                <IconTag size={13} />
              </span>
              {!compact && <span>{category || "Category"}</span>}
            </button>
          )}
        </span>
      </div>

      {showAmountField && (
        <input
          type="number"
          inputMode="decimal"
          autoFocus
          className={className}
          placeholder={domain === "weight" ? "Enter weight…" : "Enter ml…"}
          aria-label={domain === "weight" ? "Enter weight" : "Enter amount in ml"}
          value={pendingAmount}
          onChange={(e) => setPendingAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(false);
            if (e.key === "Escape") cancel();
          }}
          onBlur={() => { if (!pickerOpen && !catPickerOpen) submit(true); }}
        />
      )}

      <BottomSheet open={pickerOpen} title="Add as…" onClose={() => { setPickerOpen(false); inputRef.current?.focus(); }}>
        <ChipRow>
          {CAPTURE_DOMAINS.map((d) => (
            <Chip
              key={d}
              dotColor={DOMAIN_META[d].color}
              active={d === domain}
              onClick={() => { setOverrideDomain(d); setPickerOpen(false); inputRef.current?.focus(); }}
            >
              {DOMAIN_META[d].label}
            </Chip>
          ))}
        </ChipRow>
      </BottomSheet>

      <BottomSheet
        open={catPickerOpen}
        title={domain === "grocery" ? "Aisle" : "Category"}
        onClose={() => { setCatPickerOpen(false); inputRef.current?.focus(); }}
      >
        <ChipRow>
          {catOptions.map((c) => (
            <Chip
              key={c}
              dotColor={categoryColor(c)}
              active={c === category}
              onClick={() => { setCategory(c); setCatPickerOpen(false); inputRef.current?.focus(); }}
            >
              {c}
            </Chip>
          ))}
        </ChipRow>
      </BottomSheet>
    </div>
  );
}
