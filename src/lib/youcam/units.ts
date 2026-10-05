// YouCam skin analysis unit costs, per request, by number of concerns (brief 6.3, DECISIONS D-046).
// Failed tasks don't consume units.

export type SkinEngine = "sd" | "hd";

const TIERS: [maxConcerns: number, sd: number, hd: number][] = [
  [4, 9, 12],
  [8, 12, 16],
  [12, 14, 20],
  [16, 16, 22],
];

export function unitCost(engine: SkinEngine, concernCount: number): number {
  if (concernCount <= 0) return 0;
  const tier = TIERS.find(([max]) => concernCount <= max);
  if (!tier) throw new Error("Skin analysis supports at most 16 concerns per request");
  return engine === "hd" ? tier[2] : tier[1];
}

export function sdUnitCost(concernCount: number): number {
  return unitCost("sd", concernCount);
}

/** Skin simulation: 4 units for 1 to 4 concerns, 6 for 5 to 10 (YouCam's docs, DECISIONS D-047). */
export function simulationUnitCost(concernCount: number): number {
  if (concernCount <= 0) return 0;
  if (concernCount <= 4) return 4;
  if (concernCount <= 10) return 6;
  throw new Error("Skin simulation supports at most 10 concerns per request");
}
