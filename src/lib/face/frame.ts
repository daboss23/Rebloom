import type { Pt } from "./grid";

/** Face stages are 4 wide by 5 tall. */
export const STAGE_RATIO = 1.25;

/** Where a photo sits in a 4:5 stage, in stage widths, so the face fills about `share` of the width, edges covered. */
export function framing(points: Pt[], aspect: number, share = 0.52) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const width = Math.max(1.02, share / Math.max(0.05, x1 - x0), STAGE_RATIO * aspect * 1.02);
  const height = width / aspect;
  const left = Math.min(0, Math.max(1 - width, 0.5 - width * ((x0 + x1) / 2)));
  const top = Math.min(0, Math.max(STAGE_RATIO - height, STAGE_RATIO * 0.47 - height * ((y0 + y1) / 2)));
  return { left, top, width, height };
}
export type Framing = ReturnType<typeof framing>;

/** A point on the photo, as a share of the stage's width and height. */
export function onStage([x, y]: Pt | readonly number[], f: Framing): Pt {
  return [f.left + x * f.width, (f.top + y * f.height) / STAGE_RATIO];
}
