"use client";

import { useEffect } from "react";

/**
 * The landing page's entrances (D-100): each headline, its first line and each card plays in once, as it comes well
 * into view. Played on time rather than tied to the scroll position, so it reads at any scrolling speed and in every
 * browser. Without script, or when the reader prefers less motion, nothing is hidden and nothing moves.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.querySelector(".landing");
    if (!root) return;

    const items = [...root.querySelectorAll<HTMLElement>("main h2, main h2 + p, .scroll-rise")];
    // Cards in the same group follow one another; headlines and their lines keep their own order.
    for (const el of items) {
      if (!el.classList.contains("scroll-rise") || !el.parentElement) continue;
      const group = [...el.parentElement.children].filter((c) => c.classList.contains("scroll-rise"));
      el.style.setProperty("--reveal-delay", `${group.indexOf(el) * 110}ms`);
    }
    for (const el of items) if (el.matches("main h2 + p")) el.style.setProperty("--reveal-delay", "140ms");

    // Anything already on screen when the page opens stays as it is; only what's below plays in.
    const below = items.filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.92);
    for (const el of below) el.setAttribute("data-reveal", "");

    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-reveal", "in");
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
