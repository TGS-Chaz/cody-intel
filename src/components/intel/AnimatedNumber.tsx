import { useEffect, useRef } from "react";

interface Props {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export default function AnimatedNumber({ value, duration = 1000, prefix = "", suffix = "", decimals = 0 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevValue = useRef(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const start = prevValue.current;
    const startTime = performance.now();

    function update(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (value - start) * eased;
      if (node) node.textContent = `${prefix}${current.toFixed(decimals)}${suffix}`;
      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
    prevValue.current = value;
  }, [value, duration, prefix, suffix, decimals]);

  return (
    <span ref={ref} className="font-mono-data">
      {prefix}{value.toFixed(decimals)}{suffix}
    </span>
  );
}
