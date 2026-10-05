// Clinic theming. Each clinic sets one accent; the readable text colour on top of it
// is computed, so no clinic can pick an accent that breaks WCAG contrast.
import type { CSSProperties } from "react";

const INK = "#1C1C1A";
const PORCELAIN = "#F7F4EF";

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Ink or porcelain, whichever reads better on the accent. */
export function onAccent(accentHex: string): string {
  return contrastRatio(accentHex, INK) >= contrastRatio(accentHex, PORCELAIN) ? INK : PORCELAIN;
}

export function clinicThemeStyle(accentHex: string): CSSProperties {
  return { "--clinic-accent": accentHex, "--clinic-on-accent": onAccent(accentHex) } as CSSProperties;
}
