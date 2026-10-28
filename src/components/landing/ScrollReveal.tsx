"use client";

import { useEffect } from "react";

/** Cards in the same group follow one another by this much. */
const STAGGER_MS = 140;

/**
 * The landing page's entrances (D-100): each headline, its first line and each piece marked `data-motion` plays in
 * once, as it comes well into view; the styles give every section its own way of arriving. Played on time rather
 * than tied to the scroll position, so it reads at any speed and in every browser. Without script, or when the
 * reader prefers less motion, nothing is hidden and nothing moves.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.querySelector(".landing");
    if (!root) return;

    const items = [...root.querySelectorAll<HTMLElement>("main h2, main h2 + p, [data-motion]")];
    for (const el of items) {
      const motion = el.dataset.motion;
      if (el.matches("main h2 + p")) el.style.setProperty("--reveal-delay", "160ms");
      else if (motion && el.parentElement && el.tagName !== "H2") {
        // Siblings that arrive together, arrive in order.
        const group = [...el.parentElement.children].filter((c) => (c as HTMLElement).dataset.motion);
        el.style.setProperty("--reveal-delay", `${group.indexOf(el) * STAGGER_MS}ms`);
      }
    }

    // Anything already on screen when the page opens stays as it is; only what's below plays in.
    const below = items.filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.92);
    for (const el of below) el.setAttribute("data-reveal", "");

    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-reveal", "in");
          for (const n of e.target.querySelectorAll<HTMLElement>("[data-count]")) countUp(n);
          seen.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -14% 0px" },
    );
    for (const el of below) seen.observe(el);
    return () => seen.disconnect();
  }, []);

  return null;
}

/** A figure counts up to itself, easing out. */
function countUp(el: HTMLElement) {
  const to = Number(el.dataset.count);
  if (!Number.isFinite(to)) return;
  const start = performance.now() + 250;
  const length = 1400;
  const frame = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / length));
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - t, 4))));
    if (t < 1) requestAnimationFrame(frame);
  };
  el.textContent = "0";
  requestAnimationFrame(frame);
}
