interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  dotColor?: string;
}

export function Chip({ active, onClick, children, dotColor }: ChipProps) {
  return (
    <button
      className={`chip${active ? " chip--on" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {dotColor && (
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: dotColor,
            flex: "none",
          }}
        />
      )}
      {children}
    </button>
  );
}

interface ChipRowProps {
  children: React.ReactNode;
}
export function ChipRow({ children }: ChipRowProps) {
  return <div className="chip-row">{children}</div>;
}
