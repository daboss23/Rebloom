import type { Pt } from "./grid";

/** Face stages are 4 wide by 5 tall unless they say otherwise. */
export const STAGE_RATIO = 1.25;

/**
 * Where a photo sits in a stage `ratio` times as tall as it is wide, in stage widths, so the face fills about
 * `share` of the width and no edge of the stage is left uncovered.
 */
export function framing(points: Pt[], aspect: number, share = 0.52, ratio = STAGE_RATIO) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const width = Math.max(1.02, share / Math.max(0.05, x1 - x0), ratio * aspect * 1.02);
  const height = width / aspect;
  const left = Math.min(0, Math.max(1 - width, 0.5 - width * ((x0 + x1) / 2)));
  const top = Math.min(0, Math.max(ratio - height, ratio * 0.47 - height * ((y0 + y1) / 2)));
  return { left, top, width, height, ratio };
}
export type Framing = ReturnType<typeof framing>;

/** A point on the photo, as a share of the stage's width and height. */
export function onStage([x, y]: Pt | readonly number[], f: Framing): Pt {
  return [f.left + x * f.width, (f.top + y * f.height) / f.ratio];
}

/** The photo's box in the stage, as CSS percentages. */
export function photoBox(f: Framing) {
  const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
  return { left: pct(f.left), top: pct(f.top / f.ratio), width: pct(f.width), height: pct(f.height / f.ratio) };
}
