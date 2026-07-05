// Universal quick-add for the Calendar: type anything, we guess which domain
// it belongs to (Task/Habit/Goal/Fund/Debt/Meal/Grocery/Workout/Weight/
// Hydration/Bill) and show a pill so the guess can be corrected before saving.
import { useMemo, useRef, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { useSettings } from "../../stores/useSettings";
import { categoryColor } from "../../lib/ui";
import {
  CAPTURE_DOMAINS,
  DOMAIN_META,
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
  /** Called on Escape, or on blur after a successful (or empty) commit. */
  onClose: () => void;
}

export function QuickCapture({ date, placeholder = "Type anything…", className, inputStyle, compact, onClose }: QuickCaptureProps) {
  const { categories } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [overrideDomain, setOverrideDomain] = useState<CaptureDomain | null>(null);
  const [pendingAmount, setPendingAmount] = useState("");
  const [category, setCategory] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const parsed = useMemo(() => parseCapture(draft), [draft]);
  const domain = overrideDomain ?? parsed.domain;
  const meta = DOMAIN_META[domain];
  const Icon = meta.icon;

  const needsAmount = domain === "weight" || domain === "hydration";
  // Whether the field should be MOUNTED depends only on the main text (not on
  // what's being typed into the field itself — that would unmount it mid-type).
  const showAmountField = needsAmount && draft.trim() !== "" && parsed.amount == null;
  const showCategoryPicker = domain === "task" && draft.trim() !== "";

  function resetDraft() {
    setDraft("");
    setOverrideDomain(null);
    setPendingAmount("");
    setCategory("");
  }

  function submit(collapseAfter: boolean) {
    const t = draft.trim();
    if (!t) {
      if (collapseAfter) onClose();
      return;
    }
    const pendingNum = pendingAmount.trim() !== "" ? Number(pendingAmount) : undefined;
    const amount = pendingNum != null && Number.isFinite(pendingNum) ? pendingNum : undefined;
    const result = commitCapture(parsed, date, overrideDomain ?? undefined, amount, category || undefined);
    if (!result.ok) return; // needs a number — leave the row open with the amount field showing
    resetDraft();
    if (collapseAfter) onClose();
  }

  function cancel() {
    resetDraft();
    onClose();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
        <input
          ref={inputRef}
          className={className}
          autoFocus
          value={draft}
          placeholder={placeholder}
          aria-label={`Quick add an item for ${date}`}
          style={{ flex: 1, minWidth: 0, ...inputStyle }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(false);
            if (e.key === "Escape") cancel();
          }}
          onBlur={() => { if (!pickerOpen) submit(true); }}
        />
        {draft.trim() !== "" && (
          <button
            type="button"
            className="chip"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPickerOpen(true)}
            style={{ padding: compact ? "2px 5px" : "5px 10px", flex: "none" }}
            aria-label={`Detected: ${meta.label}. Tap to change.`}
            title={`Detected: ${meta.label}`}
          >
            <Icon size={compact ? 11 : 13} style={{ color: meta.color, flex: "none" }} />
            {!compact && <span>{meta.label}</span>}
          </button>
        )}
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
          onBlur={() => { if (!pickerOpen) submit(true); }}
        />
      )}

      {showCategoryPicker && (
        <div className="chip-row" style={{ marginTop: 2 }}>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip${(category || "Home") === c ? " chip--on" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setCategory(c)}
              style={{ padding: compact ? "3px 8px" : "5px 10px", fontSize: compact ? 11 : undefined }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: categoryColor(c), flex: "none" }} />
              {c}
            </button>
          ))}
        </div>
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
    </div>
  );
}
