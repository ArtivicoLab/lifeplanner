// Count-up number (spec §6.1: every number animates on mount, 300ms,
// respects prefers-reduced-motion).
import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function CountUp({ value, duration = 320, format, className }: Props) {
  const [n, setN] = useState(reduced() ? value : 0);
  const raf = useRef<number>();
  const displayed = useRef(reduced() ? value : 0);

  useEffect(() => {
    if (reduced()) {
      displayed.current = value;
      setN(value);
      return;
    }
    const start = performance.now();
    const from = displayed.current;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (value - from) * eased;
      displayed.current = next;
      setN(next);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  const rounded = Math.round(n);
  return <span className={className}>{format ? format(rounded) : rounded}</span>;
}
