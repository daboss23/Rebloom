"use client";

import { useEffect, useState } from "react";

const formatters = {
  int: (n: number) => Math.round(n).toLocaleString("en-US"),
  money: (n: number) => `$${Math.round(n).toLocaleString("en-US")}`,
};

/**
 * A number that counts up once, on arrival. The server renders the final value, so it's right without
 * JavaScript and for screen readers; reduced motion skips the count. After the count, the number simply
 * follows the data (a send, a jump of the clock).
 */
export function CountUp({ value, format = "int", duration = 1200, delay = 0 }: { value: number; format?: keyof typeof formatters; duration?: number; delay?: number }) {
  // How far through the count we are: 1 means settled on the real number.
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const begin = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - begin) / duration));
      // Exponential ease-out: quick at first, settling gently on the real number.
      setProgress(t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, delay]);

  return (
    <>
      <span aria-hidden>{formatters[format](value * progress)}</span>
      <span className="sr-only">{formatters[format](value)}</span>
    </>
  );
}
