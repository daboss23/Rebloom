import "server-only";
// The faces found on the demo portraits by scripts/demo-landmarks.mjs (DECISIONS D-070). Read from here,
// not stored on each sandbox's scans, so every judge's copy of the demo clients stays small.
import data from "@/data/demo-landmarks.json";
import { SHARED_DEMO_PREFIX } from "@/lib/store/scan-paths";

const LANDMARKS = data as unknown as Record<string, [number, number][]>;

export function hasDemoLandmarks(key: string): boolean {
  return key in LANDMARKS;
}

/** A demo client's face, by their demo key ("priya"), or null. */
export function demoFace(key: string): [number, number][] | null {
  return LANDMARKS[key] ?? null;
}

/** The portrait's landmarks for a demo mask path ("demo/masks/priya/scan-1/pore.png"), or null. */
export function demoLandmarksFor(maskPath: string): [number, number][] | null {
  const key = maskPath.match(new RegExp(`^${SHARED_DEMO_PREFIX}masks/([a-z]+)/`))?.[1];
  return (key && LANDMARKS[key]) || null;
}
