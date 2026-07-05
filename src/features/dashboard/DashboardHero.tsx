// Dashboard hero: live date, ticking clock, and a greeting with an inline-editable
// name. Zero friction — tap the name (or "add your name") to set it; saves instantly.
import { useEffect, useRef, useState } from "react";
import { LiveClock } from "../../components/LiveClock";
import { IconEdit } from "../../components/icons";
import { useSettings } from "../../stores/useSettings";

function greetingWord(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHero({ context }: { context?: string }) {
  const { name, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function save() {
    update({ name: draft.trim() });
    setEditing(false);
  }

  const dateLabel = new Date()
    .toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();

  return (
    <div className="hero">
      <div className="hero__date">{dateLabel}</div>
      <LiveClock />
      <div className="hero__greet">
        {greetingWord()}
        {editing ? (
          <>
            <span>, </span>
            <input
              ref={inputRef}
              className="hero__nameinput"
              value={draft}
              maxLength={24}
              placeholder="your name"
              aria-label="Your name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setDraft(name);
                  setEditing(false);
                }
              }}
            />
          </>
        ) : name ? (
          <button
            className="hero__setname"
            aria-label={`Edit name (${name})`}
            onClick={() => {
              setDraft(name);
              setEditing(true);
            }}
          >
            , {name}
            <IconEdit size={14} className="hero__editicon" />
          </button>
        ) : (
          <button
            className="hero__addname"
            onClick={() => {
              setDraft("");
              setEditing(true);
            }}
          >
            + add your name
          </button>
        )}
      </div>
      {context && <div className="hero__context">{context}</div>}
    </div>
  );
}
